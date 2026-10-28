import { inject, Lifecycle, scoped } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { and, eq, max, relationsFilterToSQL, sql, type SQL } from 'drizzle-orm';
import { DEFAULT_PAGE_SIZE, paginationParamsToOffsetAndLimit } from '@map-colonies/drizzle-utils';
import type { JobId, StageId } from 'jobnik-openapi';
import { SERVICES } from '@src/common/constants';
import type { Drizzle, DrizzleTx, TableFilter } from '@src/db/drizzle';
import { stageTable } from '@src/db/entities';
import { StageOperationStatus } from '@src/db/persistenceModel';
import type { PaginatedResult } from '@src/common/utils/pagination';
import type { StageRowWithRelations, StageRowOptions, StageRow, StageSearchParams, StageSummary, UpdateSummaryCount } from '../models/models';
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
   * @param params - the search criteria; filters that are not set are ignored
   * @returns the page of stages, with their tasks when requested, and the total number of matching stages
   */
  public async findStages(params: StageSearchParams): Promise<PaginatedResult<StageRow[]>> {
    const { page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE, jobId, type, status, includeTasks } = params;

    // Relational filters skip undefined values, so unset criteria don't filter.
    // The branded job id goes through `eq`, as the filter's types don't accept a branded id as a plain value.
    const where = { jobId: { eq: jobId }, type, status } satisfies TableFilter<'stage'>;

    const { limit, offset } = paginationParamsToOffsetAndLimit({ page, pageSize });

    const itemsQuery = this.drizzle.query.stage.findMany({
      where,
      with: { tasks: includeTasks === true ? true : undefined },
      orderBy: { id: 'asc' },
      limit,
      offset,
    });

    const [items, total] = await Promise.all([itemsQuery, this.drizzle.$count(stageTable, relationsFilterToSQL(stageTable, where))]);

    return { total, items };
  }

  /**
   * Finds a stage by its id, optionally together with its tasks and/or job.
   * @param stageId - unique identifier of the stage
   * @param options - which relations to load, and an optional transaction to run the query in
   * @returns the stage, with the requested relations, or undefined if it doesn't exist
   */
  public async findStageById<T extends StageRowOptions>(stageId: StageId, options: T): Promise<StageRowWithRelations<T> | undefined> {
    return (options.tx ?? this.drizzle).query.stage.findFirst({
      where: { id: { eq: stageId } },
      with: { tasks: options.includeTasks === true ? true : undefined, job: options.includeJob === true ? true : undefined },
    });
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
