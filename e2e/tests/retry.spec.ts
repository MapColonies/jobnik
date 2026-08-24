import type { ApiClient, JobnikSDK } from '@map-colonies/jobnik-sdk';
import { beforeAll, afterAll, it, describe, expect } from 'vitest';
import { createJobnikSDKInstance } from '../infrastructure/sdk';
import { createJobData, createStageData, createTaskData } from 'infrastructure/data';

describe('Task Retry Test', () => {
  let jobnikSDK: JobnikSDK;
  let api: ApiClient;

  beforeAll(() => {
    jobnikSDK = createJobnikSDKInstance();
    api = jobnikSDK.getApiClient();
  });

  afterAll(() => {
    // teardown code
  });

  it('should retry failed task until max attempts reached', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create job with stage and task with maxAttempts
    const job = await producer.createJob(createJobData());
    const stage = await producer.createStage(job.id, createStageData());
    const [task] = await producer.createTasks(stage.id, stage.type, [{ ...createTaskData(), maxAttempts: 3 }]);

    expect(task!.maxAttempts).toBe(3);
    expect(task!.attempts).toBe(0);
    expect(task!.status).toBe('PENDING');
    //#endregion

    //#region Perform 3 attempts - each fails
    const expectedStatuses = ['RETRIED', 'RETRIED', 'FAILED'] as const;

    for (let attempt = 0; attempt < 3; attempt++) {
      const dequeuedTask = await consumer.dequeueTask(stage.type);

      expect(dequeuedTask!.id).toBe(task!.id);
      expect(dequeuedTask!.status).toBe('IN_PROGRESS');
      expect(dequeuedTask!.attempts).toBe(attempt);

      await consumer.markTaskFailed(dequeuedTask!.id);

      const taskAfterFail = await api.GET('/v1/tasks/{taskId}', {
        params: { path: { taskId: task!.id } },
      });

      expect(taskAfterFail.data).toMatchObject({
        status: expectedStatuses[attempt],
        attempts: attempt + 1,
        maxAttempts: 3,
      });
    }
    //#endregion

    //#region Verify stage is marked as failed
    const failedStage = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage.id } },
    });

    expect(failedStage.data).toMatchObject({
      status: 'FAILED',
      summary: {
        total: 1,
        failed: 1,
        inProgress: 0,
        pending: 0,
        completed: 0,
        created: 0,
        retried: 0,
      },
    });
    //#endregion

    //#region Verify job is marked as failed
    const failedJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(failedJob.data).toMatchObject({
      status: 'FAILED',
    });
    //#endregion

    //#region Verify no more tasks can be dequeued
    const noTask = await consumer.dequeueTask(stage.type);

    expect(noTask).toBeNull();
    //#endregion
  });

  it('should successfully complete task after retry', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create job with stage and task
    const job = await producer.createJob(createJobData());
    const stage = await producer.createStage(job.id, createStageData());
    const [task] = await producer.createTasks(stage.id, stage.type, [{ ...createTaskData(), maxAttempts: 3 }]);
    //#endregion

    //#region First attempt - fail
    const dequeuedTask1 = await consumer.dequeueTask(stage.type);

    await consumer.markTaskFailed(dequeuedTask1!.id);

    const retriedTask = await api.GET('/v1/tasks/{taskId}', {
      params: { path: { taskId: task!.id } },
    });

    expect(retriedTask.data?.status).toBe('RETRIED');
    expect(retriedTask.data?.attempts).toBe(1);
    //#endregion

    //#region Second attempt - succeed
    const dequeuedTask2 = await consumer.dequeueTask(stage.type);

    expect(dequeuedTask2!.id).toBe(task!.id);
    expect(dequeuedTask2!.attempts).toBe(1);

    await consumer.markTaskCompleted(dequeuedTask2!.id);

    const completedTask = await api.GET('/v1/tasks/{taskId}', {
      params: { path: { taskId: task!.id } },
    });

    expect(completedTask.data).toMatchObject({
      status: 'COMPLETED',
      attempts: 1,
    });
    //#endregion

    //#region Verify stage completed
    const completedStage = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage.id } },
    });

    expect(completedStage.data).toMatchObject({
      status: 'COMPLETED',
      percentage: 100,
      summary: {
        total: 1,
        completed: 1,
        failed: 0,
        inProgress: 0,
        pending: 0,
        created: 0,
        retried: 0,
      },
    });
    //#endregion

    //#region Verify job completed
    const completedJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(completedJob.data).toMatchObject({
      status: 'COMPLETED',
      percentage: 100,
    });
    //#endregion
  });

  it('should handle default maxAttempts value', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create job with stage and task without specifying maxAttempts
    const job = await producer.createJob(createJobData());
    const stage = await producer.createStage(job.id, createStageData());
    const [task] = await producer.createTasks(stage.id, stage.type, [createTaskData()]);

    expect(task!.maxAttempts).toBeGreaterThan(0);
    //#endregion

    //#region Verify task can be dequeued
    const dequeuedTask = await consumer.dequeueTask(stage.type);

    expect(dequeuedTask!.id).toBe(task!.id);
    expect(dequeuedTask!.attempts).toBe(0);
    //#endregion
  });
});
