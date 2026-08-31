import { SpanKind, context, propagation, trace } from '@opentelemetry/api';
import { StatusCodes } from 'http-status-codes';
import { INFRA_JOBNIK_TASK_ATTEMPTS, INFRA_JOBNIK_TASK_STATUS } from '@map-colonies/semantic-conventions';
import type { ApiClient } from '../api';
import type { TaskId } from '../types/brands';
import type { InferTaskData, Task } from '../types/task';
import type { ValidStageType, StageTypesTemplate } from '../types/stage';
import type { components } from '../types/openapi';
import { DEFAULT_SPAN_CONTEXT, withSpan } from '../telemetry/trace';
import { ATTR_MESSAGING_DESTINATION_NAME, ATTR_MESSAGING_MESSAGE_ID } from '../telemetry/semconv';
import type { Logger } from '../types';
import type { IConsumer } from '../types/consumer';
import { createAPIErrorFromResponse } from '../errors/utils';
import { JOBNIK_SDK_ERROR_CODES, ConsumerError } from '../errors';
import type { JobnikMetrics } from '../telemetry/metrics';

/**
 * Client for consuming and processing tasks from the job management system.
 * Supports dequeueing tasks and updating their status to completed or failed.
 *
 * @template StageTypes - Interface defining stage types with their metadata, data, and task schemas
 *
 * @example
 * ```typescript
 * interface MyStageTypes {
 *   'resize': {
 *     userMetadata: { quality: number };
 *     data: { width: number; height: number };
 *     task: {
 *       userMetadata: { batchId: string };
 *       data: { sourceUrl: string };
 *     };
 *   };
 * }
 *
 * const consumer = new Consumer<MyStageTypes>(apiClient, logger);
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class Consumer<StageTypes extends StageTypesTemplate<StageTypes> = {}> implements IConsumer<StageTypes> {
  /**
   * Creates a new Consumer instance.
   *
   * @param apiClient - HTTP client for API communication
   * @param logger - Logger instance for operation tracking
   * @param metrics - Metrics instance for Prometheus metrics collection
   */
  public constructor(
    protected readonly apiClient: ApiClient,
    protected readonly logger: Logger,
    protected readonly metrics: JobnikMetrics
  ) {}

  /**
   * Dequeues the highest priority pending task of the specified stage type.
   * The task status is automatically updated to IN_PROGRESS upon successful dequeue.
   *
   * @template StageType - The stage type name, must be a key from StageTypes
   * @param stageType - Stage type to dequeue tasks from
   * @returns Promise resolving to the dequeued task, or null if no tasks are available
   *
   * @throws {ConsumerError} When dequeue operation fails or trace context extraction fails
   *
   * @example
   * ```typescript
   * const task = await consumer.dequeueTask('resize');
   * if (task) {
   *   // Process the task
   *   console.log('Processing task:', task.id);
   * } else {
   *   console.log('No tasks available');
   * }
   * ```
   */
  public async dequeueTask<StageType extends ValidStageType<StageTypes>>(
    stageType: StageType
  ): Promise<Task<InferTaskData<StageType, StageTypes>> | null> {
    // Use prom-client's startTimer helper
    const endTimer = this.metrics.consumerDequeueDuration.startTimer();

    this.logger.debug(
      {
        operation: 'dequeueTask',
        stageType,
      },
      'Starting task dequeue'
    );

    return withSpan(
      `receive ${stageType}`,
      {
        attributes: {
          [ATTR_MESSAGING_DESTINATION_NAME]: stageType,
        },
        kind: SpanKind.CLIENT,
      },
      this.logger,
      async (span) => {
        const { data, error, response } = await this.apiClient.PATCH('/v1/stages/{stageType}/tasks/dequeue', {
          params: { path: { stageType } },
        });

        // Handle 404 as expected behavior when no tasks are available
        if (response.status === Number(StatusCodes.NOT_FOUND)) {
          const duration = endTimer({ stage_type: stageType, status: 'not_found' });

          this.logger.debug(
            {
              operation: 'dequeueTask',
              duration,
              stageType,
            },
            'No tasks available for dequeue'
          );
          return null;
        }

        if (error !== undefined) {
          endTimer({ stage_type: stageType, status: 'error' });

          throw new ConsumerError(
            `Failed to dequeue task for stage type ${stageType}`,
            JOBNIK_SDK_ERROR_CODES.REQUEST_FAILED_ERROR,
            createAPIErrorFromResponse(response, error)
          );
        }

        const duration = endTimer({ stage_type: stageType, status: 'success' });

        this.logger.info(
          {
            operation: 'dequeueTask',
            duration,
            status: 'success',
            metadata: {
              taskId: data.id,
              stageType,
              attempts: data.attempts,
            },
          },
          'Task dequeued successfully'
        );

        span.setAttributes({
          [ATTR_MESSAGING_MESSAGE_ID]: data.id,
          [INFRA_JOBNIK_TASK_ATTEMPTS]: data.attempts,
        });

        return data;
      }
    );
  }

  /**
   * Marks a task as completed by updating its status.
   * Creates a CLIENT span with proper trace linking to the original task creation.
   *
   * @param taskId - Branded task ID to mark as completed
   * @returns Promise that resolves when the status update is complete
   *
   * @throws {ConsumerError} When task retrieval fails, trace context extraction fails, or status update fails
   *
   * @example
   * ```typescript
   * await consumer.markTaskCompleted(taskId);
   * ```
   */
  public async markTaskCompleted(taskId: TaskId): Promise<void> {
    await this.markTask('COMPLETED', { taskId, task: undefined });
  }

  /**
   * Marks a task as failed by updating its status.
   * Creates a CLIENT span with proper trace linking to the original task creation.
   *
   * @param taskId - Branded task ID to mark as failed
   * @returns Promise that resolves when the status update is complete
   *
   * @throws {ConsumerError} When task retrieval fails, trace context extraction fails, or status update fails
   *
   * @example
   * ```typescript
   * await consumer.markTaskFailed(taskId);
   * ```
   */
  public async markTaskFailed(taskId: TaskId): Promise<void> {
    await this.markTask('FAILED', { taskId, task: undefined });
  }

  /**
   * Marks a task with the specified status and updates it via the API.
   *
   * This method validates that the task is in the correct state (IN_PROGRESS) before
   * allowing the status update. It also extracts and links trace context for distributed
   * tracing, and logs the operation with performance metrics.
   *
   * @param status - The new status to set for the task
   * @param options - Either an object containing the task data directly, or an object containing the taskId to fetch
   * @param options.task - The task object to update (when taskId is undefined)
   * @param options.taskId - The ID of the task to fetch and update (when task is undefined)
   * @param stageType - Optional stage type for metrics (should be provided by Worker)
   *
   * @throws {ConsumerError} When trace context extraction fails
   * @throws {ConsumerError} When task is not in IN_PROGRESS state
   * @throws {ConsumerError} When the API request to update task status fails
   *
   * @returns A promise that resolves when the task status has been successfully updated
   */
  protected async markTask(
    status: components['schemas']['taskOperationStatus'],
    options: { task: Task; taskId: undefined } | { taskId: TaskId; task: undefined },
    stageType?: string
  ): Promise<void> {
    // Use prom-client's startTimer helper (only if stageType provided)
    const statusLower = status.toLowerCase() as 'completed' | 'failed';
    const endTimer = stageType !== undefined ? this.metrics.consumerTaskUpdateDuration.startTimer() : null;

    this.logger.debug({
      taskId: options.taskId ?? options.task.id,
      msg: `Marking task as ${status}`,
    });

    return withSpan(
      'update_status',
      {
        attributes: {
          [ATTR_MESSAGING_MESSAGE_ID]: options.taskId ?? options.task.id,
          [INFRA_JOBNIK_TASK_STATUS]: status,
        },
        kind: SpanKind.CLIENT,
      },
      this.logger,
      async (span) => {
        const task = options.taskId !== undefined ? await this.fetchTaskForUpdate(options.taskId) : options.task;

        // Extract trace context and link to original create span
        const remoteContext = propagation.extract(context.active(), task);
        const taskSpanContext = trace.getSpanContext(remoteContext) ?? DEFAULT_SPAN_CONTEXT;

        // Validate task is in correct state for update
        if (task.status !== 'IN_PROGRESS') {
          throw new ConsumerError(
            `Cannot mark task ${task.id} as ${status}: task is in ${task.status} state, expected IN_PROGRESS state`,
            JOBNIK_SDK_ERROR_CODES.TASK_INVALID_STATE_TRANSITION
          );
        }

        span.addLink({
          context: taskSpanContext,
        });

        const { error, response } = await this.apiClient.PUT('/v1/tasks/{taskId}/status', {
          params: { path: { taskId: task.id } },
          body: { status },
        });

        if (error !== undefined) {
          // Record metrics if stageType is provided (from Worker)
          if (endTimer && stageType !== undefined) {
            endTimer({ stage_type: stageType, status: statusLower });
            this.metrics.consumerTaskUpdatesTotal.labels(stageType, statusLower, 'error').inc();
          }

          throw new ConsumerError(
            `Failed to mark task ${task.id} as ${status}`,
            JOBNIK_SDK_ERROR_CODES.REQUEST_FAILED_ERROR,
            createAPIErrorFromResponse(response, error)
          );
        }

        // Record metrics if stageType is provided (from Worker)
        let duration = 0;
        if (endTimer && stageType !== undefined) {
          duration = endTimer({ stage_type: stageType, status: statusLower });
          this.metrics.consumerTaskUpdatesTotal.labels(stageType, statusLower, 'success').inc();
        }

        this.logger.info({
          duration,
          msg: `Task marked as ${status}`,
          status: 'success',
          metadata: {
            taskId: task.id,
          },
        });
      }
    );
  }

  private async fetchTaskForUpdate(taskId: TaskId): Promise<Task> {
    // Fetch task for validation and trace context
    const taskResponse = await this.apiClient.GET('/v1/tasks/{taskId}', {
      params: { path: { taskId } },
    });

    if (taskResponse.error !== undefined) {
      throw new ConsumerError(
        `Failed to retrieve task ${taskId} for status update`,
        JOBNIK_SDK_ERROR_CODES.REQUEST_FAILED_ERROR,
        createAPIErrorFromResponse(taskResponse.response, taskResponse.error)
      );
    }

    return taskResponse.data;
  }
}
