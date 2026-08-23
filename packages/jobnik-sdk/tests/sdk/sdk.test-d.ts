import { describe, it, expectTypeOf } from 'vitest';
import { Registry } from 'prom-client';
import { JobnikSDK } from '../../src/sdk';
import type { IConsumer } from '../../src/types/consumer';
import type { IProducer } from '../../src/types/producer';
import type { IWorker, TaskHandler } from '../../src/types/worker';
import { NoopLogger } from '../../src/telemetry/noopLogger';

// Test types for testing generic functionality
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

interface TestStageTypes {
  'image-resize': {
    userMetadata: { quality: number };
    data: { width: number; height: number };
    task: {
      userMetadata: { batchId: string };
      data: { sourceUrl: string; targetUrl: string };
    };
  };
  'data-transform': {
    userMetadata: { transformerId: string };
    data: { inputFormat: string; outputFormat: string };
    task: {
      userMetadata: { rowId: string };
      data: { inputData: Record<string, unknown>; transformRules: string[] };
    };
  };
}

const metricsRegistry = new Registry();

describe('JobnikSDK type generics', () => {
  it('can be constructed with custom types', () => {
    const sdk = new JobnikSDK<TestJobTypes, TestStageTypes>({
      baseUrl: 'http://localhost:8080',
      metricsRegistry,
    });
    expectTypeOf(sdk).toExtend<JobnikSDK<TestJobTypes, TestStageTypes>>();
  });

  it('can be constructed without explicit generics', () => {
    const sdk = new JobnikSDK({
      baseUrl: 'http://localhost:8080',
      metricsRegistry,
    });
    expectTypeOf(sdk).toExtend<JobnikSDK>();
  });

  it('can be constructed with just job types', () => {
    const sdk = new JobnikSDK<TestJobTypes>({
      baseUrl: 'http://localhost:8080',
      metricsRegistry,
    });
    expectTypeOf(sdk).toExtend<JobnikSDK<TestJobTypes>>();
  });

  it('can be constructed with all configuration options', () => {
    const sdk = new JobnikSDK<TestJobTypes, TestStageTypes>({
      baseUrl: 'http://localhost:8080',
      metricsRegistry,
      logger: new NoopLogger(),
      httpClientOptions: {
        retry: { maxRetries: 3 },
        agentOptions: { keepAliveTimeout: 10000 },
      },
    });
    expectTypeOf(sdk).toExtend<JobnikSDK<TestJobTypes, TestStageTypes>>();
  });
});

describe('JobnikSDK.getConsumer', () => {
  it('returns correctly typed Consumer for default generics', () => {
    const sdk = new JobnikSDK({
      metricsRegistry,
      baseUrl: 'http://localhost:8080',
    });

    const consumer = sdk.getConsumer();
    expectTypeOf(consumer).toExtend<IConsumer>();
  });

  it('returns correctly typed Consumer for custom stage types', () => {
    const sdk = new JobnikSDK<TestJobTypes, TestStageTypes>({
      metricsRegistry,
      baseUrl: 'http://localhost:8080',
    });

    const consumer = sdk.getConsumer();
    expectTypeOf(consumer).toExtend<IConsumer<TestStageTypes>>();
  });
});

describe('JobnikSDK.getProducer', () => {
  it('returns correctly typed Producer for default generics', () => {
    const sdk = new JobnikSDK({
      metricsRegistry,
      baseUrl: 'http://localhost:8080',
    });

    const producer = sdk.getProducer();
    expectTypeOf(producer).toExtend<IProducer>();
  });

  it('returns correctly typed Producer for custom types', () => {
    const sdk = new JobnikSDK<TestJobTypes, TestStageTypes>({
      metricsRegistry,
      baseUrl: 'http://localhost:8080',
    });

    const producer = sdk.getProducer();
    expectTypeOf(producer).toExtend<IProducer<TestJobTypes, TestStageTypes>>();
  });

  it('returns correctly typed Producer with only job types', () => {
    const sdk = new JobnikSDK<TestJobTypes>({
      metricsRegistry,
      baseUrl: 'http://localhost:8080',
    });

    const producer = sdk.getProducer();
    expectTypeOf(producer).toExtend<IProducer<TestJobTypes>>();
  });
});

describe('JobnikSDK.createWorker', () => {
  it('returns correctly typed Worker for default generics', () => {
    const sdk = new JobnikSDK({
      metricsRegistry,
      baseUrl: 'http://localhost:8080',
    });

    const taskHandler: TaskHandler = async () => {};

    const worker = sdk.createWorker('any-stage', taskHandler);

    expectTypeOf(worker).toExtend<IWorker>();
  });

  it('returns correctly typed Worker for custom stage types', () => {
    const sdk = new JobnikSDK<TestJobTypes, TestStageTypes>({
      metricsRegistry,
      baseUrl: 'http://localhost:8080',
    });

    const taskHandler: TaskHandler<TestJobTypes, TestStageTypes> = async () => {};

    const worker = sdk.createWorker('image-resize', taskHandler);
    expectTypeOf(worker).toExtend<IWorker>();
  });

  it('accepts worker options parameter', () => {
    const sdk = new JobnikSDK<TestJobTypes, TestStageTypes>({
      metricsRegistry,
      baseUrl: 'http://localhost:8080',
    });

    const taskHandler: TaskHandler<TestJobTypes, TestStageTypes> = async () => {};

    const worker = sdk.createWorker('image-resize', taskHandler, {
      concurrency: 5,
      taskHandlerCircuitBreaker: {
        enabled: true,
        errorThresholdPercentage: 50,
      },
      backoffOptions: {
        initialBaseRetryDelayMs: 1000,
        maxDelayMs: 60000,
        backoffFactor: 2,
      },
    });

    expectTypeOf(worker).toExtend<IWorker>();
  });
});

describe('JobnikSDK constructor parameter types', () => {
  it('requires baseUrl parameter', () => {
    // @ts-expect-error: baseUrl is required
    new JobnikSDK({});
  });

  it('accepts optional logger parameter', () => {
    const sdk = new JobnikSDK({
      metricsRegistry,
      baseUrl: 'http://localhost:8080',
      logger: new NoopLogger(),
    });
    expectTypeOf(sdk).toExtend<JobnikSDK>();
  });

  it('accepts optional httpClientOptions parameter', () => {
    const sdk = new JobnikSDK({
      baseUrl: 'http://localhost:8080',
      metricsRegistry,
      httpClientOptions: {
        retry: { maxRetries: 3 },
      },
    });
    expectTypeOf(sdk).toExtend<JobnikSDK>();
  });
});
