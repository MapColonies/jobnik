import type { Registry } from 'prom-client';
import { Metrics, type JobnikMetrics } from './telemetry/metrics';
import { Worker } from './clients/worker';
import { Consumer } from './clients/consumer';
import { Producer } from './clients/producer';
import { createApiClient, type ApiClient } from './api';
import type { Logger } from './types';
import type { JobData, JobTypesTemplate, ValidJobType } from './types/job';
import type { StageData, StageTypesTemplate, ValidStageType } from './types/stage';
import type { IWorker, TaskHandler, WorkerOptions } from './types/worker';
import type { IJobnikSDK } from './types/sdk';
import type { IProducer } from './types/producer';
import type { IConsumer } from './types/consumer';
import { HttpClientOptions } from './network/httpClient';
import { NoopLogger } from './telemetry/noopLogger';

/**
 * Main SDK class for interacting with the Jobnik job management system.
 * Provides centralized access to producer, consumer, and worker functionality.
 *
 * @template JobTypes - Interface defining job types with their metadata and data schemas
 * @template StageTypes - Interface defining stage types with their metadata, data, and task schemas
 *
 * @example
 * Basic usage:
 * ```typescript
 * const sdk = new JobnikSDK({
 *   baseUrl: 'https://api.jobnik.example.com'
 * });
 *
 * // Create a job
 * const producer = sdk.getProducer();
 * const job = await producer.createJob({
 *   name: 'image-processing',
 *   userMetadata: { userId: 'user-123' },
 *   data: { imageUrl: 'https://example.com/image.jpg' }
 * });
 * ```
 *
 * @example
 * With custom types and configuration:
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
 * const sdk = new JobnikSDK<MyJobTypes, MyStageTypes>({
 *   baseUrl: 'https://api.jobnik.example.com',
 *   logger: customLogger,
 *   httpClientOptions: { timeout: 30000 }
 * });
 * ```
 */
export class JobnikSDK<
  JobTypes extends JobTypesTemplate<JobTypes> = Record<string, JobData>,
  StageTypes extends StageTypesTemplate<StageTypes> = Record<string, StageData>,
> implements IJobnikSDK<JobTypes, StageTypes> {
  /**
   * @internal
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  declare public readonly _: {
    readonly jobTypes: JobTypes;
    readonly stageTypes: StageTypes;
  };

  private readonly logger: Logger;
  private readonly apiClient: ApiClient;
  private readonly producer: Producer;
  private readonly consumer: Consumer<StageTypes>;
  private readonly metrics: JobnikMetrics;

  /**
   * Creates a new JobnikSDK instance.
   *
   * @param options - Configuration options for the SDK
   * @param options.baseUrl - Base URL of the Jobnik API server
   * @param options.httpClientOptions - Optional HTTP client configuration (timeouts, retry settings)
   * @param options.logger - Optional logger instance for operation tracking (defaults to NoopLogger)
   * @param options.metricsRegistry - Prometheus registry for metrics collection
   *
   * @example
   * ```typescript
   * const sdk = new JobnikSDK({
   *   baseUrl: 'https://api.jobnik.example.com',
   *   httpClientOptions: {
   *     timeout: 30000,
   *     retryOptions: { retries: 3 }
   *   },
   *   logger: winston.createLogger({ level: 'info' })
   * });
   * ```
   *
   * @example
   * With Prometheus metrics:
   * ```typescript
   * import { Registry } from 'prom-client';
   *
   * const registry = new Registry();
   * const sdk = new JobnikSDK({
   *   baseUrl: 'https://api.jobnik.example.com',
   *   metricsRegistry: registry
   * });
   *
   * // Expose metrics endpoint
   * app.get('/metrics', async (req, res) => {
   *   res.set('Content-Type', registry.contentType);
   *   res.send(await registry.metrics());
   * });
   * ```
   */
  public constructor(options: { baseUrl: string; httpClientOptions?: HttpClientOptions; logger?: Logger; metricsRegistry: Registry }) {
    this.logger = options.logger ?? new NoopLogger();
    this.metrics = new Metrics(options.metricsRegistry);
    this.apiClient = createApiClient(options.baseUrl, options.httpClientOptions, this.metrics);
    this.consumer = new Consumer(this.apiClient, this.logger, this.metrics);
    this.producer = new Producer(this.apiClient, this.logger, this.metrics);
  }

  /**
   * Gets the consumer client for dequeueing and processing tasks.
   * Use this to fetch tasks from specific stage types and update their status.
   *
   * @returns Consumer instance configured with the SDK's API client and logger
   *
   * @example
   * ```typescript
   * const consumer = sdk.getConsumer();
   * const task = await consumer.dequeueTask('resize');
   *
   * if (task) {
   *   // Process the task...
   *   await consumer.markTaskCompleted(task.id);
   * }
   * ```
   */
  public getConsumer(): IConsumer<StageTypes> {
    return this.consumer;
  }

  /**
   * Gets the producer client for creating jobs, stages, and tasks.
   * Use this to initiate new work in the job management system.
   *
   * @returns Producer instance configured with the SDK's API client and logger
   *
   * @example
   * ```typescript
   * const producer = sdk.getProducer();
   *
   * const job = await producer.createJob({
   *   name: 'image-processing',
   *   userMetadata: { userId: 'user-123' },
   *   data: { imageUrl: 'https://example.com/image.jpg' }
   * });
   *
   * const stage = await producer.createStage(job.id, {
   *   type: 'resize',
   *   userMetadata: { quality: 80 },
   *   data: { width: 800, height: 600 }
   * });
   * ```
   */
  public getProducer(): IProducer<JobTypes, StageTypes> {
    return this.producer;
  }

  /**
   * Creates a worker instance to continuously process tasks of a specific stage type.
   * Workers automatically dequeue tasks, execute the handler function, and update task status.
   *
   * @template StageType - The stage type this worker will process, must be a key from StageTypes
   * @param stageType - Stage type name that this worker will process
   * @param taskHandler - Async function to process individual tasks
   * @param options - Optional worker configuration for concurrency, polling intervals, and circuit breakers
   * @returns Worker instance ready to start processing tasks
   *
   * @example
   * Simple worker:
   * ```typescript
   * const worker = sdk.createWorker(
   *   async (task, context) => {
   *     context.logger.info('Processing task', { taskId: task.id });
   *     // Your task processing logic here
   *   },
   *   'resize'
   * );
   *
   * worker.start(); // Begin processing tasks
   * ```
   *
   * @example
   * Worker with custom configuration:
   * ```typescript
   * const worker = sdk.createWorker(
   *   async (task, context) => {
   *     // Process image resize task
   *     const { sourceUrl } = task.data;
   *     const resizedImage = await processImage(sourceUrl);
   *
   *     // Create follow-up task
   *     await context.producer.createTasks(
   *       task.stageId,
   *       'optimize',
   *       [{ data: { imageData: resizedImage } }]
   *     );
   *   },
   *   'resize',
   *   {
   *     concurrency: 5,
   *     pullingInterval: 2000,
   *     taskHandlerCircuitBreaker: {
   *       enabled: true,
   *       errorThresholdPercentage: 50
   *     }
   *   }
   * );
   * ```
   */
  public createWorker<JobType extends ValidJobType<JobTypes> = string, StageType extends ValidStageType<StageTypes> = string>(
    // public createWorker<JobType extends Extract<keyof JobTypes, string>, StageType extends Extract<keyof StageTypes, string>>(
    stageType: StageType,
    taskHandler: TaskHandler<JobTypes, StageTypes, JobType, StageType>,
    options?: WorkerOptions
  ): IWorker {
    return new Worker<JobTypes, StageTypes, JobType, StageType>(
      taskHandler,
      stageType,
      options ?? { backoffOptions: { backoffFactor: 2, initialBaseRetryDelayMs: 1000, maxDelayMs: 60000 } },
      this.logger,
      this.apiClient,
      this.producer,
      this.metrics
    );
  }

  /**
   * Gets the underlying API client for direct API operations.
   * Use this for advanced scenarios that require direct access to the Jobnik API
   * beyond the standard producer, consumer, and worker abstractions.
   *
   * @returns ApiClient instance configured with the SDK's base URL and HTTP client options
   *
   * @example
   * ```typescript
   * const apiClient = sdk.getApiClient();
   *
   * // Make direct API calls for advanced use cases
   * const response = await apiClient.GET('/jobs/{id}', {
   *   params: { path: { id: 'job-123' } }
   * });
   * ```
   */
  public getApiClient(): ApiClient {
    return this.apiClient;
  }
}
