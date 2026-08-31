import type { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { createActor } from 'xstate';
import { trace, type Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/tracing-utils';
import { subMinutes } from 'date-fns';
import { INFRA_CONVENTIONS } from '@map-colonies/semantic-conventions';
import { Prisma, StageOperationStatus, Task, TaskOperationStatus, type PrismaClient } from '@prismaClient';
import { SERVICES, XSTATE_DONE_STATE } from '@common/constants';
import { resolveTraceContext } from '@src/common/utils/tracingHelpers';
import { StageManager } from '@src/stages/models/manager';
import { prismaKnownErrors } from '@src/common/errors';
import { errorMessages as stagesErrorMessages } from '@src/stages/models/errors';
import { taskStateMachine, updateTaskMachineState } from '@src/tasks/models/taskStateMachine';
import { stageStateMachine } from '@src/stages/models/stageStateMachine';
import { type ConfigType } from '@src/common/config';
import type { UpdateSummaryCount } from '@src/stages/models/models';
import type { PrismaTransaction } from '@src/db/types';
import {
  NotAllowedToAddTasksToInProgressStageError,
  StageInFiniteStateError,
  StageNotFoundError,
  TaskNotFoundError,
  TaskStatusUpdateFailedError,
} from '@src/common/generated/errors';
import { ATTR_MESSAGING_DESTINATION_NAME, ATTR_MESSAGING_MESSAGE_ID } from '@src/common/semconv';
import { paginate } from '@src/common/utils/pagination';
import { TaskRepository } from '../DAL/taskRepository';
import type { TasksFindCriteriaArg, TaskModel, TaskPrismaObject, TaskCreateModel, TasksPaginatedResponse, TasksByStageIdQuery } from './models';
import { errorMessages as tasksErrorMessages } from './errors';
import { convertArrayPrismaTaskToTaskResponse, convertPrismaToTaskResponse } from './helper';

@injectable()
export class TaskManager {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.PRISMA) private readonly prisma: PrismaClient,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(StageManager) private readonly stageManager: StageManager,
    @inject(SERVICES.CONFIG) private readonly config: ConfigType,
    @inject(TaskRepository) private readonly taskRepository: TaskRepository
  ) {}

  @withSpanAsyncV4
  public async addTasks(stageId: string, tasksPayload: TaskCreateModel[]): Promise<TaskModel[]> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: stageId,
    });

    const createTaskActor = createActor(taskStateMachine).start();
    createTaskActor.send({ type: 'pend' });
    const persistenceSnapshot = createTaskActor.getPersistedSnapshot();

    const stage = await this.stageManager.getStageEntityById(stageId);

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
      } satisfies Prisma.TaskCreateManyInput;
    });

    const queryBody = {
      data: taskInput,
    };

    try {
      const tasks = await this.prisma.$transaction(async (tx) => {
        const tasks = await tx.task.createManyAndReturn(queryBody);

        const updateSummaryPayload: UpdateSummaryCount = {
          add: { status: TaskOperationStatus.PENDING, count: tasks.length },
        };

        await this.stageManager.updateStageProgressFromTaskChanges(stageId, updateSummaryPayload, tx);
        return tasks;
      });

      return convertArrayPrismaTaskToTaskResponse(tasks);
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
    const { page, page_size, ...filterParams } = params ?? {};
    const hasNoFilters = Object.keys(filterParams).length === 0;

    const where: Prisma.TaskWhereInput | undefined = hasNoFilters
      ? undefined
      : {
          AND: {
            stageId: { equals: filterParams.stage_id },
            stage: { type: { equals: filterParams.stage_type } },
            status: { equals: filterParams.status },
            creationTime: { gte: filterParams.from_date, lte: filterParams.end_date },
          },
        };

    const { total, items: tasks } = await paginate(this.prisma.task, { where, orderBy: { creationTime: 'asc' as const } }, page, page_size);

    return { total, items: convertArrayPrismaTaskToTaskResponse(tasks) };
  }

  @withSpanAsyncV4
  public async getTaskById(taskId: string): Promise<TaskModel> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_ID]: taskId,
    });

    const task = await this.getTaskEntityById(taskId);

    if (!task) {
      throw new TaskNotFoundError(tasksErrorMessages.taskNotFound);
    }

    return convertPrismaToTaskResponse(task);
  }

  @withSpanAsyncV4
  public async getTasksByStageId(stageId: string, query: TasksByStageIdQuery): Promise<TasksPaginatedResponse> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: stageId,
    });
    // To validate existence of stage, if not will throw StageNotFoundError
    await this.stageManager.getStageById(stageId);

    const { total, items: tasks } = await paginate(
      this.prisma.task,
      { where: { stageId }, orderBy: { creationTime: 'asc' as const } },
      query?.page,
      query?.page_size
    );

    const items = tasks.map((task) => convertPrismaToTaskResponse(task));
    return { total, items };
  }

  @withSpanAsyncV4
  public async updateUserMetadata(taskId: string, userMetadata: Record<string, unknown>): Promise<void> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_ID]: taskId,
    });
    const updateQueryBody = {
      where: {
        id: taskId,
      },
      data: {
        userMetadata,
      },
    };

    try {
      await this.prisma.task.update(updateQueryBody);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === prismaKnownErrors.recordNotFound) {
        throw new TaskNotFoundError(tasksErrorMessages.taskNotFound);
      }
      throw err;
    }
  }

  @withSpanAsyncV4
  public async updateStatus(taskId: string, status: TaskOperationStatus, tx?: PrismaTransaction): Promise<TaskModel> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_ID]: taskId,
      [INFRA_CONVENTIONS.infra.jobnik.stage.status]: status,
    });

    /* v8 ignore next 8 -- @preserve */
    if (!tx) {
      return this.prisma.$transaction(async (newTx) => {
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
  public async dequeue(stageType: string, tx?: PrismaTransaction): Promise<TaskModel> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_DESTINATION_NAME]: stageType,
    });

    /* v8 ignore next 7 -- @preserve */
    if (tx === undefined) {
      return this.prisma.$transaction(async (newTx) => {
        return this.executeDequeue(stageType, newTx);
      });
    }

    /* v8 ignore next -- @preserve */
    return this.executeDequeue(stageType, tx);
  }

  /**
   * This method is used to get a task entity by its id from the database.
   * @param taskId unique identifier of the task.
   * @returns The task entity if found, otherwise null.
   */
  @withSpanAsyncV4
  public async getTaskEntityById(taskId: string, tx?: PrismaTransaction): Promise<TaskPrismaObject | null> {
    trace.getActiveSpan()?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_ID]: taskId,
    });

    const prisma = tx ?? this.prisma;
    const queryBody = {
      where: {
        id: taskId,
      },
    };

    const task = await prisma.task.findUnique(queryBody);
    return task;
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
      const staleTasks = await this.prisma.task.findMany({
        where: {
          status: TaskOperationStatus.IN_PROGRESS,
          startTime: {
            lt: cutoffTime,
          },
        },
        select: {
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
  private async executeDequeue(stageType: string, tx: PrismaTransaction): Promise<TaskModel> {
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
    return convertPrismaToTaskResponse(dequeuedTask);
  }

  /**
   * Executes the update status operation within a transaction.
   * @param taskId - The ID of the task to update
   * @param status - The target status
   * @param tx - The transaction object
   * @returns The updated task model
   */
  @withSpanAsyncV4
  private async executeUpdateStatus(taskId: string, status: TaskOperationStatus, tx: PrismaTransaction): Promise<TaskModel> {
    const task = await this.getTaskEntityById(taskId, tx);

    if (!task) {
      throw new TaskNotFoundError(tasksErrorMessages.taskNotFound);
    }
    const updatedTask = await this.updateAndValidateStatus(task, status, tx);

    return convertPrismaToTaskResponse(updatedTask);
  }

  /**
   * Updates a task's status with validation, handling edge cases like failures and retries.
   * @param task - The task to update
   * @param status - The target status to set
   * @param tx - Optional transaction context
   * @returns The updated task object
   */
  @withSpanAsyncV4
  private async updateAndValidateStatus(task: TaskPrismaObject, status: TaskOperationStatus, tx?: PrismaTransaction): Promise<TaskPrismaObject> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_ID]: task.id,
      [INFRA_CONVENTIONS.infra.jobnik.task.status]: status,
      [INFRA_CONVENTIONS.infra.jobnik.task.attempts]: task.attempts,
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: task.stageId,
    });

    /* v8 ignore next 7 -- @preserve */
    if (!tx) {
      return this.prisma.$transaction(async (newTx) => {
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
  private async executeUpdateAndValidateStatus(
    task: TaskPrismaObject,
    status: TaskOperationStatus,
    tx: PrismaTransaction
  ): Promise<TaskPrismaObject> {
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

    // Create update query with race condition protection for IN_PROGRESS
    const updateQueryBody = {
      where: this.createUpdateWhereClause(task.id, previousStatus),
      data: { ...taskDataToUpdate, status: nextStatus, xstate: newPersistedSnapshot, startTime, endTime },
    };

    const updatedTasks = await tx.task.updateManyAndReturn(updateQueryBody);
    if (updatedTasks[0] === undefined) {
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
      const stage = await this.stageManager.getStageEntityById(task.stageId, { tx });

      /* v8 ignore next 7 -- @preserve */
      if (!stage) {
        this.logger.error(`Failed updating task status, stage not exists`);
        throw new StageNotFoundError(stagesErrorMessages.stageNotFound);
      }

      if (stage.status === StageOperationStatus.FAILED) {
        return updatedTasks[0];
      }

      this.logger.info({
        msg: 'Updating parent stage status to FAILED due to task failure',
        taskId: task.id,
        stageId: task.stageId,
      });

      await this.stageManager.updateStatus(task.stageId, StageOperationStatus.FAILED, tx);
      trace.getActiveSpan()?.addEvent('Stage set to FAILED', { stageId: task.stageId });
    }

    return updatedTasks[0];
  }

  /**
   * Determines the next status for a task, handling retry logic for failed tasks.
   * @param task - The task being updated
   * @param requestedStatus - The requested status to set
   * @returns Object containing the actual next status and any data updates needed
   */
  private determineNextStatus(
    task: TaskPrismaObject,
    requestedStatus: TaskOperationStatus
  ): {
    nextStatus: TaskOperationStatus;
    taskDataToUpdate?: Record<string, unknown>;
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

  /**
   * Generates the query filter for task updates using optimistic locking.
   * * By including `previousStatus` in the WHERE clause, we ensure that state
   * transitions (e.g., PENDING → IN_PROGRESS) only occur if no other worker
   * has modified the task in the interim.
   *
   * @param taskId - The ID of the task to update.
   * @param nextStatus - The target status.
   * @param previousStatus - The expected current status to prevent race conditions.
   * @returns The filter object for the update query.
   */
  private createUpdateWhereClause(taskId: string, previousStatus: TaskOperationStatus): { id: string; status: TaskOperationStatus } {
    return { id: taskId, status: previousStatus };
  }

  private async updateStageSummary(
    stageId: string,
    previousStatus: TaskOperationStatus,
    nextStatus: TaskOperationStatus,
    tx: PrismaTransaction
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
