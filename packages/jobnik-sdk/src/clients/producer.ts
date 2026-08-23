import { type Span, SpanKind, SpanStatusCode, context, propagation, trace } from '@opentelemetry/api';
import { INFRA_JOBNIK_JOB_NAME, INFRA_JOBNIK_JOB_PRIORITY, INFRA_JOBNIK_STAGE_ID } from '@map-colonies/semantic-conventions';
import type { ApiClient } from '../api';
import type { components } from '../types/openapi';
import type { JobId, StageId } from '../types/brands';
import type { Job, JobData, JobTypesTemplate, NewJob, ValidJobType } from '../types/job';
import type { InferStageData, NewStage, Stage, StageData, StageTypesTemplate, ValidStageType } from '../types/stage';
import type { InferTaskData, NewTask, Task } from '../types/task';
import type { IProducer } from '../types/producer';
import { DEFAULT_SPAN_CONTEXT, tracer, withSpan } from '../telemetry/trace';
import { ATTR_MESSAGING_BATCH_MESSAGE_COUNT, ATTR_MESSAGING_DESTINATION_NAME, ATTR_MESSAGING_MESSAGE_CONVERSATION_ID } from '../telemetry/semconv';
import { Logger } from '../types';
import { createAPIErrorFromResponse } from '../errors/utils';
import { JOBNIK_SDK_ERROR_CODES, ProducerError } from '../errors';
import type { JobnikMetrics } from '../telemetry/metrics';

const DEFAULT_PRIORITY: Extract<components['schemas']['priority'], 'MEDIUM'> = 'MEDIUM';

/**
 * Client for creating jobs, stages, and tasks in the job management system.
 *
 * @template JobTypes - Interface defining job types with their metadata and data schemas
 * @template StageTypes - Interface defining stage types with their metadata, data, and task schemas
 *
 * @example
 * ```typescript
 * interface MyJobTypes {
 *   'image-processing': {
 *     userMetadata: { userId: string };
 *     data: { imageUrl: string };
 *   };
 * }
 *
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
 * const producer = new Producer<MyJobTypes, MyStageTypes>(apiClient, logger);
 * ```
 */
export class Producer<
  JobTypes extends JobTypesTemplate<JobTypes> = Record<string, JobData>,
  StageTypes extends StageTypesTemplate<StageTypes> = Record<string, StageData>,
> implements IProducer<JobTypes, StageTypes> {
  /**
   * Creates a new Producer instance.
   *
   * @param apiClient - HTTP client for API communication
   * @param logger - Logger instance for operation tracking
   * @param metrics - Metrics instance for Prometheus metrics collection
   */
  public constructor(
    private readonly apiClient: ApiClient,
    private readonly logger: Logger,
    private readonly metrics: JobnikMetrics
  ) {}

  /**
   * Creates a new job in the system.
   *
   * @template JobName - The job type name, must be a key from JobTypes
   * @param jobData - Job configuration including name, metadata, and data
   * @returns Promise resolving to the created job with assigned ID
   *
   * @throws {ProducerError} When job creation fails
   *
   * @example
   * ```typescript
   * const job = await producer.createJob({
   *   name: 'image-processing',
   *   userMetadata: { userId: 'user-123' },
   *   data: { imageUrl: 'https://example.com/image.jpg' },
   *   priority: 'HIGH'
   * });
   * ```
   */
  public async createJob<JobType extends ValidJobType<JobTypes> = ''>(jobData: NewJob<JobTypes, JobType>): Promise<Job<JobTypes, JobType>> {
    const priority = jobData.priority ?? DEFAULT_PRIORITY;

    this.logger.debug(
      {
        operation: 'createJob',
        jobName: jobData.name,
        priority,
      },
      'Starting job creation'
    );

    return withSpan(
      `create_job ${jobData.name}`,
      {
        attributes: {
          [INFRA_JOBNIK_JOB_NAME]: jobData.name,
          [INFRA_JOBNIK_JOB_PRIORITY]: priority,
        },
        kind: SpanKind.CLIENT,
      },
      this.logger,
      async (span) => {
        // Use prom-client's startTimer helper
        const endTimer = this.metrics.producerJobCreateDuration.startTimer();

        propagation.inject(context.active(), jobData);

        try {
          const { data, error, response } = await this.apiClient.POST('/v1/jobs', {
            body: jobData,
          });

          if (error !== undefined) {
            throw new ProducerError(
              `Failed to create job ${jobData.name}`,
              JOBNIK_SDK_ERROR_CODES.REQUEST_FAILED_ERROR,
              createAPIErrorFromResponse(response, error)
            );
          }

          const duration = endTimer({ result: 'success' });
          this.metrics.producerOperationsTotal.labels('create_job', 'success').inc();

          this.logger.info(
            {
              operation: 'createJob',
              duration,
              status: 'success',
              metadata: {
                jobId: data.id,
                jobName: jobData.name,
                priority,
              },
            },
            'Job created successfully'
          );

          span.setAttribute(ATTR_MESSAGING_MESSAGE_CONVERSATION_ID, data.id);
          return data;
        } catch (error) {
          endTimer({ result: 'error' });
          this.metrics.producerOperationsTotal.labels('create_job', 'error').inc();
          throw error;
        }
      }
    );
  }

  /**
   * Creates a stage within an existing job.
   *
   * @template StageType - The stage type name, must be a key from StageTypes
   * @param jobId - Branded job ID from a previously created job
   * @param stageData - Stage configuration including type, metadata, and data
   * @param createAsWaiting - Optional flag to create the stage with waiting status. If true, the stage will not start processing immediately.
   * @returns Promise resolving to the created stage with assigned ID
   *
   * @throws {ProducerError} When job retrieval fails, trace context extraction fails, or stage creation fails
   *
   * @example
   * ```typescript
   * const stage = await producer.createStage(jobId, {
   *   type: 'resize',
   *   userMetadata: { quality: 95 },
   *   data: { width: 800, height: 600 }
   * });
   * ```
   */
  public async createStage<StageType extends ValidStageType<StageTypes>>(
    jobId: JobId,
    stageData: NewStage<StageType, InferStageData<StageType, StageTypes>>,
    createAsWaiting: boolean = false
  ): Promise<Stage<StageType, InferStageData<StageType, StageTypes>>> {
    this.logger.debug(
      {
        operation: 'createStage',
        jobId,
        stageType: stageData.type,
      },
      'Starting stage creation'
    );

    return withSpan(
      `add_stage ${stageData.type}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: jobId,
          [ATTR_MESSAGING_DESTINATION_NAME]: stageData.type,
        },
      },
      this.logger,
      async (span) => {
        // Use prom-client's startTimer helper
        const endTimer = this.metrics.producerStageCreateDuration.startTimer();

        try {
          const jobResponse = await this.apiClient.GET(`/v1/jobs/{jobId}`, { params: { path: { jobId } } });

          if (jobResponse.error !== undefined) {
            throw new ProducerError(
              `Failed to retrieve job ${jobId}`,
              JOBNIK_SDK_ERROR_CODES.REQUEST_FAILED_ERROR,
              createAPIErrorFromResponse(jobResponse.response, jobResponse.error)
            );
          }

          const remoteContext = propagation.extract(context.active(), jobResponse.data);
          const jobSpanContext = trace.getSpanContext(remoteContext) ?? DEFAULT_SPAN_CONTEXT;

          span.addLink({
            context: jobSpanContext,
          });

          propagation.inject(context.active(), jobResponse.data);

          const { data, error, response } = await this.apiClient.POST(`/v1/jobs/{jobId}/stage`, {
            body: { ...stageData, startAsWaiting: createAsWaiting },
            params: { path: { jobId } },
          });

          if (error !== undefined) {
            throw new ProducerError(
              `Failed to create stage for job ${jobId}`,
              JOBNIK_SDK_ERROR_CODES.REQUEST_FAILED_ERROR,
              createAPIErrorFromResponse(response, error)
            );
          }

          const duration = endTimer({ stage_type: stageData.type, result: 'success' });
          this.metrics.producerOperationsTotal.labels('create_stage', 'success').inc();

          this.logger.info(
            {
              operation: 'createStage',
              duration,
              status: 'success',
              metadata: {
                jobId,
                stageId: data.id,
                stageType: stageData.type,
              },
            },
            'Stage created successfully'
          );

          span.setAttribute(INFRA_JOBNIK_STAGE_ID, data.id);
          return data as Stage<StageType, InferStageData<StageType, StageTypes>>;
        } catch (error) {
          endTimer({ stage_type: stageData.type, result: 'error' });
          this.metrics.producerOperationsTotal.labels('create_stage', 'error').inc();
          throw error;
        }
      }
    );
  }

  /**
   * Creates multiple tasks within an existing stage.
   *
   * @template StageType - The stage type name, must match the stage's actual type
   * @param stageId - Branded stage ID from a previously created stage
   * @param stageType - Stage type name for validation and typing
   * @param taskData - Array of task configurations with metadata and data
   * @returns Promise resolving to array of created tasks with assigned IDs
   *
   * @throws {ProducerError} When task data is empty, stage retrieval fails, stage type mismatch, trace context extraction fails, or task creation fails
   *
   * @example
   * ```typescript
   * const tasks = await producer.createTasks(stageId, 'resize', [
   *   {
   *     userMetadata: { batchId: 'batch-1' },
   *     data: { sourceUrl: 'https://example.com/image1.jpg' }
   *   },
   *   {
   *     userMetadata: { batchId: 'batch-1' },
   *     data: { sourceUrl: 'https://example.com/image2.jpg' }
   *   }
   * ]);
   * ```
   */
  public async createTasks<StageType extends ValidStageType<StageTypes>>(
    stageId: StageId,
    stageType: StageType,
    taskData: NewTask<InferTaskData<StageType, StageTypes>>[]
  ): Promise<Task<InferTaskData<StageType, StageTypes>>[]> {
    if (taskData.length === 0) {
      throw new ProducerError('Task data cannot be empty', JOBNIK_SDK_ERROR_CODES.EMPTY_TASK_DATA_ERROR);
    }

    this.logger.debug(
      {
        operation: 'createTasks',
        stageId,
        stageType,
        taskCount: taskData.length,
      },
      'Starting task creation'
    );

    return withSpan(
      `send ${stageType}`,
      {
        attributes: {
          [INFRA_JOBNIK_STAGE_ID]: stageId,
          [ATTR_MESSAGING_DESTINATION_NAME]: stageType,
          [ATTR_MESSAGING_BATCH_MESSAGE_COUNT]: taskData.length,
        },
      },
      this.logger,
      async (span) => {
        const producerSpans: Span[] = [];

        const stageResponse = await this.apiClient.GET(`/v1/stages/{stageId}`, { params: { path: { stageId } } });

        if (stageResponse.error !== undefined) {
          throw new ProducerError(
            `Failed to retrieve stage ${stageId}`,
            JOBNIK_SDK_ERROR_CODES.REQUEST_FAILED_ERROR,
            createAPIErrorFromResponse(stageResponse.response, stageResponse.error)
          );
        }

        if (stageResponse.data.type !== stageType) {
          this.logger.debug(
            {
              operation: 'createTasks',
              stageId,
              clientSpecified: stageType,
              serverReported: stageResponse.data.type,
            },
            'Stage type validation failed - mismatch detected'
          );

          throw new ProducerError(
            `Stage type mismatch for stage ${stageId}: server reports '${stageResponse.data.type}', but client specified '${stageType}'`,
            JOBNIK_SDK_ERROR_CODES.STAGE_TYPE_MISMATCH_ERROR
          );
        }

        const remoteContext = propagation.extract(context.active(), stageResponse.data);
        const stageSpanContext = trace.getSpanContext(remoteContext) ?? DEFAULT_SPAN_CONTEXT;

        span.addLink({
          context: stageSpanContext,
        });

        // Use prom-client's startTimer helper
        const endTimer = this.metrics.producerTaskCreateDuration.startTimer();

        try {
          const tasksWithTraceContext: components['schemas']['createTaskPayload'][] = [];

          for (const task of taskData) {
            const producerSpan = tracer.startSpan(`create ${stageType}`, { kind: SpanKind.PRODUCER });
            const taskClone = structuredClone(task);

            propagation.inject(trace.setSpan(context.active(), producerSpan), taskClone);

            producerSpans.push(producerSpan);
            tasksWithTraceContext.push(taskClone);
          }

          const { error, data, response } = await this.apiClient.POST(`/v1/stages/{stageId}/tasks`, {
            body: taskData,
            params: { path: { stageId } },
          });

          if (error !== undefined) {
            throw new ProducerError(
              `Failed to create task for stage ${stageId}`,
              JOBNIK_SDK_ERROR_CODES.REQUEST_FAILED_ERROR,
              createAPIErrorFromResponse(response, error)
            );
          }

          const duration = endTimer({ stage_type: stageType, result: 'success' });
          this.metrics.producerOperationsTotal.labels(taskData.length === 1 ? 'create_task' : 'create_tasks', 'success').inc();

          this.logger.info(
            {
              operation: 'createTasks',
              duration,
              status: 'success',
              metadata: {
                stageId,
                stageType,
                taskCount: taskData.length,
                createdTaskCount: data.length,
              },
            },
            'Tasks created successfully'
          );

          return data;
        } catch (error) {
          endTimer({ stage_type: stageType, result: 'error' });
          this.metrics.producerOperationsTotal.labels(taskData.length === 1 ? 'create_task' : 'create_tasks', 'error').inc();

          producerSpans.forEach((span) => {
            span.setStatus({ code: SpanStatusCode.ERROR, message: 'Parent send operation failed' });
          });
          throw error;
        } finally {
          producerSpans.forEach((span) => span.end());
        }
      }
    );
  }
}
