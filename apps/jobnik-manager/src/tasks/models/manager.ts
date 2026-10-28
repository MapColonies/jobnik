import type { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { createActor } from 'xstate';
import { trace, type Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/tracing-utils';
import { subMinutes } from 'date-fns';
import { INFRA_CONVENTIONS } from '@map-colonies/semantic-conventions';
import type { StageId, TaskId } from 'jobnik-openapi';
import {
  NotAllowedToAddTasksToInProgressStageError,
  StageInFiniteStateError,
  StageNotFoundError,
  TaskNotFoundError,
  TaskStatusUpdateFailedError,
} from 'jobnik-openapi';
import { eq } from 'drizzle-orm';
import { SERVICES, XSTATE_DONE_STATE } from '@common/constants';
import { resolveTraceContext } from '@src/common/utils/tracingHelpers';
import { StageManager } from '@src/stages/models/manager';
import { errorMessages as stagesErrorMessages } from '@src/stages/models/errors';
import { taskStateMachine, updateTaskMachineState } from '@src/tasks/models/taskStateMachine';
import { stageStateMachine } from '@src/stages/models/stageStateMachine';
import { type ConfigType } from '@src/common/config';
import type { UpdateSummaryCount } from '@src/stages/models/models';
import type { Drizzle, DrizzleTx } from '@src/db/drizzle';
import { taskTable } from '@src/db/entities';
import { ATTR_MESSAGING_DESTINATION_NAME, ATTR_MESSAGING_MESSAGE_ID } from '@src/common/semconv';
import { type NewTask, type Task, StageOperationStatus, TaskOperationStatus } from '@src/db/persistenceModel';
import { TaskRepository } from '../DAL/taskRepository';
import type { TasksFindCriteriaArg, TaskModel, TaskCreateModel, TasksPaginatedResponse, TasksByStageIdQuery } from './models';
import { errorMessages as tasksErrorMessages } from './errors';
import { convertArrayTaskRowToResponse, convertTaskRowToResponse } from './helper';

@injectable()
export class TaskManager {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.DRIZZLE) private readonly drizzle: Drizzle,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(StageManager) private readonly stageManager: StageManager,
    @inject(SERVICES.CONFIG) private readonly config: ConfigType,
    @inject(TaskRepository) private readonly taskRepository: TaskRepository
  ) {}

  @withSpanAsyncV4
  public async addTasks(stageId: StageId, tasksPayload: TaskCreateModel[]): Promise<TaskModel[]> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: stageId,
    });

    const createTaskActor = createActor(taskStateMachine).start();
    createTaskActor.send({ type: 'pend' });
    const persistenceSnapshot = createTaskActor.getPersistedSnapshot();

    const stage = await this.stageManager.getStageRowById(stageId);

    if (!stage) {
      this.logger.error(`Failed adding tasks to stage, stage not exists`);
      throw new StageNotFoundError(stagesErrorMessages.stageNotFound);
    }

    const checkStageStatus = createActor(stageStateMachine, { snapshot: stage.xstate }).start();

    // can't add tasks to finite stages (final states)
    if (checkStageStatus.getSnapshot().status === XSTATE_DONE_STATE) {
      this.logger.error(`Failed adding tasks to stage, not allowed on finite state of stage`);
      throw new StageInFiniteStateError(stagesErrorMessages.stageAlreadyFinishedTasksError);
    }

    if (checkStageStatus.getSnapshot().value === StageOperationStatus.IN_PROGRESS) {
      this.logger.error(`Failed adding tasks to stage, not allowed on running stage`);
      throw new NotAllowedToAddTasksToInProgressStageError(tasksErrorMessages.addTaskNotAllowed);
    }

    const taskInput = tasksPayload.map((taskData) => {
      const { traceparent, tracestate } = resolveTraceContext(taskData);

      return {
        attempts: 0,
        maxAttempts: taskData.maxAttempts,
        data: taskData.data,
        xstate: persistenceSnapshot,
        userMetadata: taskData.userMetadata,
        status: TaskOperationStatus.PENDING,
        stageId,
        traceparent,
        tracestate,
      } satisfies NewTask;
    });

    try {
      const tasks = await this.drizzle.transaction(async (tx) => {
        const tasks = await tx.insert(taskTable).values(taskInput).returning();

        const updateSummaryPayload: UpdateSummaryCount = {
          add: { status: TaskOperationStatus.PENDING, count: tasks.length },
        };

        await this.stageManager.updateStageProgressFromTaskChanges(stageId, updateSummaryPayload, tx);
        return tasks;
      });

      return convertArrayTaskRowToResponse(tasks);
    } catch (error) {
      this.logger.error(`Failed adding tasks to stage with error: ${(error as Error).message}`);

      throw error;
    }
  }

  /**
   * Retrieves tasks based on filtering criteria
   * @param params - Optional filtering parameters for tasks
   * @returns Promise resolving to array of task models
   */
  @withSpanAsyncV4
  public async getTasks(params: TasksFindCriteriaArg): Promise<TasksPaginatedResponse> {
    const { total, items: tasks } = await this.taskRepository.findTasks({
      stageId: params?.stage_id,
      stageType: params?.stage_type,
      status: params?.status,
      fromDate: params?.from_date !== undefined ? new Date(params.from_date) : undefined,
      endDate: params?.end_date !== undefined ? new Date(params.end_date) : undefined,
      page: params?.page,
      pageSize: params?.page_size,
    });

    return { total, items: convertArrayTaskRowToResponse(tasks) };
  }

  @withSpanAsyncV4
  public async getTaskById(taskId: TaskId): Promise<TaskModel> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_ID]: taskId,
    });

    const task = await this.getTaskRowById(taskId);

    if (!task) {
      throw new TaskNotFoundError(tasksErrorMessages.taskNotFound);
    }

    return convertTaskRowToResponse(task);
  }

  @withSpanAsyncV4
  public async getTasksByStageId(stageId: StageId, query: TasksByStageIdQuery): Promise<TasksPaginatedResponse> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: stageId,
    });
    // To validate existence of stage, if not will throw StageNotFoundError
    await this.stageManager.getStageById(stageId);

    const { total, items: tasks } = await this.taskRepository.findTasks({ stageId, page: query?.page, pageSize: query?.page_size });

    const items = convertArrayTaskRowToResponse(tasks);
    return { total, items };
  }

  @withSpanAsyncV4
  public async updateUserMetadata(taskId: TaskId, userMetadata: Record<string, unknown>): Promise<void> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_ID]: taskId,
    });

    const updatedTasks = await this.drizzle.update(taskTable).set({ userMetadata }).where(eq(taskTable.id, taskId)).returning({ id: taskTable.id });

    if (updatedTasks.length === 0) {
      throw new TaskNotFoundError(tasksErrorMessages.taskNotFound);
    }
  }

  @withSpanAsyncV4
  public async updateStatus(taskId: TaskId, status: TaskOperationStatus, tx?: DrizzleTx): Promise<TaskModel> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_ID]: taskId,
      [INFRA_CONVENTIONS.infra.jobnik.stage.status]: status,
    });

    /* v8 ignore next 8 -- @preserve */
    if (!tx) {
      return this.drizzle.transaction(async (newTx) => {
        return this.executeUpdateStatus(taskId, status, newTx);
      });
    }
    /* v8 ignore next  -- @preserve */
    return this.executeUpdateStatus(taskId, status, tx);
  }

  /**
   * Dequeues a task of the specified type with highest priority
   * @param taskType - The type of task to dequeue
   * @returns The dequeued task model with updated status
   * @throws TaskNotFoundError when no suitable task is found
   */
  @withSpanAsyncV4
  public async dequeue(stageType: string, tx?: DrizzleTx): Promise<TaskModel> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_DESTINATION_NAME]: stageType,
    });

    /* v8 ignore next 7 -- @preserve */
    if (tx === undefined) {
      return this.drizzle.transaction(async (newTx) => {
        return this.executeDequeue(stageType, newTx);
      });
    }

    /* v8 ignore next -- @preserve */
    return this.executeDequeue(stageType, tx);
  }

  /**
   * This method is used to get a task row by its id from the database.
   * @param taskId unique identifier of the task.
   * @returns The task row if found, otherwise undefined.
   */
  @withSpanAsyncV4
  public async getTaskRowById(taskId: TaskId, tx?: DrizzleTx): Promise<Task | undefined> {
    trace.getActiveSpan()?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_ID]: taskId,
    });

    return (tx ?? this.drizzle).query.task.findFirst({ where: { id: { eq: taskId } } });
  }

  /**
   * Cleans up stale tasks based on the configured time delta
   */
  @withSpanAsyncV4
  public async cleanStaleTasks(): Promise<void> {
    try {
      const staleTaskThresholdInMinutes = this.config.get('task.staleTaskThresholdInMinutes');

      this.logger.debug({
        msg: 'Starting task cleanup process',
        staleTaskThresholdInMinutes,
      });

      const cutoffTime = subMinutes(new Date(), staleTaskThresholdInMinutes);

      // Find tasks that are stuck in IN_PROGRESS state beyond the time threshold
      const staleTasks = await this.drizzle.query.task.findMany({
        where: {
          status: { eq: TaskOperationStatus.IN_PROGRESS },
          startTime: { lt: cutoffTime },
        },
        columns: {
          id: true,
          stageId: true,
          startTime: true,
        },
      });

      if (staleTasks.length === 0) {
        this.logger.debug({ msg: 'No stale tasks found for cleanup' });
        return;
      }

      this.logger.info({
        msg: 'Found stale tasks for cleanup',
        count: staleTasks.length,
      });

      // Update each stale task to FAILED status using the existing TaskManager API
      const updateResults = await this.updateStaleTasksStatus(staleTasks);

      this.logger.info({
        msg: 'Task cleanup completed successfully',
        updatedTasksCount: updateResults.successCount,
        failedTasksCount: updateResults.failureCount,
      });
    } catch (err) {
      this.logger.error({ msg: 'Failed to clean stale tasks', err });
      throw err;
    }
  }

  /**
   * Executes the dequeue operation within a transaction.
   * Uses SELECT FOR UPDATE to lock the task row, preventing race conditions
   * when multiple workers try to dequeue simultaneously.
   * @param stageType - The type of stage to dequeue a task from
   * @param tx - The transaction object
   * @returns The dequeued task
   */
  @withSpanAsyncV4
  private async executeDequeue(stageType: string, tx: DrizzleTx): Promise<TaskModel> {
    const spanActive = trace.getActiveSpan();

    const task = await this.taskRepository.findAndLockTaskForDequeue(stageType, tx);

    if (!task) {
      throw new TaskNotFoundError(tasksErrorMessages.taskNotFound);
    }

    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_ID]: task.id,
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: task.stageId,
    });

    const dequeuedTask = await this.executeUpdateAndValidateStatus(task, TaskOperationStatus.IN_PROGRESS, tx);
    return convertTaskRowToResponse(dequeuedTask);
  }

  /**
   * Executes the update status operation within a transaction.
   * @param taskId - The ID of the task to update
   * @param status - The target status
   * @param tx - The transaction object
   * @returns The updated task model
   */
  @withSpanAsyncV4
  private async executeUpdateStatus(taskId: TaskId, status: TaskOperationStatus, tx: DrizzleTx): Promise<TaskModel> {
    const task = await this.getTaskRowById(taskId, tx);

    if (!task) {
      throw new TaskNotFoundError(tasksErrorMessages.taskNotFound);
    }
    const updatedTask = await this.updateAndValidateStatus(task, status, tx);

    return convertTaskRowToResponse(updatedTask);
  }

  /**
   * Updates a task's status with validation, handling edge cases like failures and retries.
   * @param task - The task to update
   * @param status - The target status to set
   * @param tx - Optional transaction context
   * @returns The updated task object
   */
  @withSpanAsyncV4
  private async updateAndValidateStatus(task: Task, status: TaskOperationStatus, tx?: DrizzleTx): Promise<Task> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_ID]: task.id,
      [INFRA_CONVENTIONS.infra.jobnik.task.status]: status,
      [INFRA_CONVENTIONS.infra.jobnik.task.attempts]: task.attempts,
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: task.stageId,
    });

    /* v8 ignore next 7 -- @preserve */
    if (!tx) {
      return this.drizzle.transaction(async (newTx) => {
        return this.executeUpdateAndValidateStatus(task, status, newTx);
      });
    }

    return this.executeUpdateAndValidateStatus(task, status, tx);
  }

  /**
   * Executes the update and validate status operation within a transaction.
   * Handles status transitions, retry logic, and stage summary updates.
   * @param task - The task to update
   * @param status - The target status
   * @param tx - The transaction object
   * @returns The updated task object
   */
  @withSpanAsyncV4
  private async executeUpdateAndValidateStatus(task: Task, status: TaskOperationStatus, tx: DrizzleTx): Promise<Task> {
    const previousStatus = task.status;
    const { nextStatus, taskDataToUpdate } = this.determineNextStatus(task, status);

    this.logger.debug({
      msg: 'Attempting task status update',
      taskId: task.id,
      stageId: task.stageId,
      currentStatus: previousStatus,
      requestedStatus: status,
      nextStatus,
    });

    const newPersistedSnapshot = updateTaskMachineState(nextStatus, task.xstate);

    const startTime: Date | undefined = nextStatus === TaskOperationStatus.IN_PROGRESS ? new Date() : undefined;

    const endTime: Date | undefined = newPersistedSnapshot.status === 'done' ? new Date() : undefined;

    // Update with race condition protection: only applies if the status is still the one read
    const updatedTask = await this.taskRepository.updateTaskIfStatusUnchanged(
      task.id,
      previousStatus,
      { ...taskDataToUpdate, status: nextStatus, xstate: newPersistedSnapshot, startTime, endTime },
      tx
    );
    if (updatedTask === undefined) {
      // Race condition detected: another process already modified this task
      this.logger.warn({
        msg: 'Task status update failed - race condition detected',
        taskId: task.id,
        stageId: task.stageId,
        attemptedTransition: `${previousStatus} -> ${nextStatus}`,
        expectedStatus: previousStatus,
        reason: 'Task status was changed by another worker before this update could complete',
      });
      throw new TaskStatusUpdateFailedError(tasksErrorMessages.taskStatusUpdateFailed);
    }

    await this.updateStageSummary(task.stageId, previousStatus, nextStatus, tx);

    // TODO - Check if this stage type should propagate failure to parent job
    // For now, all task failures cause stage failure, but in future versions
    // some stages may be configured as optional (non-blocking)
    if (nextStatus === TaskOperationStatus.FAILED) {
      const stage = await this.stageManager.getStageRowById(task.stageId, { tx });

      /* v8 ignore next 7 -- @preserve */
      if (!stage) {
        this.logger.error(`Failed updating task status, stage not exists`);
        throw new StageNotFoundError(stagesErrorMessages.stageNotFound);
      }

      if (stage.status === StageOperationStatus.FAILED) {
        return updatedTask;
      }

      this.logger.info({
        msg: 'Updating parent stage status to FAILED due to task failure',
        taskId: task.id,
        stageId: task.stageId,
      });

      await this.stageManager.updateStatus(task.stageId, StageOperationStatus.FAILED, tx);
      trace.getActiveSpan()?.addEvent('Stage set to FAILED', { stageId: task.stageId });
    }

    return updatedTask;
  }

  /**
   * Determines the next status for a task, handling retry logic for failed tasks.
   * @param task - The task being updated
   * @param requestedStatus - The requested status to set
   * @returns Object containing the actual next status and any data updates needed
   */
  private determineNextStatus(
    task: Task,
    requestedStatus: TaskOperationStatus
  ): {
    nextStatus: TaskOperationStatus;
    taskDataToUpdate?: Pick<NewTask, 'attempts'>;
  } {
    // Only special handling needed for FAILED status
    if (requestedStatus !== TaskOperationStatus.FAILED) {
      return { nextStatus: requestedStatus };
    }

    const taskDataToUpdate = { attempts: task.attempts + 1 };

    const didTaskFail = taskDataToUpdate.attempts >= task.maxAttempts;
    const nextStatus = didTaskFail ? TaskOperationStatus.FAILED : TaskOperationStatus.RETRIED;

    return { nextStatus, taskDataToUpdate };
  }

  private async updateStageSummary(
    stageId: StageId,
    previousStatus: TaskOperationStatus,
    nextStatus: TaskOperationStatus,
    tx: DrizzleTx
  ): Promise<void> {
    const updateSummaryPayload: UpdateSummaryCount = {
      add: { status: nextStatus, count: 1 },
      remove: { status: previousStatus, count: 1 },
    };

    await this.stageManager.updateStageProgressFromTaskChanges(stageId, updateSummaryPayload, tx);
  }

  /**
   * Updates stale tasks to FAILED status using the TaskManager API
   * @param staleTasks - Array of stale task objects
   * @returns Object containing success and failure counts
   */
  private async updateStaleTasksStatus(staleTasks: Pick<Task, 'id' | 'stageId' | 'startTime'>[]): Promise<{
    successCount: number;
    failureCount: number;
  }> {
    let successCount = 0;
    let failureCount = 0;

    // Process tasks sequentially to avoid overwhelming the database
    for (const task of staleTasks) {
      try {
        await this.updateStatus(task.id, TaskOperationStatus.FAILED);
        successCount++;

        this.logger.debug({
          msg: 'Successfully updated stale task status',
          taskId: task.id,
          stageId: task.stageId,
          originalStartTime: task.startTime?.toISOString(),
        });
      } catch (err) {
        failureCount++;

        this.logger.warn({
          msg: 'Failed to update stale task status',
          taskId: task.id,
          stageId: task.stageId,
          err,
        });
      }
    }

    return { successCount, failureCount };
  }
}
