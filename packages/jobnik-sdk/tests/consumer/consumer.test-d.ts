import { describe, it, expectTypeOf } from 'vitest';
import { Consumer } from '../../src/clients/consumer';
import type { ApiClient } from '../../src/api';
import type { Task } from '../../src/types/task';
import { NoopLogger } from '../../src/telemetry/noopLogger';
import { Metrics } from '../../src/telemetry/metrics';

// Dummy types for testing
interface TestStageTypes {
  bar: {
    userMetadata: { c: boolean };
    data: { d: string };
    task: {
      userMetadata: { e: string };
      data: { f: number };
    };
  };
}

declare const apiClient: ApiClient;
declare const metrics: Metrics;

describe('Consumer type generics', () => {
  it('can be constructed with custom types', () => {
    const consumer = new Consumer<TestStageTypes>(apiClient, new NoopLogger(), metrics);
    expectTypeOf(consumer).toExtend<Consumer<TestStageTypes>>();
  });

  it('can be constructed without explicit generics (defaults to object)', () => {
    const consumer = new Consumer(apiClient, new NoopLogger(), metrics);
    expectTypeOf(consumer).toExtend<Consumer<object>>();
  });

  it('can be constructed with just one generic type', () => {
    const consumer = new Consumer<TestStageTypes>(apiClient, new NoopLogger(), metrics);
    expectTypeOf(consumer).toExtend<Consumer<TestStageTypes>>();
  });
});

describe('Consumer dequeueTask type tests', () => {
  it('returns correct type for valid stageType', () => {
    const consumer = new Consumer<TestStageTypes>(apiClient, new NoopLogger(), metrics);

    const taskPromise = consumer.dequeueTask('bar');

    expectTypeOf(taskPromise).resolves.exclude<null>().toHaveProperty('userMetadata').toEqualTypeOf<{ e: string } | undefined>();
    expectTypeOf(taskPromise).resolves.exclude<null>().toHaveProperty('data').toEqualTypeOf<{ f: number }>();
  });

  it('can return null when no tasks available', () => {
    const consumer = new Consumer<TestStageTypes>(apiClient, new NoopLogger(), metrics);

    const taskPromise = consumer.dequeueTask('bar');

    expectTypeOf(taskPromise).resolves.toEqualTypeOf<Task<{ userMetadata: { e: string }; data: { f: number } }> | null>();
  });

  it('returns default type for unknown stageType', () => {
    const consumer = new Consumer<TestStageTypes>(apiClient, new NoopLogger(), metrics);

    const taskPromise = consumer.dequeueTask('unknown');

    expectTypeOf(taskPromise).resolves.exclude<null>().toHaveProperty('userMetadata').toEqualTypeOf<Record<string, unknown> | undefined>();
    expectTypeOf(taskPromise).resolves.exclude<null>().toHaveProperty('data').toEqualTypeOf<Record<string, unknown>>();
  });

  it('dequeueTask with multiple stage types works correctly', () => {
    interface MultiStageTypes {
      stage1: {
        userMetadata: { type: 'first' };
        data: { value: string };
        task: {
          userMetadata: { priority: number };
          data: { input: string };
        };
      };
      stage2: {
        userMetadata: { type: 'second' };
        data: { count: number };
        task: {
          userMetadata: { batch: boolean };
          data: { items: string[] };
        };
      };
    }

    const consumer = new Consumer<MultiStageTypes>(apiClient, new NoopLogger(), metrics);

    // Test stage1
    const result1 = consumer.dequeueTask('stage1');
    expectTypeOf(result1).resolves.exclude<null>().toHaveProperty('userMetadata').toEqualTypeOf<{ priority: number } | undefined>();
    expectTypeOf(result1).resolves.exclude<null>().toHaveProperty('data').toEqualTypeOf<{ input: string }>();

    // Test stage2
    const result2 = consumer.dequeueTask('stage2');
    expectTypeOf(result2).resolves.exclude<null>().toHaveProperty('userMetadata').toEqualTypeOf<{ batch: boolean } | undefined>();
    expectTypeOf(result2).resolves.exclude<null>().toHaveProperty('data').toEqualTypeOf<{ items: string[] }>();
  });
});

describe('Consumer with default generics', () => {
  const consumer = new Consumer(apiClient, new NoopLogger(), metrics);

  it('allows any stageType but returns default type', () => {
    const taskPromise = consumer.dequeueTask('any-stage-name');

    expectTypeOf(taskPromise).resolves.exclude<null>().toHaveProperty('data').toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf(taskPromise).resolves.exclude<null>().toHaveProperty('userMetadata').toEqualTypeOf<Record<string, unknown> | undefined>();
  });
});
