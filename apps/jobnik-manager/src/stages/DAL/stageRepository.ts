import { inject, Lifecycle, scoped } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { and, eq, max, sql, type SQL } from 'drizzle-orm';
import { DEFAULT_PAGE_SIZE, paginationParamsToOffsetAndLimit } from '@map-colonies/drizzle-utils';
import type { JobId, StageId } from 'jobnik-openapi';
import { SERVICES } from '@src/common/constants';
import type { Drizzle, DrizzleTx } from '@src/db/drizzle';
import { stageTable } from '@src/db/entities';
import { StageOperationStatus } from '@src/db/persistenceModel';
import type { PaginatedResult } from '@src/common/utils/pagination';
import type { StageEntity, StageEntityOptions, StageFindCriteriaArg, StageRow, StageSummary, UpdateSummaryCount } from '../models/models';
import { summaryCountsMapper, taskOperationStatusWithTotal } from '../models/helper';

const DEFAULT_PAGE = 1;

@scoped(Lifecycle.ContainerScoped)
export class StageRepository {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.DRIZZLE) private readonly drizzle: Drizzle
  ) {}

  /**
   * Finds a page of stages matching the optional filters, ordered by id.
   * @param criteria - the stage search query params; filters that are not set are ignored
   * @returns the page of stages, with their tasks when requested, and the total number of matching stages
   */
  public async findStages(criteria: StageFindCriteriaArg): Promise<PaginatedResult<StageRow[]>> {
    const {
      page = DEFAULT_PAGE,
      page_size: pageSize = DEFAULT_PAGE_SIZE,
      job_id: jobId,
      stage_type: type,
      stage_operation_status: status,
      should_return_tasks: shouldReturnTasks,
    } = criteria ?? {};

    // A function of the table, because the relational query aliases it.
    const filter = (table: typeof stageTable): SQL =>
      and(
        jobId !== undefined ? eq(table.jobId, jobId) : undefined,
        type !== undefined ? eq(table.type, type) : undefined,
        status !== undefined ? eq(table.status, status) : undefined
      ) ?? sql`true`;

    const { limit, offset } = paginationParamsToOffsetAndLimit({ page, pageSize });

    const itemsQuery = this.drizzle.query.stage.findMany({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      where: { RAW: filter },
      with: { tasks: shouldReturnTasks === true ? true : undefined },
      orderBy: { id: 'asc' },
      limit,
      offset,
    });

    const [items, total] = await Promise.all([itemsQuery, this.drizzle.$count(stageTable, filter(stageTable))]);

    return { total, items };
  }

  /**
   * Finds a stage together with its tasks and/or job.
   * @param stageId - unique identifier of the stage
   * @param options - which relations to load, and an optional transaction to run the query in
   * @returns the stage with the requested relations, or undefined if it doesn't exist
   */
  public async findStageWithRelationsById<T extends StageEntityOptions>(stageId: StageId, options: T): Promise<StageEntity<T> | undefined> {
    const stage = await (options.tx ?? this.drizzle).query.stage.findFirst({
      where: { id: { eq: stageId } },
      with: { tasks: options.includeTasks === true ? true : undefined, job: options.includeJob === true ? true : undefined },
    });

    return stage;
  }

  /**
   * Finds the stages of a job, ordered by their order in the job.
   * @param jobId - unique identifier of the job
   * @param includeTasks - whether to load the tasks of each stage
   * @returns the stages of the job
   */
  public async findStagesByJobId(jobId: JobId, includeTasks?: boolean): Promise<StageRow[]> {
    return this.drizzle.query.stage.findMany({
      where: { jobId: { eq: jobId } },
      with: { tasks: includeTasks === true ? true : undefined },
      orderBy: { order: 'asc' },
    });
  }

  /**
   * Finds the highest stage order of a job.
   * @param jobId - unique identifier of the job
   * @returns the highest order, or null if the job has no stages
   */
  public async findMaxStageOrder(jobId: JobId): Promise<number | null> {
    const [result] = await this.drizzle
      .select({ maxOrder: max(stageTable.order) })
      .from(stageTable)
      .where(eq(stageTable.jobId, jobId));

    return result?.maxOrder ?? null;
  }

  /**
   * Counts the stages of a job and how many of them are completed.
   * @param jobId - unique identifier of the job
   * @param tx - transaction to run the queries in
   * @returns the total and completed stage counts
   */
  public async countStagesByJobId(jobId: JobId, tx: DrizzleTx): Promise<{ totalStages: number; completedStages: number }> {
    const [totalStages, completedStages] = await Promise.all([
      tx.$count(stageTable, eq(stageTable.jobId, jobId)),
      tx.$count(stageTable, and(eq(stageTable.jobId, jobId), eq(stageTable.status, StageOperationStatus.COMPLETED))),
    ]);

    return { totalStages, completedStages };
  }

  /**
   * Atomically adjusts the task counts in a stage summary.
   * @param stageId - unique identifier of the stage
   * @param summaryPayload - the counts to add and, optionally, remove
   * @param tx - transaction to run the update in
   * @returns the updated summary
   */
  public async updateStageSummary(stageId: StageId, summaryPayload: UpdateSummaryCount, tx: DrizzleTx): Promise<StageSummary> {
    const addStatus = summaryCountsMapper[summaryPayload.add.status];
    const addCount = summaryPayload.add.count;

    this.logger.debug({ msg: `Updating stage summary`, stageId, summaryPayload });

    const summary = stageTable.summary;
    let summaryUpdate: SQL;
    if (summaryPayload.remove) {
      // Move counts from the 'remove' status to the 'add' status
      const removeStatus = summaryCountsMapper[summaryPayload.remove.status];
      const removeCount = summaryPayload.remove.count;

      summaryUpdate = sql`${summary} || jsonb_build_object(
        ${addStatus}::text,
        (${summary}->>${addStatus}::text)::integer + ${addCount},
        ${removeStatus}::text,
        (${summary}->>${removeStatus}::text)::integer - ${removeCount}
      )`;
    } else {
      // Add to the 'add' status and to the total count
      const totalCount = summaryCountsMapper[taskOperationStatusWithTotal.TOTAL];
      summaryUpdate = sql`${summary} || jsonb_build_object(
        ${addStatus}::text,
        (${summary}->>${addStatus}::text)::integer + ${addCount},
        ${totalCount}::text,
        (${summary}->>${totalCount}::text)::integer + ${addCount}
      )`;
    }

    const [updated] = await tx.update(stageTable).set({ summary: summaryUpdate }).where(eq(stageTable.id, stageId)).returning({ summary });

    /* v8 ignore start -- @preserve */
    if (!updated) {
      throw new Error('Failed to update stage summary: No summary returned from database.');
    }
    /* v8 ignore stop -- @preserve */

    return updated.summary;
  }
}
