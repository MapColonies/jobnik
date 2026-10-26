import { inject, Lifecycle, scoped } from 'tsyringe';
import { and, asc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { DEFAULT_PAGE_SIZE, paginationParamsToOffsetAndLimit } from '@map-colonies/drizzle-utils';
import { SERVICES } from '@src/common/constants';
import type { Drizzle, DrizzleTx } from '@src/db/drizzle';
import { jobTable, stageTable, taskTable } from '@src/db/entities';
import { JobOperationStatus, StageOperationStatus, TaskOperationStatus, type Task } from '@src/db/persistenceModel';
import type { PaginatedResult } from '@src/common/utils/pagination';
import type { TasksFindCriteriaArg } from '../models/models';

const DEFAULT_PAGE = 1;

const DEQUEUE_TASK_STATUSES = [TaskOperationStatus.PENDING, TaskOperationStatus.RETRIED];
const DEQUEUE_STAGE_STATUSES = [StageOperationStatus.PENDING, StageOperationStatus.IN_PROGRESS];
const DEQUEUE_JOB_STATUSES = [JobOperationStatus.PENDING, JobOperationStatus.IN_PROGRESS];

@scoped(Lifecycle.ContainerScoped)
export class TaskRepository {
  public constructor(@inject(SERVICES.DRIZZLE) private readonly drizzle: Drizzle) {}

  /**
   * Finds a page of tasks matching the optional filters, ordered by creation time.
   * @param criteria - the task search query params; filters that are not set are ignored
   * @returns the page of tasks and the total number of matching tasks
   */
  public async findTasks(criteria: TasksFindCriteriaArg): Promise<PaginatedResult<Task[]>> {
    const {
      page = DEFAULT_PAGE,
      page_size: pageSize = DEFAULT_PAGE_SIZE,
      stage_id: stageId,
      stage_type: stageType,
      status,
      from_date: fromDate,
      end_date: endDate,
    } = criteria ?? {};

    // A function of the table, because the relational query aliases it.
    const filter = (table: typeof taskTable): SQL =>
      and(
        stageId !== undefined ? eq(table.stageId, stageId) : undefined,
        stageType !== undefined
          ? inArray(table.stageId, this.drizzle.select({ id: stageTable.id }).from(stageTable).where(eq(stageTable.type, stageType)))
          : undefined,
        status !== undefined ? eq(table.status, status) : undefined,
        fromDate !== undefined ? gte(table.creationTime, new Date(fromDate)) : undefined,
        endDate !== undefined ? lte(table.creationTime, new Date(endDate)) : undefined
      ) ?? sql`true`;

    const { limit, offset } = paginationParamsToOffsetAndLimit({ page, pageSize });

    const itemsQuery = this.drizzle.query.task.findMany({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      where: { RAW: filter },
      orderBy: { creationTime: 'asc' },
      limit,
      offset,
    });

    const [items, total] = await Promise.all([itemsQuery, this.drizzle.$count(taskTable, filter(taskTable))]);

    return { total, items };
  }

  /**
   * Finds and locks the next eligible task of the highest job priority.
   * Uses a row-level lock with `SKIP LOCKED` so concurrent workers claim different tasks without blocking each other.
   * @param stageType - the stage type to pull tasks from
   * @param tx - the transaction holding the lock
   * @returns the locked task, or undefined if no eligible task is found
   */
  public async findAndLockTaskForDequeue(stageType: string, tx: DrizzleTx): Promise<Task | undefined> {
    // The priority enum is declared from VERY_HIGH to VERY_LOW, so ascending order puts the highest priority first.
    const [row] = await tx
      .select({ task: taskTable })
      .from(taskTable)
      .innerJoin(stageTable, eq(taskTable.stageId, stageTable.id))
      .innerJoin(jobTable, eq(stageTable.jobId, jobTable.id))
      .where(
        and(
          eq(stageTable.type, stageType),
          inArray(taskTable.status, DEQUEUE_TASK_STATUSES),
          inArray(stageTable.status, DEQUEUE_STAGE_STATUSES),
          inArray(jobTable.status, DEQUEUE_JOB_STATUSES)
        )
      )
      .orderBy(asc(jobTable.priority))
      .limit(1)
      .for('update', { of: taskTable, skipLocked: true });

    return row?.task;
  }
}
