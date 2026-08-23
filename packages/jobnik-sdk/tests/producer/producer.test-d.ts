/* eslint-disable @typescript-eslint/no-floating-promises */
import { describe, it, expectTypeOf } from 'vitest';
import { Registry } from 'prom-client';
import { Producer } from '../../src/clients/producer';
import type { ApiClient } from '../../src/api';
import type { JobId, StageId, TaskId } from '../../src/types/brands';
import type { NewJob, JobData } from '../../src/types/job';
import type { NewStage, InferStageData, StageData } from '../../src/types/stage';
import type { NewTask, InferTaskData } from '../../src/types/task';
import { NoopLogger } from '../../src/telemetry/noopLogger';
import { Metrics } from '../../src/telemetry/metrics';

// Dummy types for testing
interface TestJobTypes {
  foo: {
    userMetadata: { a: string };
    data: { b: number };
  };
}
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

const metrics = new Metrics(new Registry());

declare const apiClient: ApiClient;

describe('Producer type generics', () => {
  it('can be constructed with custom types', () => {
    const producer = new Producer<TestJobTypes, TestStageTypes>(apiClient, new NoopLogger(), metrics);
    expectTypeOf(producer).toExtend<Producer<TestJobTypes, TestStageTypes>>();
  });

  it('can be constructed without explicit generics (defaults to object)', () => {
    const producer = new Producer(apiClient, new NoopLogger(), metrics);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-arguments
    expectTypeOf(producer).toExtend<Producer<Record<string, JobData>, Record<string, StageData>>>();
  });

  it('can be constructed with just one generic type', () => {
    const producer = new Producer<TestJobTypes>(apiClient, new NoopLogger(), metrics);
    expectTypeOf(producer).toExtend<Producer<TestJobTypes>>();
  });
});

describe('Producer.createJob', () => {
  const producer = new Producer<TestJobTypes, TestStageTypes>(apiClient, new NoopLogger(), metrics);

  it('returns branded jobId', () => {
    const jobData: NewJob<TestJobTypes, 'foo'> = {
      name: 'foo',
      userMetadata: { a: 'x' },
      data: { b: 1 },
    };
    const jobPromise = producer.createJob(jobData);

    expectTypeOf(jobPromise).resolves.toHaveProperty('id').toEqualTypeOf<JobId>();
  });

  it('returns correct type for valid jobName', () => {
    const jobData: NewJob<TestJobTypes, 'foo'> = {
      name: 'foo',
      userMetadata: { a: 'x' },
      data: { b: 1 },
    };
    const jobPromise = producer.createJob<'foo'>(jobData);

    expectTypeOf(jobPromise).resolves.toHaveProperty('data').toEqualTypeOf<{ b: number }>();
    expectTypeOf(jobPromise).resolves.toHaveProperty('userMetadata').toEqualTypeOf<{ a: string } | undefined>();
  });

  it('throws a type error if data type is incorrect', () => {
    producer.createJob<'foo'>({
      name: 'foo',
      userMetadata: { a: 'x' },
      // @ts-expect-error: Incorrect data type
      data: { b: '1' },
    });
  });

  it('returns default type for unknown jobName', () => {
    const jobData = { name: 'bar', userMetadata: {} as Record<string, unknown>, data: {} as Record<string, unknown> };

    const jobPromise = producer.createJob(jobData);

    expectTypeOf(jobPromise).resolves.toHaveProperty('data').toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf(jobPromise).resolves.toHaveProperty('userMetadata').toEqualTypeOf<Record<string, unknown> | undefined>();
  });
});

describe('Producer.createStage', () => {
  const producer = new Producer<TestJobTypes, TestStageTypes>(apiClient, new NoopLogger(), metrics);

  it('should require jobId as a branded type', () => {
    expectTypeOf(producer.createStage.bind(producer)).parameter(0).toEqualTypeOf<JobId>();
  });

  it('should have branded types in the return type', () => {
    const stageData: NewStage<'bar', InferStageData<'bar', TestStageTypes>> = {
      type: 'bar',
      userMetadata: { c: true },
      data: { d: 'y' },
    };

    const stagePromise = producer.createStage('jobid' as JobId, stageData);

    expectTypeOf(stagePromise).resolves.toHaveProperty('id').toEqualTypeOf<StageId>();
    expectTypeOf(stagePromise).resolves.toHaveProperty('jobId').toEqualTypeOf<JobId>();
  });

  it('returns correct type for valid stageType', () => {
    const stageData: NewStage<'bar', InferStageData<'bar', TestStageTypes>> = {
      type: 'bar',
      userMetadata: { c: true },
      data: { d: 'y' },
    };

    const stagePromise = producer.createStage('jobid' as JobId, stageData);
    expectTypeOf(stagePromise).resolves.toHaveProperty('type').toEqualTypeOf<'bar'>();
    expectTypeOf(stagePromise).resolves.toHaveProperty('data').toEqualTypeOf<{ d: string }>();
    expectTypeOf(stagePromise).resolves.toHaveProperty('userMetadata').toEqualTypeOf<{ c: boolean } | undefined>();
  });

  it('throws a type error if data type is incorrect', () => {
    producer.createStage('jobid' as JobId, {
      type: 'bar',
      userMetadata: { c: true },
      // @ts-expect-error: Incorrect data type
      data: { d: 3 },
    });
  });

  it('returns default type for unknown stageType', () => {
    const stageData = {
      type: 'baz',
      userMetadata: {} as Record<string, unknown>,
      data: {} as Record<string, unknown>,
      task: { userMetadata: {} as Record<string, unknown>, data: {} as Record<string, unknown> },
    };

    const stagePromise = producer.createStage('jobid' as JobId, stageData);

    expectTypeOf(stagePromise).resolves.toHaveProperty('data').toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf(stagePromise).resolves.toHaveProperty('userMetadata').toEqualTypeOf<Record<string, unknown> | undefined>();
  });
});

describe('Producer.createTask', () => {
  const producer = new Producer<TestJobTypes, TestStageTypes>(apiClient, new NoopLogger(), metrics);

  it('should require branded stageId in the request', () => {
    expectTypeOf(producer.createTasks.bind(producer)).parameter(0).toEqualTypeOf<StageId>();
  });

  it('throws an error if data type is incorrect', () => {
    // @ts-expect-error: Incorrect data type
    producer.createTasks('stageid' as StageId, 'bar', [{ userMetadata: { e: 'true' }, data: { z: 'invalid' } }]);
  });

  it('should return branded types in the return type', () => {
    const taskData: NewTask<InferTaskData<'bar', TestStageTypes>>[] = [{ userMetadata: { e: 'true' }, data: { f: 3 } }];

    const taskPromise = producer.createTasks('stageid' as StageId, 'bar', taskData);

    expectTypeOf(taskPromise).resolves.items.toHaveProperty('id').toEqualTypeOf<TaskId>();
    expectTypeOf(taskPromise).resolves.items.toHaveProperty('stageId').toEqualTypeOf<StageId>();
  });

  it('returns correct type for valid stageType', () => {
    const taskData: NewTask<InferTaskData<'bar', TestStageTypes>>[] = [{ userMetadata: { e: 'true' }, data: { f: 3 } }];

    const taskPromise = producer.createTasks('stageid' as StageId, 'bar', taskData);

    expectTypeOf(taskPromise).resolves.items.toHaveProperty('data').toEqualTypeOf<{ f: number }>();
    expectTypeOf(taskPromise).resolves.items.toHaveProperty('userMetadata').toEqualTypeOf<{ e: string } | undefined>();
  });

  it('returns default type for unknown stageType', () => {
    const taskData: NewTask[] = [{ userMetadata: { e: 'true' }, data: { f: 3 } }];

    const taskPromise = producer.createTasks('stageid' as StageId, 'baz', taskData);

    expectTypeOf(taskPromise).resolves.items.toHaveProperty('data').toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf(taskPromise).resolves.items.toHaveProperty('userMetadata').toEqualTypeOf<Record<string, unknown> | undefined>();
  });
});

describe('Producer with default generics', () => {
  const producer = new Producer(apiClient, new NoopLogger(), metrics);

  it('allows any jobName but returns default type', () => {
    const jobData = { name: 'foo', userMetadata: {} as Record<string, unknown>, data: {} as Record<string, unknown> };

    const jobPromise = producer.createJob(jobData);

    expectTypeOf(jobPromise).resolves.toHaveProperty('data').toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf(jobPromise).resolves.toHaveProperty('userMetadata').toEqualTypeOf<Record<string, unknown> | undefined>();
  });

  it('when creating stages allows any stageType but returns default type', () => {
    const stageData = {
      type: 'bar',
      userMetadata: {} as Record<string, unknown>,
      data: {} as Record<string, unknown>,
      task: { userMetadata: {} as Record<string, unknown>, data: {} as Record<string, unknown> },
    };

    const stagePromise = producer.createStage('jobid' as JobId, stageData);

    expectTypeOf(stagePromise).resolves.toHaveProperty('data').toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf(stagePromise).resolves.toHaveProperty('userMetadata').toEqualTypeOf<Record<string, unknown> | undefined>();
  });

  it('when creating tasks allows any taskType but returns default type', () => {
    const taskData = {
      userMetadata: {},
      data: {},
    } as NewTask;

    const taskPromise = producer.createTasks('stageid' as StageId, 'foo', [taskData]);

    expectTypeOf(taskPromise).resolves.items.toHaveProperty('data').toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf(taskPromise).resolves.items.toHaveProperty('userMetadata').toEqualTypeOf<Record<string, unknown> | undefined>();
  });
});
