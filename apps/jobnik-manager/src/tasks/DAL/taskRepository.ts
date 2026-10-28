import { inject, Lifecycle, scoped } from 'tsyringe';
import { and, asc, eq, inArray, relationsFilterToSQL } from 'drizzle-orm';
import type { TaskId } from 'jobnik-openapi';
import { DEFAULT_PAGE_SIZE, paginationParamsToOffsetAndLimit } from '@map-colonies/drizzle-utils';
import { SERVICES } from '@src/common/constants';
import type { Drizzle, DrizzleTx, TaskFilter } from '@src/db/drizzle';
import { jobTable, relations, stageTable, taskTable } from '@src/db/entities';
import { JobOperationStatus, StageOperationStatus, TaskOperationStatus, type NewTask, type Task } from '@src/db/persistenceModel';
import type { PaginatedResult } from '@src/common/utils/pagination';
import type { TaskSearchParams } from '../models/models';

const DEFAULT_PAGE = 1;

const DEQUEUE_TASK_STATUSES = [TaskOperationStatus.PENDING, TaskOperationStatus.RETRIED];
const DEQUEUE_STAGE_STATUSES = [StageOperationStatus.PENDING, StageOperationStatus.IN_PROGRESS];
const DEQUEUE_JOB_STATUSES = [JobOperationStatus.PENDING, JobOperationStatus.IN_PROGRESS];

@scoped(Lifecycle.ContainerScoped)
export class TaskRepository {
  public constructor(@inject(SERVICES.DRIZZLE) private readonly drizzle: Drizzle) {}

  /**
   * Finds a page of tasks matching the optional filters, ordered by creation time.
   * @param params - the search criteria; filters that are not set are ignored
   * @returns the page of tasks and the total number of matching tasks
   */
  public async findTasks(params: TaskSearchParams): Promise<PaginatedResult<Task[]>> {
    const { page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE, stageId, stageType, status, fromDate, endDate } = params;

    // Relational filters skip undefined values, so unset criteria don't filter.
    // The branded stage id goes through `eq`, as the filter can't tell it apart from an operator object.
    const where = {
      stageId: { eq: stageId },
      stage: stageType !== undefined ? { type: stageType } : undefined,
      status,
      creationTime: { gte: fromDate, lte: endDate },
    } satisfies TaskFilter;

    const { limit, offset } = paginationParamsToOffsetAndLimit({ page, pageSize });

    const itemsQuery = this.drizzle.query.task.findMany({
      where,
      orderBy: { creationTime: 'asc' },
      limit,
      offset,
    });

    // The stage filter is a relation, so the count needs the relations config to build it.
    const countFilter = relationsFilterToSQL(taskTable, where, relations.task.relations, relations);
    const [items, total] = await Promise.all([itemsQuery, this.drizzle.$count(taskTable, countFilter)]);

    return { total, items };
  }

  /**
   * Updates a task only if its status is still the expected one, guarding against concurrent status changes.
   * @param taskId - unique identifier of the task
   * @param previousStatus - the status the task is expected to have
   * @param values - the columns to update
   * @param tx - the transaction to run the update in
   * @returns the updated task, or undefined if the task's status was changed by someone else
   */
  public async updateTaskIfStatusUnchanged(
    taskId: TaskId,
    previousStatus: TaskOperationStatus,
    values: Partial<NewTask>,
    tx: DrizzleTx
  ): Promise<Task | undefined> {
    const [task] = await tx
      .update(taskTable)
      .set(values)
      .where(and(eq(taskTable.id, taskId), eq(taskTable.status, previousStatus)))
      .returning();

    return task;
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
