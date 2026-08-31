import { describe, it, expectTypeOf } from 'vitest';
import { Worker } from '../../src/clients/worker';
import type { ApiClient } from '../../src/api';
import type { TaskId } from '../../src/types/brands';
import { NoopLogger } from '../../src/telemetry/noopLogger';
import type { TaskHandler, WorkerOptions } from '../../src/types/worker';
import { IProducer } from '../../src/types/producer';
import { Metrics } from '../../src/telemetry/metrics';
import { Logger } from '../../src';

interface TestJobTypes {
  'image-processing': {
    userMetadata: { userId: string; priority: number };
    data: { imageUrl: string; format: string };
  };
  'data-export': {
    userMetadata: { department: string };
    data: { query: string; format: 'csv' | 'json' };
  };
}

// Test stage types for type checking
interface TestStageTypes {
  bar: {
    userMetadata: { c: boolean };
    data: { d: string };
    task: {
      userMetadata: { e: string };
      data: { f: number };
    };
  };
  baz: {
    userMetadata: { x: number };
    data: { y: boolean };
    task: {
      userMetadata: { priority: number };
      data: { payload: string[] };
    };
  };
}

declare const apiClient: ApiClient;
declare const logger: NoopLogger;
declare const options: WorkerOptions;
declare const producer: IProducer<TestJobTypes, TestStageTypes>;
declare const untypedProducer: IProducer;
declare const metrics: Metrics;

describe('Worker type generics', () => {
  it('enforces correct task handler signature for specific stage', () => {
    const taskHandler: TaskHandler<TestJobTypes, TestStageTypes, 'data-export', 'bar'> = async (task) => {
      expectTypeOf(task.userMetadata).toEqualTypeOf<{ e: string } | undefined>();
      expectTypeOf(task.data).toEqualTypeOf<{ f: number }>();
      await Promise.resolve();
    };

    new Worker<TestJobTypes, TestStageTypes, 'data-export', 'bar'>(taskHandler, 'bar', options, logger, apiClient, producer, metrics);
  });

  it('provides correct context types in task handler', () => {
    const taskHandler: TaskHandler<TestJobTypes, TestStageTypes, 'image-processing', 'baz'> = async (_task, context) => {
      expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
      expectTypeOf(context.logger).toEqualTypeOf<Logger>();
      await Promise.resolve();
    };

    new Worker<TestJobTypes, TestStageTypes, 'image-processing', 'baz'>(taskHandler, 'baz', options, logger, apiClient, producer, metrics);
  });

  it('allows construction without explicit generics', () => {
    const taskHandler: TaskHandler = async (task) => {
      expectTypeOf(task.userMetadata).toEqualTypeOf<Record<string, unknown> | undefined>();
      expectTypeOf(task.data).toEqualTypeOf<Record<string, unknown>>();
      await Promise.resolve();
    };

    new Worker(taskHandler, 'any-stage', options, logger, apiClient, untypedProducer, metrics);
  });
});

describe('Worker method types', () => {
  it('start and stop methods return Promise<void>', () => {
    const taskHandler: TaskHandler<TestJobTypes, TestStageTypes, 'data-export', 'bar'> = async () => {
      // Empty implementation for type test
    };
    const worker = new Worker<TestJobTypes, TestStageTypes, 'data-export', 'bar'>(taskHandler, 'bar', options, logger, apiClient, producer, metrics);

    expectTypeOf(worker.start()).toEqualTypeOf<Promise<void>>();
    expectTypeOf(worker.stop()).toEqualTypeOf<Promise<void>>();
  });
});

describe('Worker event emitter types', () => {
  it('emits correctly typed events', () => {
    const taskHandler: TaskHandler<TestJobTypes, TestStageTypes, 'data-export', 'bar'> = async () => {
      await Promise.resolve();
    };
    const worker = new Worker<TestJobTypes, TestStageTypes, 'data-export', 'bar'>(taskHandler, 'bar', options, logger, apiClient, producer, metrics);

    // Test event listener types
    worker.on('started', (data) => {
      expectTypeOf(data).toEqualTypeOf<{ stageType: string; concurrency: number }>();
    });

    worker.on('stopped', (data) => {
      expectTypeOf(data).toEqualTypeOf<{ stageType: string }>();
    });

    worker.on('stopping', (data) => {
      expectTypeOf(data).toEqualTypeOf<{ stageType: string; runningTasks: number }>();
    });

    worker.on('taskStarted', (data) => {
      expectTypeOf(data).toEqualTypeOf<{ taskId: TaskId; stageType: string }>();
    });

    worker.on('taskCompleted', (data) => {
      expectTypeOf(data).toEqualTypeOf<{ taskId: TaskId; stageType: string; duration: number }>();
    });

    worker.on('taskFailed', (data) => {
      expectTypeOf(data).toEqualTypeOf<{ taskId: TaskId; stageType: string; error: unknown }>();
    });

    worker.on('circuitBreakerOpened', (data) => {
      expectTypeOf(data).toEqualTypeOf<{ breaker: 'taskHandler' | 'dequeueTask'; stageType: string }>();
    });

    worker.on('circuitBreakerClosed', (data) => {
      expectTypeOf(data).toEqualTypeOf<{ breaker: 'taskHandler' | 'dequeueTask'; stageType: string }>();
    });

    worker.on('queueEmpty', (data) => {
      expectTypeOf(data).toEqualTypeOf<{ stageType: string; consecutiveEmptyPolls: number }>();
    });

    worker.on('error', (data) => {
      expectTypeOf(data).toEqualTypeOf<{ location: string; error: unknown; stageType: string }>();
    });
  });

  it('supports event listener management methods', () => {
    const taskHandler: TaskHandler<TestJobTypes, TestStageTypes, 'data-export', 'bar'> = async () => {
      await Promise.resolve();
    };
    const worker = new Worker<TestJobTypes, TestStageTypes, 'data-export', 'bar'>(taskHandler, 'bar', options, logger, apiClient, producer, metrics);

    const listener = (): void => {};

    expectTypeOf(worker.on('started', listener)).toEqualTypeOf<typeof worker>();
    expectTypeOf(worker.off('started', listener)).toEqualTypeOf<typeof worker>();
    expectTypeOf(worker.once('started', listener)).toEqualTypeOf<typeof worker>();
    expectTypeOf(worker.removeAllListeners('started')).toEqualTypeOf<typeof worker>();
    expectTypeOf(worker.removeAllListeners()).toEqualTypeOf<typeof worker>();
  });
});

describe('TaskHandler without explicit types', () => {
  it('works with implicit task handler typing', () => {
    // TaskHandler without explicit generic should default to Record<string, unknown>
    const taskHandler = async (task: unknown): Promise<void> => {
      expectTypeOf(task).toEqualTypeOf<unknown>();
      await Promise.resolve();
    };

    // This should work without TypeScript errors
    new Worker(taskHandler, 'any-stage', options, logger, apiClient, producer, metrics);
  });

  it('works with minimal task handler signature', () => {
    // Most basic task handler - should accept any task type
    const taskHandler = async (): Promise<void> => {
      await Promise.resolve();
    };

    new Worker(taskHandler, 'simple-stage', options, logger, apiClient, producer, metrics);
  });
});
