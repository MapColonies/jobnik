import { setTimeout as sleep } from 'node:timers/promises';
import circuitBreaker, { type Options as OpossumOptions } from 'opossum';
import { context, propagation, type Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { INFRA_JOBNIK_STAGE_ID } from '@map-colonies/semantic-conventions';
import type { ApiClient } from '../api';
import type { Logger } from '../types';
import type { Stage, StageData, StageTypesTemplate, ValidStageType } from '../types/stage';
import { getErrorMessageFromUnknown, presult } from '../common/utils';
import type { Task } from '../types/task';
import { ATTR_MESSAGING_BATCH_MESSAGE_COUNT, ATTR_MESSAGING_DESTINATION_NAME, ATTR_MESSAGING_MESSAGE_ID } from '../telemetry/semconv';
import type { Job, JobData, JobTypesTemplate, ValidJobType } from '../types/job';
import { BASE_ATTRIBUTES, tracer } from '../telemetry/trace';
import type { IWorker, TaskHandler, TaskHandlerContext, WorkerOptions } from '../types/worker';
import type { IProducer } from '../types/producer';
import { WorkerError } from '../errors/sdkErrors';
import type { JobId, StageId, TaskId } from '../types/brands';
import { CIRCUIT_BREAKER_STATES, MILLISECOND_IN_SECOND } from '../common/constants';
import type { JobnikMetrics } from '../telemetry/metrics';
import { categorizeError } from '../telemetry/metrics-utils';
import { ExponentialBackoff } from '../common/backoff';
import { BaseWorker } from './base-worker';

/** Default circuit breaker configuration with resilient defaults */
const defaultCircuitBreakerOptions = {
  enabled: true,
  rollingCountTimeout: 60000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  timeout: false,
  allowWarmUp: true,
} satisfies OpossumOptions;

/**
 * Production-ready worker for processing tasks from the job management system.
 *
 * Provides concurrent task processing with circuit breaker protection, observability,
 * and graceful shutdown capabilities. Supports configurable concurrency, polling intervals,
 * and failure resilience patterns.
 *
 * Key features:
 * - **Concurrent Processing**: Configurable task concurrency with backpressure handling
 * - **Circuit Breaker Protection**: Separate circuit breakers for task handling and dequeue operations
 * - **Observability**: Comprehensive event emission and distributed tracing support
 * - **Graceful Shutdown**: Coordinated shutdown with running task completion
 * - **Type Safety**: Full TypeScript support with stage-specific task type inference
 *
 * @template StageTypes - Stage type definitions mapping stage names to their data structures
 * @template StageType - Specific stage type this worker processes (must be key of StageTypes)
 *
 * @example
 * ```typescript
 * // Define your stage types
 * interface MyStageTypes {
 *   'image-resize': {
 *     userMetadata: { quality: number };
 *     data: { width: number; height: number };
 *     task: {
 *       userMetadata: { batchId: string };
 *       data: { sourceUrl: string; targetPath: string };
 *     };
 *   };
 * }
 *
 * // Create task handler
 * const taskHandler: TaskHandler<MyStageTypes['image-resize']['task']> = async (task, context) => {
 *   const { sourceUrl, targetPath } = task.data;
 *   const { batchId } = task.userMetadata;
 *
 *   context.logger.info('Processing image resize', { taskId: task.id, batchId });
 *
 *   // Check for cancellation
 *   if (context.signal.aborted) {
 *     throw new Error('Task cancelled during shutdown');
 *   }
 *
 *   // Process image
 *   await resizeImage(sourceUrl, targetPath, task.data.width, task.data.height);
 *
 *   // Create follow-up task
 *   await context.producer.createTask('image-upload', {
 *     data: { processedPath: targetPath, batchId }
 *   });
 * };
 *
 * // Configure worker
 * const worker = new Worker<MyStageTypes, 'image-resize'>(
 *   taskHandler,
 *   'image-resize',
 *   {
 *     concurrency: 5,
 *     pullingInterval: 5000,
 *     taskHandlerCircuitBreaker: {
 *       errorThresholdPercentage: 30,
 *       resetTimeout: 60000
 *     }
 *   },
 *   logger,
 *   apiClient
 * );
 *
 * // Set up monitoring
 * worker.on('taskCompleted', ({ taskId, duration }) => {
 *   console.log(`Task ${taskId} completed in ${duration}ms`);
 * });
 *
 * worker.on('error', ({ location, error }) => {
 *   console.error(`Worker error in ${location}:`, error);
 * });
 *
 * // Start processing
 * await worker.start();
 * ```
 */
export class Worker<
  JobTypes extends JobTypesTemplate<JobTypes> = Record<string, JobData>,
  StageTypes extends StageTypesTemplate<StageTypes> = Record<string, StageData>,
  JobType extends ValidJobType<JobTypes> = string,
  StageType extends ValidStageType<StageTypes> = string,
>
  extends BaseWorker<StageTypes>
  implements IWorker
{
  /** Abort controller for coordinated shutdown and task cancellation */
  private readonly abortController = new AbortController();
  /** Circuit breaker protecting task handler execution from failures */
  private readonly taskHandlerCircuitBreaker: circuitBreaker<[Task, TaskHandlerContext<JobTypes, StageTypes, JobType, StageType>]>;
  /** Promise for waiting on task circuit breaker state changes */
  private taskCircuitBreakerPromise: Promise<void> | null = null;
  /** Resolver function for task circuit breaker promise */
  private taskCircuitBreakerResolve: ((value: void) => void) | null = null;
  /** Circuit breaker protecting task dequeue operations from failures */
  private readonly dequeueTaskCircuitBreaker: circuitBreaker<[string], Task | null>;
  /** Timeout duration for task handler circuit breaker reset attempts */
  private readonly taskHandlerCbResetTimeout: number;

  // queue members
  /** Flag indicating if worker is actively processing tasks */
  private isRunning: boolean = false;
  /** Set of currently executing task promises for concurrency management */
  private readonly runningTasks: Set<Promise<void>> = new Set();
  /** Counter for consecutive empty polling attempts (for backoff strategies) */
  private consecutiveEmptyPolls: number = 0;

  private readonly backoff: ExponentialBackoff;

  // metrics members
  /** Start time for uptime calculation */
  private readonly startTime: number;

  /**
   * Creates a new Worker instance with the specified configuration.
   *
   * Sets up circuit breakers, configures polling behavior, and prepares
   * the worker for task processing with the provided handler function.
   *
   * @param taskHandler - Function to process dequeued tasks
   * @param stageType - Stage type to process tasks for
   * @param options - Worker configuration options
   * @param logger - Logger instance for operation tracking
   * @param apiClient - HTTP client for API communication
   * @param producer - Producer instance for creating follow-up tasks
   * @param metrics - Metrics instance for Prometheus metrics collection
   *
   * @example
   * ```typescript
   * const worker = new Worker(
   *   async (task, context) => {
   *     // Process task
   *     await processImageResize(task.data);
   *   },
   *   'image-resize',
   *   { concurrency: 3, pullingInterval: 5000 },
   *   logger,
   *   apiClient,
   *   producer,
   *   metrics
   * );
   * ```
   */
  public constructor(
    private readonly taskHandler: TaskHandler<JobTypes, StageTypes, JobType, StageType>,
    private readonly stageType: StageType,
    private readonly options: WorkerOptions,
    logger: Logger,
    apiClient: ApiClient,
    private readonly producer: IProducer<JobTypes, StageTypes>,
    protected override readonly metrics: JobnikMetrics
  ) {
    super(apiClient, logger, metrics);
    this.startTime = Date.now();

    // Initialize worker-specific metrics for this stage type
    this.metrics.initializeWorkerMetrics(stageType);

    this.backoff = new ExponentialBackoff(this.options.backoffOptions);

    this.taskHandlerCircuitBreaker = new circuitBreaker(this.taskHandler, {
      ...defaultCircuitBreakerOptions,
      ...options.taskHandlerCircuitBreaker,
      name: 'taskHandler',
    });

    this.taskHandlerCbResetTimeout = options.taskHandlerCircuitBreaker?.resetTimeout ?? defaultCircuitBreakerOptions.resetTimeout;

    this.setupTaskHandlerCircuitBreaker();

    this.dequeueTaskCircuitBreaker = new circuitBreaker(this.dequeueTask.bind(this), {
      ...defaultCircuitBreakerOptions,
      ...options.dequeueTaskCircuitBreaker,
      name: 'dequeueTask',
    });

    this.setupDequeueCircuitBreaker();

    // Set up uptime metric collection using prom-client's collect callback
    this.metrics.setupWorkerUptimeCollection(stageType, this.startTime);
  }

  /**
   * Starts the worker and begins processing tasks from the specified stage.
   *
   * Initiates the task polling loop with configured concurrency limits.
   * The worker will continuously poll for tasks, process them concurrently,
   * and emit events for monitoring and observability.
   *
   * The method implements backpressure by limiting concurrent tasks and waiting
   * for completion when the concurrency limit is reached.
   *
   * @returns Promise that resolves when the worker stops (via stop() call)
   *
   * @fires WorkerEvents#started - When worker begins processing
   * @fires WorkerEvents#taskStarted - When each task begins processing
   * @fires WorkerEvents#taskCompleted - When tasks complete successfully
   * @fires WorkerEvents#taskFailed - When tasks fail during processing
   * @fires WorkerEvents#queueEmpty - When no tasks are available
   * @fires WorkerEvents#error - When errors occur during operation
   *
   * @example
   * ```typescript
   * const worker = new Worker(taskHandler, 'image-resize', options, logger, apiClient);
   *
   * // Set up monitoring
   * worker.on('started', ({ stageType, concurrency }) => {
   *   console.log(`Worker started for ${stageType} with concurrency ${concurrency}`);
   * });
   *
   * // Start processing (this promise resolves when worker stops)
   * await worker.start();
   * ```
   */
  public async start(): Promise<void> {
    const concurrency = this.options.concurrency ?? 1;

    this.logger.info(
      {
        stageType: this.stageType,
        concurrency,
      },
      'Starting worker'
    );

    this.isRunning = true;

    this.emit('started', {
      stageType: this.stageType,
      concurrency,
    });

    for await (const [task, span] of this.taskIterator()) {
      this.logger.debug(
        {
          taskId: task.id,
          runningTasks: this.runningTasks.size,
          stageType: this.stageType,
        },
        'Dequeued task for processing'
      );

      this.runTask(task, span);

      while (this.runningTasks.size >= concurrency) {
        this.logger.debug(
          {
            runningTasks: this.runningTasks.size,
            concurrency,
            stageType: this.stageType,
            waiting: true,
          },
          'Concurrency limit reached'
        );
        await Promise.race(this.runningTasks);
      }
    }
  }

  /**
   * Gracefully stops the worker and waits for running tasks to complete.
   *
   * Initiates shutdown by setting the running flag to false, aborting the
   * cancellation signal, and waiting for all currently running tasks to finish.
   * Provides clean shutdown coordination for production deployments.
   *
   * @returns Promise that resolves when all tasks complete and worker fully stops
   *
   * @fires WorkerEvents#stopping - When shutdown begins
   * @fires WorkerEvents#stopped - When worker fully stops
   *
   * @example
   * ```typescript
   * // Graceful shutdown on SIGTERM
   * process.on('SIGTERM', async () => {
   *   console.log('Shutting down worker...');
   *   await worker.stop();
   *   console.log('Worker stopped');
   *   process.exit(0);
   * });
   * ```
   */
  public override async stop(): Promise<void> {
    this.emit('stopping', {
      stageType: this.stageType,
      runningTasks: this.runningTasks.size,
    });

    this.logger.info(
      {
        stageType: this.stageType,
        runningTasks: this.runningTasks.size,
      },
      'Stopping worker'
    );

    this.isRunning = false;

    // No need to clean up uptime metric - collect callback handles it automatically
    await super.stop();
    this.abortController.abort('shutdown called');

    await Promise.allSettled(this.runningTasks);

    this.logger.info({ stageType: this.stageType }, 'Worker stopped');

    this.emit('stopped', { stageType: this.stageType });
  }

  /**
   * Executes a single task with proper error handling and observability.
   *
   * Wraps task execution with distributed tracing, error handling, and status updates.
   * Handles task completion/failure status updates and emits appropriate events.
   *
   * This method is called internally by the task processing loop and should not
   * be called directly by user code.
   *
   * @param task - Task to execute
   * @param span - OpenTelemetry span for distributed tracing
   *
   * @internal
   */
  private runTask(task: Task, span: Span): void {
    this.logger.info({ taskId: task.id, stageType: this.stageType }, 'Running task');

    this.emit('taskStarted', { taskId: task.id, stageType: this.stageType });

    // Increment active tasks BEFORE starting work (prevent race condition)
    this.metrics.workerTasksActive.labels(this.stageType).inc();

    const wrapHandler = async (): Promise<void> => {
      const ctx = trace.setSpan(context.active(), span);

      // Use prom-client's startTimer helper instead of manual timing
      const endTimer = this.metrics.workerTaskDuration.startTimer();

      await context.with(ctx, async () => {
        try {
          const taskParents = await this.fetchTaskParents(task);

          const taskContext = {
            signal: this.abortController.signal,
            logger: this.logger,
            producer: this.producer,
            apiClient: this.apiClient,
            job: taskParents.job,
            stage: taskParents.stage,
            updateJobUserMetadata: this.getUpdateJobUserMetadataFunction(taskParents.job.id),
            updateStageUserMetadata: this.getUpdateStageUserMetadataFunction(taskParents.stage.id),
            updateTaskUserMetadata: this.getUpdateTaskUserMetadataFunction(task.id),
          };

          this.logger.debug(
            {
              taskId: task.id,
              stageType: this.stageType,
            },
            'Task handler firing'
          );

          const taskHandlerSpan = tracer.startSpan(`execute task handler`, {
            kind: SpanKind.INTERNAL,
            attributes: {
              [ATTR_MESSAGING_MESSAGE_ID]: task.id,
              [INFRA_JOBNIK_STAGE_ID]: task.stageId,
              [ATTR_MESSAGING_DESTINATION_NAME]: this.stageType,
              ...BASE_ATTRIBUTES,
            },
          });

          const taskHandlerCtx = trace.setSpan(context.active(), taskHandlerSpan);

          try {
            await context.with(taskHandlerCtx, async () => {
              await this.taskHandlerCircuitBreaker.fire(task, taskContext as TaskHandlerContext<JobTypes, StageTypes, JobType, StageType>);
            });
          } catch (error) {
            taskHandlerSpan.recordException(error as Error);
            taskHandlerSpan.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
          } finally {
            taskHandlerSpan.end();
          }
          this.logger.debug({ taskId: task.id, stageType: this.stageType }, 'Task handler succeeded');

          // Use startTimer's returned function to record duration with labels
          const duration = endTimer({ stage_type: this.stageType, status: 'completed' });
          this.metrics.workerTasksCompletedTotal.labels(this.stageType).inc();

          await this.markTask('COMPLETED', { task, taskId: undefined }, this.stageType);

          // Note: duration is in seconds from startTimer
          this.emit('taskCompleted', { taskId: task.id, stageType: this.stageType, duration: duration * MILLISECOND_IN_SECOND });

          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
        } catch (error) {
          endTimer({ stage_type: this.stageType, status: 'failed' });
          const errorType = categorizeError(error);

          this.metrics.workerTasksFailedTotal.labels(this.stageType, errorType).inc();

          this.logger.warn(
            {
              taskId: task.id,
              stageType: this.stageType,
              err: getErrorMessageFromUnknown(error),
            },
            'Task handler failed'
          );

          const [err] = await presult(this.markTask('FAILED', { task, taskId: undefined }, this.stageType));

          if (err) {
            this.logger.error(
              {
                taskId: task.id,
                stageType: this.stageType,
                err: getErrorMessageFromUnknown(err),
              },
              'Error occurred while marking task as failed'
            );

            this.emit('error', {
              location: 'markTaskFailed',
              error: err,
              stageType: this.stageType,
            });
          }

          this.emit('taskFailed', {
            taskId: task.id,
            stageType: this.stageType,
            error: error,
          });

          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.end();
        }
      });
    };

    const taskPromise = wrapHandler()
      .catch((error) => {
        this.logger.error(
          {
            taskId: task.id,
            stageType: this.stageType,
            err: getErrorMessageFromUnknown(error),
          },
          'Error occurred while processing task'
        );

        this.emit('error', {
          location: 'taskProcessing',
          error: error,
          stageType: this.stageType,
        });
      })
      .finally(() => {
        // Decrement active tasks AFTER work is done (in finally block)
        this.metrics.workerTasksActive.labels(this.stageType).dec();

        this.logger.debug(
          {
            taskId: task.id,
            stageType: this.stageType,
            runningTasks: this.runningTasks.size,
          },
          'Task promise finished'
        );
        this.runningTasks.delete(taskPromise);
      });

    this.runningTasks.add(taskPromise);
  }

  /**
   * Async generator that yields tasks from the job management system.
   *
   * Implements the core polling loop with circuit breaker protection,
   * distributed tracing, and empty queue handling. Continues until
   * the worker is stopped via the stop() method.
   *
   * The iterator handles:
   * - Circuit breaker coordination for resilient polling
   * - Distributed trace context extraction and linking
   * - Empty queue detection and backoff timing
   * - Error handling with proper span recording
   *
   * @yields Tuple of [Task, Span] for each available task
   *
   * @internal
   */
  private async *taskIterator(): AsyncGenerator<[Task, Span]> {
    while (this.isRunning) {
      if (this.taskCircuitBreakerPromise) {
        this.logger.debug(
          {
            stageType: this.stageType,
          },
          'Waiting for task circuit breaker'
        );

        await Promise.race([this.taskCircuitBreakerPromise, sleep(this.taskHandlerCbResetTimeout)]);
      }

      const span = tracer.startSpan(`process ${this.stageType}`, {
        root: true,
        kind: SpanKind.CONSUMER,
        attributes: {
          [ATTR_MESSAGING_DESTINATION_NAME]: this.stageType,
          ...BASE_ATTRIBUTES,
        },
      });

      const ctx = trace.setSpan(context.active(), span);

      const [err, task] = await context.with(ctx, async () => presult(this.dequeueTaskCircuitBreaker.fire(this.stageType)));

      if (err) {
        this.logger.debug(
          {
            stageType: this.stageType,
            err: getErrorMessageFromUnknown(err),
          },
          'Error while dequeuing task'
        );

        this.emit('error', {
          location: 'taskDequeue',
          error: err,
          stageType: this.stageType,
        });

        span.recordException(err);
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute(ATTR_MESSAGING_BATCH_MESSAGE_COUNT, 0);
        span.end();
      }

      if (task) {
        this.backoff.reset();
        this.consecutiveEmptyPolls = 0;
        this.metrics.workerConsecutiveEmptyPolls.labels(this.stageType).set(0);

        this.logger.debug(
          {
            taskId: task.id,
            stageType: this.stageType,
          },
          'Yielding task from iterator'
        );

        const remoteContext = propagation.extract(context.active(), task);
        const taskSpanContext = trace.getSpanContext(remoteContext);

        if (taskSpanContext) {
          span.addLink({ context: taskSpanContext });
        }

        span.setAttributes({
          [INFRA_JOBNIK_STAGE_ID]: task.stageId,
          [ATTR_MESSAGING_MESSAGE_ID]: task.id,
        });

        yield [task, span];
        continue;
      } else {
        this.logger.info(
          {
            stageType: this.stageType,
            consecutiveEmptyPolls: this.consecutiveEmptyPolls + 1,
          },
          'No tasks available in queue'
        );
        this.consecutiveEmptyPolls++;
        this.metrics.workerConsecutiveEmptyPolls.labels(this.stageType).set(this.consecutiveEmptyPolls);

        this.emit('queueEmpty', {
          stageType: this.stageType,
          consecutiveEmptyPolls: this.consecutiveEmptyPolls,
        });

        span.setAttribute(ATTR_MESSAGING_BATCH_MESSAGE_COUNT, 0);
        span.end();
      }

      await sleep(this.backoff.getNextDelay());
    }
  }

  /**
   * Resolves the task circuit breaker promise to unblock task processing.
   *
   * Called when the task handler circuit breaker transitions from open
   * to half-open or closed state, allowing task processing to resume.
   *
   * @internal
   */
  private resolveTaskCircuitBreaker(): void {
    if (this.taskCircuitBreakerResolve) {
      this.taskCircuitBreakerResolve();
      this.taskCircuitBreakerPromise = null;
      this.taskCircuitBreakerResolve = null;
    }
  }

  /**
   * Sets up event handlers for the dequeue task circuit breaker.
   *
   * Configures logging and event emission for circuit breaker state changes
   * during task dequeue operations. Provides visibility into dequeue failures
   * and recovery patterns.
   *
   * @internal
   */
  private setupDequeueCircuitBreaker(): void {
    this.dequeueTaskCircuitBreaker.on('open', () => {
      this.logger.warn({ stageType: this.stageType }, 'Dequeue task circuit breaker opened');

      this.metrics.workerCircuitBreakerState.labels(this.stageType, 'dequeue_task').set(CIRCUIT_BREAKER_STATES.OPEN); // 2 = open
      this.metrics.workerCircuitBreakerOpensTotal.labels(this.stageType, 'dequeue_task').inc();

      this.emit('circuitBreakerOpened', {
        breaker: 'dequeueTask',
        stageType: this.stageType,
      });
    });

    this.dequeueTaskCircuitBreaker.on('close', () => {
      this.logger.info({ stageType: this.stageType }, 'Dequeue task circuit breaker closed');

      this.metrics.workerCircuitBreakerState.labels(this.stageType, 'dequeue_task').set(CIRCUIT_BREAKER_STATES.CLOSED); // 0 = closed

      this.emit('circuitBreakerClosed', {
        breaker: 'dequeueTask',
        stageType: this.stageType,
      });
    });

    this.dequeueTaskCircuitBreaker.on('halfOpen', () => {
      this.logger.info({ stageType: this.stageType }, 'Dequeue task circuit breaker half-opened');

      this.metrics.workerCircuitBreakerState.labels(this.stageType, 'dequeue_task').set(CIRCUIT_BREAKER_STATES.HALF_OPEN); // 1 = half_open
    });
  }

  /**
   * Sets up event handlers for the task handler circuit breaker.
   *
   * Configures logging, event emission, and promise coordination for circuit breaker
   * state changes during task handler execution. Manages the task circuit breaker
   * promise that blocks task processing when the circuit breaker is open.
   *
   * @internal
   */
  private setupTaskHandlerCircuitBreaker(): void {
    this.taskHandlerCircuitBreaker.on('open', () => {
      this.logger.warn({ stageType: this.stageType }, 'Task handler circuit breaker opened');

      this.metrics.workerCircuitBreakerState.labels(this.stageType, 'task_handler').set(CIRCUIT_BREAKER_STATES.OPEN); // 2 = open
      this.metrics.workerCircuitBreakerOpensTotal.labels(this.stageType, 'task_handler').inc();

      this.emit('circuitBreakerOpened', {
        breaker: 'taskHandler',
        stageType: this.stageType,
      });

      this.taskCircuitBreakerPromise = new Promise((resolve) => {
        this.taskCircuitBreakerResolve = resolve;
      });
    });

    this.taskHandlerCircuitBreaker.on('close', () => {
      this.logger.info({ stageType: this.stageType }, 'Task handler circuit breaker closed');

      this.metrics.workerCircuitBreakerState.labels(this.stageType, 'task_handler').set(CIRCUIT_BREAKER_STATES.CLOSED); // 0 = closed

      this.emit('circuitBreakerClosed', {
        breaker: 'taskHandler',
        stageType: this.stageType,
      });

      this.resolveTaskCircuitBreaker();
    });

    this.taskHandlerCircuitBreaker.on('halfOpen', () => {
      this.logger.info({ stageType: this.stageType }, 'Task handler circuit breaker half-opened');

      this.metrics.workerCircuitBreakerState.labels(this.stageType, 'task_handler').set(CIRCUIT_BREAKER_STATES.HALF_OPEN); // 1 = half_open

      this.resolveTaskCircuitBreaker();
    });
  }

  private async fetchTaskParents(task: Task): Promise<{ job: Job; stage: Stage }> {
    const { data: stage, error: stageError } = await this.apiClient.GET('/v1/stages/{stageId}', { params: { path: { stageId: task.stageId } } });
    if (!stage) {
      throw new WorkerError(`Stage not found for ID ${task.stageId}`, 'FAILED_FETCHING_STAGE', stageError);
    }

    const { data: job, error: jobError } = await this.apiClient.GET('/v1/jobs/{jobId}', { params: { path: { jobId: stage.jobId } } });

    if (!job) {
      throw new WorkerError(`Job not found for ID ${stage.jobId}`, 'FAILED_FETCHING_JOB', jobError);
    }

    return { job, stage };
  }

  private getUpdateJobUserMetadataFunction(jobId: JobId): (metadata: Record<string, unknown>) => Promise<void> {
    return async (metadata: Record<string, unknown>) => {
      const { error } = await this.apiClient.PATCH('/v1/jobs/{jobId}/user-metadata', {
        params: { path: { jobId } },
        body: { userMetadata: metadata },
      });

      if (error) {
        this.logger.error(
          {
            jobId,
            err: getErrorMessageFromUnknown(error),
          },
          'Failed to update job user metadata'
        );
        throw new WorkerError(`Failed to update job user metadata for job ID ${jobId}`, 'FAILED_FETCHING_JOB', error);
      }
    };
  }

  private getUpdateStageUserMetadataFunction(stageId: StageId): (metadata: Record<string, unknown>) => Promise<void> {
    return async (metadata: Record<string, unknown>) => {
      const { error } = await this.apiClient.PATCH('/v1/stages/{stageId}/user-metadata', {
        params: { path: { stageId } },
        body: { userMetadata: metadata },
      });

      if (error) {
        this.logger.error(
          {
            stageId,
            err: getErrorMessageFromUnknown(error),
          },
          'Failed to update stage user metadata'
        );
        throw new WorkerError(`Failed to update stage user metadata for stage ID ${stageId}`, 'FAILED_FETCHING_STAGE', error);
      }
    };
  }

  private getUpdateTaskUserMetadataFunction(taskId: TaskId): (metadata: Record<string, unknown>) => Promise<void> {
    return async (metadata: Record<string, unknown>) => {
      const { error } = await this.apiClient.PATCH('/v1/tasks/{taskId}/user-metadata', {
        params: { path: { taskId } },
        body: { userMetadata: metadata },
      });

      if (error) {
        this.logger.error(
          {
            taskId,
            err: getErrorMessageFromUnknown(error),
          },
          'Failed to update task user metadata'
        );
        throw new WorkerError(`Failed to update task user metadata for task ID ${taskId}`, 'FAILED_FETCHING_STAGE', error);
      }
    };
  }
}
