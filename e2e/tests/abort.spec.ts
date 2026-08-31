import type { ApiClient, JobnikSDK } from '@map-colonies/jobnik-sdk';
import { beforeAll, afterAll, it, describe, expect } from 'vitest';
import { createJobnikSDKInstance } from '../infrastructure/sdk';
import { createJobData, createStageData, createTaskData } from 'infrastructure/data';

describe('Job Abortion Test', () => {
  let jobnikSDK: JobnikSDK;
  let api: ApiClient;

  beforeAll(() => {
    jobnikSDK = createJobnikSDKInstance();
    api = jobnikSDK.getApiClient();
  });

  afterAll(() => {
    // teardown code
  });

  it('should abort a job in progress and cascade to all stages and tasks', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create job with two stages
    const jobSampleData = createJobData();
    const job = await producer.createJob(jobSampleData);

    // Create stage with task
    const stageData = createStageData();
    const stage = await producer.createStage(job.id, stageData);
    const firstTaskData = createTaskData();
    const secondTaskData = createTaskData();
    await producer.createTasks(stage.id, stage.type, [firstTaskData, secondTaskData]);

    //#region Start first task to put job in IN_PROGRESS state
    await consumer.dequeueTask(stage.type);

    const jobInProgress = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(jobInProgress.data).toMatchObject({
      status: 'IN_PROGRESS',
    });
    //#endregion

    //#region Abort the job
    const abortResponse = await api.PUT('/v1/jobs/{jobId}/status', {
      params: { path: { jobId: job.id } },
      body: { status: 'ABORTED' },
    });

    expect(abortResponse).toMatchObject({
      data: { code: 'JOB_MODIFIED_SUCCESSFULLY' },
    });
    //#endregion

    //#region Verify job is aborted
    const abortedJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(abortedJob.data).toMatchObject({
      status: 'ABORTED',
    });
    //#endregion

    //#region Verify second stage is aborted - can't dequeue tasks from aborted jobs
    const dequeueSecondTaskResponse = await consumer.dequeueTask(stage.type);

    expect(dequeueSecondTaskResponse).toBeNull();
    //#endregion
  });

  it('should not allow aborting a job that is already in finite state', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create and complete a simple job
    const jobSampleData = createJobData();
    const job = await producer.createJob(jobSampleData);

    const stageData = createStageData();
    const stage = await producer.createStage(job.id, stageData);
    const taskData = createTaskData();
    await producer.createTasks(stage.id, stage.type, [taskData]);

    const dequeuedTask = await consumer.dequeueTask(stage.type);

    expect(dequeuedTask).toHaveProperty('stageId', stage.id);

    await consumer.markTaskCompleted(dequeuedTask!.id);
    const completedJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(completedJob.data!.status).toBe('COMPLETED');
    //#endregion

    //#region Try to abort completed job - should succeed (abort is idempotent for terminal states)
    const abortResponse = await api.PUT('/v1/jobs/{jobId}/status', {
      params: { path: { jobId: job.id } },
      body: { status: 'ABORTED' },
    });

    // According to OpenAPI, ABORTED is a valid user operation
    expect(abortResponse.error).toMatchObject({
      message: 'Illegal status transition from COMPLETED to ABORTED',
      code: 'ILLEGAL_JOB_STATUS_TRANSITION',
    });
    //#endregion
  });
});
