import { EventEmitter } from 'node:events';
import type { ApiClient } from '../api';
import type { Logger } from '../types';
import type { StageData, StageTypesTemplate } from '../types/stage';
import type { WorkerEvents } from '../types/worker';
import type { JobnikMetrics } from '../telemetry/metrics';
import { Consumer } from './consumer';

/**
 * Abstract base class for worker implementations with event handling capabilities.
 * Extends Consumer with standardized event emission and lifecycle management.
 *
 * Provides type-safe event handling and graceful shutdown coordination for all worker types.
 *
 * @template StageTypes - Stage type definitions mapping stage names to their data structures
 *
 * @example
 * ```typescript
 * class CustomWorker extends BaseWorker<MyStageTypes> {
 *   async start() {
 *     this.emit('started', { stageType: 'my-stage', concurrency: 1 });
 *     // Implementation...
 *   }
 * }
 *
 * const worker = new CustomWorker(apiClient, logger);
 * worker.on('taskCompleted', ({ taskId }) => {
 *   console.log(`Task ${taskId} completed`);
 * });
 * ```
 */
export abstract class BaseWorker<StageTypes extends StageTypesTemplate<StageTypes> = Record<string, StageData>> extends Consumer<StageTypes> {
  private readonly eventEmitter = new EventEmitter();

  /**
   * Creates a new BaseWorker instance.
   *
   * @param apiClient - HTTP client for API communication
   * @param logger - Logger instance for operation tracking
   * @param metrics - Metrics instance for Prometheus metrics collection
   */
  public constructor(
    apiClient: ApiClient,
    logger: Logger,
    protected override readonly metrics: JobnikMetrics
  ) {
    super(apiClient, logger, metrics);
  }

  /**
   * Registers an event listener for the specified worker event.
   *
   * @template K - Event name type from WorkerEvents
   * @param event - Name of the event to listen for
   * @param listener - Function to call when event is emitted
   * @returns This worker instance for method chaining
   *
   * @example
   * ```typescript
   * worker.on('taskCompleted', ({ taskId, duration }) => {
   *   console.log(`Task ${taskId} completed in ${duration}ms`);
   * });
   * ```
   */
  public on<K extends keyof WorkerEvents>(event: K, listener: (data: WorkerEvents[K]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  /**
   * Removes an event listener for the specified worker event.
   *
   * @template K - Event name type from WorkerEvents
   * @param event - Name of the event to stop listening for
   * @param listener - Function to remove from event listeners
   * @returns This worker instance for method chaining
   */
  public off<K extends keyof WorkerEvents>(event: K, listener: (data: WorkerEvents[K]) => void): this {
    this.eventEmitter.off(event, listener);
    return this;
  }

  /**
   * Registers a one-time event listener for the specified worker event.
   *
   * @template K - Event name type from WorkerEvents
   * @param event - Name of the event to listen for once
   * @param listener - Function to call when event is first emitted
   * @returns This worker instance for method chaining
   */
  public once<K extends keyof WorkerEvents>(event: K, listener: (data: WorkerEvents[K]) => void): this {
    this.eventEmitter.once(event, listener);
    return this;
  }

  /**
   * Removes all listeners for a specific event or all events.
   *
   * @template K - Event name type from WorkerEvents
   * @param event - Optional event name to remove listeners for (removes all if not specified)
   * @returns This worker instance for method chaining
   */
  public removeAllListeners<K extends keyof WorkerEvents>(event?: K): this {
    this.eventEmitter.removeAllListeners(event);
    return this;
  }

  /**
   * Stops the worker and performs cleanup operations.
   * Base implementation removes all event listeners; subclasses should call super.stop().
   *
   * @returns Promise that resolves when worker is fully stopped
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  public async stop(): Promise<void> {
    // Base cleanup - subclasses should call super.stop()
    this.removeAllListeners();
  }

  /**
   * Emits a worker event with the specified data.
   * Protected method for use by subclasses to notify listeners of worker state changes.
   *
   * @template K - Event name type from WorkerEvents
   * @param event - Name of the event to emit
   * @param data - Event-specific data to send to listeners
   */
  protected emit<K extends keyof WorkerEvents>(event: K, data: WorkerEvents[K]): void {
    this.eventEmitter.emit(event, data);
  }
}
