import type { ApiClient, JobnikSDK } from '@map-colonies/jobnik-sdk';
import { beforeAll, afterAll, it, describe, expect } from 'vitest';
import { createJobnikSDKInstance } from '../infrastructure/sdk';
import { createJobData, createStageData, createTaskData } from 'infrastructure/data';

describe('Delete Job Tests', () => {
  let jobnikSDK: JobnikSDK;
  let api: ApiClient;

  beforeAll(() => {
    jobnikSDK = createJobnikSDKInstance();
    api = jobnikSDK.getApiClient();
  });

  afterAll(() => {
    // teardown code
  });

  it.each([
    { testName: 'completed', expectedStatus: 'COMPLETED' as const },
    { testName: 'failed', expectedStatus: 'FAILED' as const },
    { testName: 'aborted', expectedStatus: 'ABORTED' as const },
  ])('should delete a $testName job successfully', async ({ testName, expectedStatus }) => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create and setup job to expected status
    const jobData = createJobData();
    const job = await producer.createJob(jobData);

    const stageData = createStageData();
    const stage = await producer.createStage(job.id, stageData);

    const taskData = testName === 'failed' ? { ...createTaskData(), maxAttempts: 1 } : createTaskData();
    await producer.createTasks(stage.id, stage.type, [taskData]);

    const dequeuedTask = await consumer.dequeueTask(stage.type);

    if (testName === 'completed') {
      await consumer.markTaskCompleted(dequeuedTask!.id);
    } else if (testName === 'failed') {
      await consumer.markTaskFailed(dequeuedTask!.id);
    } else if (testName === 'aborted') {
      await api.PUT('/v1/jobs/{jobId}/status', {
        params: { path: { jobId: job.id } },
        body: { status: 'ABORTED' },
      });
    }

    const jobAfterSetup = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(jobAfterSetup.data?.status).toBe(expectedStatus);
    //#endregion

    //#region Delete the job
    const deleteResponse = await api.DELETE('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(deleteResponse.response.status).toBe(200);
    expect(deleteResponse.data).toMatchObject({
      code: 'JOB_DELETED_SUCCESSFULLY',
    });
    //#endregion

    //#region Verify job is deleted
    const getDeletedJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(getDeletedJob.response.status).toBe(404);
    //#endregion
  });

  it('should not delete a job in PENDING state', async () => {
    const producer = jobnikSDK.getProducer();

    //#region Create a job in PENDING state
    const jobData = createJobData();
    const job = await producer.createJob(jobData);

    const stageData = createStageData();
    const stage = await producer.createStage(job.id, stageData);

    await producer.createTasks(stage.id, stage.type, [createTaskData()]);

    const pendingJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(pendingJob.data?.status).toBe('PENDING');
    //#endregion

    //#region Try to delete the pending job
    const deleteResponse = await api.DELETE('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(deleteResponse.response.status).toBe(400);
    expect(deleteResponse.error).toMatchObject({
      code: 'JOB_NOT_IN_FINITE_STATE',
    });
    //#endregion

    //#region Verify job still exists
    const stillExistingJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(stillExistingJob.response.status).toBe(200);
    expect(stillExistingJob.data?.id).toBe(job.id);
    //#endregion
  });

  it('should not delete a job in IN_PROGRESS state', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create a job and start a task
    const jobData = createJobData();
    const job = await producer.createJob(jobData);

    const stageData = createStageData();
    const stage = await producer.createStage(job.id, stageData);

    await producer.createTasks(stage.id, stage.type, [createTaskData()]);

    await consumer.dequeueTask(stage.type);

    const inProgressJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(inProgressJob.data?.status).toBe('IN_PROGRESS');
    //#endregion

    //#region Try to delete the in-progress job
    const deleteResponse = await api.DELETE('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(deleteResponse.response.status).toBe(400);
    expect(deleteResponse.error).toMatchObject({
      code: 'JOB_NOT_IN_FINITE_STATE',
    });
    //#endregion

    //#region Verify job still exists
    const stillExistingJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(stillExistingJob.response.status).toBe(200);
    expect(stillExistingJob.data?.id).toBe(job.id);
    //#endregion
  });

  it('should not delete a job in PAUSED state', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create a job and pause it
    const jobData = createJobData();
    const job = await producer.createJob(jobData);

    const stageData = createStageData();
    const stage = await producer.createStage(job.id, stageData);

    await producer.createTasks(stage.id, stage.type, [createTaskData()]);

    // Start the job
    await consumer.dequeueTask(stage.type);

    // Pause it
    await api.PUT('/v1/jobs/{jobId}/status', {
      params: { path: { jobId: job.id } },
      body: { status: 'PAUSED' },
    });

    const pausedJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(pausedJob.data?.status).toBe('PAUSED');
    //#endregion

    //#region Try to delete the paused job
    const deleteResponse = await api.DELETE('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(deleteResponse.response.status).toBe(400);
    expect(deleteResponse.error).toMatchObject({
      code: 'JOB_NOT_IN_FINITE_STATE',
    });
    //#endregion
  });

  it('should return 404 when deleting non-existent job', async () => {
    //#region Try to delete non-existent job
    const fakeJobId = '00000000-0000-0000-0000-000000000000' as const;

    const deleteResponse = await api.DELETE('/v1/jobs/{jobId}', {
      // @ts-expect-error - Testing non-existent job
      params: { path: { jobId: fakeJobId } },
    });

    expect(deleteResponse.response.status).toBe(404);
    expect(deleteResponse.error).toMatchObject({
      code: 'JOB_NOT_FOUND',
    });
    //#endregion
  });

  it('should cascade delete all stages and tasks when job is deleted', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create job with multiple stages and tasks
    const jobData = createJobData();
    const job = await producer.createJob(jobData);

    const stage1Data = createStageData();
    const stage1 = await producer.createStage(job.id, stage1Data);
    const [task1] = await producer.createTasks(stage1.id, stage1.type, [createTaskData()]);

    const stage2Data = createStageData();
    const stage2 = await producer.createStage(job.id, stage2Data);
    const [task2] = await producer.createTasks(stage2.id, stage2.type, [createTaskData()]);

    // Complete the job
    await consumer.dequeueTask(stage1.type);
    await consumer.markTaskCompleted(task1!.id);

    await consumer.dequeueTask(stage2.type);
    await consumer.markTaskCompleted(task2!.id);

    //#endregion

    //#region Delete the job
    const deleteResponse = await api.DELETE('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(deleteResponse.response.status).toBe(200);
    //#endregion

    //#region Verify stages are deleted
    const getStage1 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage1.id } },
    });

    expect(getStage1.response.status).toBe(404);

    const getStage2 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage2.id } },
    });

    expect(getStage2.response.status).toBe(404);
    //#endregion

    //#region Verify tasks are deleted
    const getTask1 = await api.GET('/v1/tasks/{taskId}', {
      params: { path: { taskId: task1!.id } },
    });

    expect(getTask1.response.status).toBe(404);

    const getTask2 = await api.GET('/v1/tasks/{taskId}', {
      params: { path: { taskId: task2!.id } },
    });

    expect(getTask2.response.status).toBe(404);
    //#endregion
  });
});
