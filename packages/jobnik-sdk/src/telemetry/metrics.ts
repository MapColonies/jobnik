/* eslint-disable @typescript-eslint/no-magic-numbers */
// Optional import - gracefully handle missing prom-client
import { Histogram, Counter, Gauge, Registry } from 'prom-client';
import { readPackageJsonSync } from '@map-colonies/read-pkg';

export interface JobnikMetrics {
  // Worker metrics
  workerTaskDuration: Histogram<'stage_type' | 'status'>;
  workerTasksCompletedTotal: Counter<'stage_type'>;
  workerTasksFailedTotal: Counter<'stage_type' | 'error_type'>;
  workerTasksActive: Gauge<'stage_type'>;
  workerCircuitBreakerState: Gauge<'stage_type' | 'breaker'>;
  workerCircuitBreakerOpensTotal: Counter<'stage_type' | 'breaker'>;
  workerConsecutiveEmptyPolls: Gauge<'stage_type'>;

  // Consumer metrics
  consumerDequeueDuration: Histogram<'stage_type' | 'status'>;
  consumerTaskUpdateDuration: Histogram<'stage_type' | 'status'>;
  consumerTaskUpdatesTotal: Counter<'stage_type' | 'status' | 'result'>;

  // Producer metrics
  producerJobCreateDuration: Histogram<'result'>;
  producerStageCreateDuration: Histogram<'stage_type' | 'result'>;
  producerTaskCreateDuration: Histogram<'stage_type' | 'result'>;
  producerOperationsTotal: Counter<'operation' | 'result'>;

  // HTTP metrics
  httpRequestDuration: Histogram<'method' | 'status_code' | 'retried'>;
  httpRetriesTotal: Counter<'method' | 'reason'>;

  // Lifecycle metrics
  workerUptimeSeconds: Gauge<'stage_type'>;
  sdkInfo: Gauge<'version' | 'node_version' | 'platform' | 'arch'>;

  /**
   * Initializes worker-specific metrics for a stage type.
   * Should be called once when a worker is created to pre-initialize metric series.
   *
   * @param stageType - The stage type the worker will process
   */
  initializeWorkerMetrics: (stageType: string) => void;

  /**
   * Sets up the uptime gauge to automatically calculate uptime on collection.
   *
   * @param stageType - The stage type the worker processes
   * @param startTime - The timestamp when the worker started (in milliseconds)
   */
  setupWorkerUptimeCollection: (stageType: string, startTime: number) => void;
}

/**
 * Real implementation of JobnikMetrics using prom-client.
 * Registers all metrics with the provided Prometheus registry.
 */
export class Metrics implements JobnikMetrics {
  public readonly workerTaskDuration: Histogram<'stage_type' | 'status'>;
  public readonly workerTasksCompletedTotal: Counter<'stage_type'>;
  public readonly workerTasksFailedTotal: Counter<'stage_type' | 'error_type'>;
  public readonly workerTasksActive: Gauge<'stage_type'>;
  public readonly workerCircuitBreakerState: Gauge<'stage_type' | 'breaker'>;
  public readonly workerCircuitBreakerOpensTotal: Counter<'stage_type' | 'breaker'>;
  public readonly workerConsecutiveEmptyPolls: Gauge<'stage_type'>;
  public readonly consumerDequeueDuration: Histogram<'stage_type' | 'status'>;
  public readonly consumerTaskUpdateDuration: Histogram<'stage_type' | 'status'>;
  public readonly consumerTaskUpdatesTotal: Counter<'stage_type' | 'status' | 'result'>;
  public readonly producerJobCreateDuration: Histogram<'job_type' | 'priority' | 'result'>;
  public readonly producerStageCreateDuration: Histogram<'stage_type' | 'result'>;
  public readonly producerTaskCreateDuration: Histogram<'stage_type' | 'result'>;
  public readonly producerOperationsTotal: Counter<'operation' | 'result'>;
  public readonly httpRequestDuration: Histogram<'method' | 'status_code' | 'retried'>;
  public readonly httpRetriesTotal: Counter<'method' | 'reason'>;
  public readonly workerUptimeSeconds: Gauge<'stage_type'>;
  public readonly sdkInfo: Gauge<'version' | 'node_version' | 'platform' | 'arch'>;

  public constructor(registry: Registry) {
    this.workerTaskDuration = new Histogram({
      name: 'jobnik_sdk_worker_task_duration_seconds',
      help: 'Task processing duration in seconds',
      labelNames: ['stage_type', 'status'],
      buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 240, 300, 600],
      registers: [registry],
    });

    this.workerTasksCompletedTotal = new Counter({
      name: 'jobnik_sdk_worker_tasks_completed_total',
      help: 'Total number of tasks successfully completed',
      labelNames: ['stage_type'],
      registers: [registry],
    });

    this.workerTasksFailedTotal = new Counter({
      name: 'jobnik_sdk_worker_tasks_failed_total',
      help: 'Total number of tasks that failed during processing',
      labelNames: ['stage_type', 'error_type'],
      registers: [registry],
    });

    this.workerTasksActive = new Gauge({
      name: 'jobnik_sdk_worker_tasks_active',
      help: 'Current number of tasks being actively processed',
      labelNames: ['stage_type'],
      registers: [registry],
    });

    this.workerCircuitBreakerState = new Gauge({
      name: 'jobnik_sdk_worker_circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=half_open, 2=open)',
      labelNames: ['stage_type', 'breaker'],
      registers: [registry],
    });

    this.workerCircuitBreakerOpensTotal = new Counter({
      name: 'jobnik_sdk_worker_circuit_breaker_opens_total',
      help: 'Total number of times circuit breaker has opened',
      labelNames: ['stage_type', 'breaker'],
      registers: [registry],
    });

    this.workerConsecutiveEmptyPolls = new Gauge({
      name: 'jobnik_sdk_worker_consecutive_empty_polls',
      help: 'Current count of consecutive empty polling attempts',
      labelNames: ['stage_type'],
      registers: [registry],
    });

    this.consumerDequeueDuration = new Histogram({
      name: 'jobnik_sdk_consumer_dequeue_duration_seconds',
      help: 'Time taken to dequeue a task from the API',
      labelNames: ['stage_type', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [registry],
    });

    this.consumerTaskUpdateDuration = new Histogram({
      name: 'jobnik_sdk_consumer_task_update_duration_seconds',
      help: 'Time taken to update task status via the API',
      labelNames: ['stage_type', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [registry],
    });

    this.consumerTaskUpdatesTotal = new Counter({
      name: 'jobnik_sdk_consumer_task_updates_total',
      help: 'Total number of task status update attempts',
      labelNames: ['stage_type', 'status', 'result'],
      registers: [registry],
    });

    this.producerJobCreateDuration = new Histogram({
      name: 'jobnik_sdk_producer_job_create_duration_seconds',
      help: 'Time taken to create a new job via the API',
      labelNames: ['job_type', 'priority', 'result'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [registry],
    });

    this.producerStageCreateDuration = new Histogram({
      name: 'jobnik_sdk_producer_stage_create_duration_seconds',
      help: 'Time taken to create a new stage via the API',
      labelNames: ['stage_type', 'result'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [registry],
    });

    this.producerTaskCreateDuration = new Histogram({
      name: 'jobnik_sdk_producer_task_create_duration_seconds',
      help: 'Time taken to create task(s) via the API',
      labelNames: ['stage_type', 'result'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [registry],
    });

    this.producerOperationsTotal = new Counter({
      name: 'jobnik_sdk_producer_operations_total',
      help: 'Total number of producer operations performed',
      labelNames: ['operation', 'result'],
      registers: [registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'jobnik_sdk_http_request_duration_seconds',
      help: 'Time taken for HTTP requests to the Job Manager API',
      labelNames: ['method', 'status_code', 'retried'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [registry],
    });

    this.httpRetriesTotal = new Counter({
      name: 'jobnik_sdk_http_retries_total',
      help: 'Total number of HTTP request retry attempts',
      labelNames: ['method', 'reason'],
      registers: [registry],
    });

    this.workerUptimeSeconds = new Gauge({
      name: 'jobnik_sdk_worker_uptime_seconds',
      help: 'Time in seconds since the worker started',
      labelNames: ['stage_type'],
      registers: [registry],
    });

    this.sdkInfo = new Gauge({
      name: 'jobnik_sdk_info',
      help: 'SDK version and runtime information',
      labelNames: ['version', 'node_version', 'platform', 'arch'],
      registers: [registry],
    });

    // Initialize SDK info metric immediately
    this.initializeSdkInfo();
  }

  /**
   * Initializes worker-specific metrics for a stage type.
   * Pre-initializes metric series to prevent missing data points in Prometheus.
   *
   * @param stageType - The stage type the worker will process
   */
  public initializeWorkerMetrics(stageType: string): void {
    // Initialize counters to zero
    this.workerTasksCompletedTotal.labels(stageType).inc(0);
    this.workerTasksFailedTotal.labels(stageType, 'timeout').inc(0);
    this.workerTasksFailedTotal.labels(stageType, 'handler_error').inc(0);
    this.workerTasksFailedTotal.labels(stageType, 'api_error').inc(0);

    // Initialize gauges
    this.workerTasksActive.labels(stageType).set(0);
    this.workerConsecutiveEmptyPolls.labels(stageType).set(0);
    this.workerCircuitBreakerState.labels(stageType, 'task_handler').set(0);
    this.workerCircuitBreakerState.labels(stageType, 'dequeue_task').set(0);
  }

  /**
   * Sets up the uptime gauge to automatically calculate uptime on collection.
   * Uses prom-client's collect() callback to dynamically compute uptime when metrics are scraped.
   *
   * @param stageType - The stage type the worker processes
   * @param startTime - The timestamp when the worker started (in milliseconds)
   */
  public setupWorkerUptimeCollection(stageType: string, startTime: number): void {
    // Initialize to prevent missing series
    this.workerUptimeSeconds.labels(stageType).set(0);

    // Store reference to gauge for closure
    const gauge = this.workerUptimeSeconds;

    // Set collect callback on the gauge instance to calculate uptime dynamically
    (gauge as unknown as { collect: () => void }).collect = function (this: unknown): void {
      const uptimeSeconds = (Date.now() - startTime) / 1000;
      gauge.labels(stageType).set(uptimeSeconds);
    };
  }

  /**
   * Initializes SDK info metric with version and runtime information.
   * Called automatically during construction.
   */
  private initializeSdkInfo(): void {
    const packageJson = readPackageJsonSync();
    this.sdkInfo
      .labels({
        version: packageJson.version ?? 'unknown',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
      })
      .set(1);
  }
}
