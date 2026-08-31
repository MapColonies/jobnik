import * as api from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { ApiClient, JobnikSDK } from '@map-colonies/jobnik-sdk';
import { beforeAll, afterAll, it, describe, expect } from 'vitest';
import { createJobnikSDKInstance } from '../infrastructure/sdk';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { propagation } from '@opentelemetry/api';

import { createJobData, createStageData, createTaskData } from 'infrastructure/data';

const contextManager = new AsyncHooksContextManager();
contextManager.enable();
api.context.setGlobalContextManager(contextManager);
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

const expectedInitialSummary = {
  pending: 1,
  inProgress: 0,
  completed: 0,
  failed: 0,
  created: 0,
  retried: 0,
  total: 1,
};

describe('simple test', () => {
  let jobnikSDK: JobnikSDK;
  let api: ApiClient;

  beforeAll(() => {
    jobnikSDK = createJobnikSDKInstance();
    api = jobnikSDK.getApiClient();
  });

  afterAll(() => {
    // teardown code
  });

  it('should run a simple test', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();
    //#region create job

    const jobSampleData = createJobData();
    const job = await producer.createJob(jobSampleData);

    //#endregion

    //#region create stage 1
    const stageSampleDataFirst = createStageData();
    const firstStage = await producer.createStage(job.id, stageSampleDataFirst);

    const taskSampleDataFirst = createTaskData();
    const firstTask = await producer.createTasks(firstStage.id, firstStage.type, [taskSampleDataFirst]);
    //#endregion

    //#region create stage 2
    const stageSampleDataSecond = createStageData();
    const secondStage = await producer.createStage(job.id, stageSampleDataSecond);

    const taskSampleDataSecond = createTaskData();
    await producer.createTasks(secondStage.id, secondStage.type, [taskSampleDataSecond]);

    //#endregion

    //#region assert initial state
    const firstStageSummary = await api.GET('/v1/stages/{stageId}/summary', {
      params: { path: { stageId: firstStage.id } },
    });
    expect(firstStageSummary.data).toMatchObject(expectedInitialSummary);

    const secondStageSummary = await api.GET('/v1/stages/{stageId}/summary', {
      params: { path: { stageId: secondStage.id } },
    });
    expect(secondStageSummary.data).toMatchObject(expectedInitialSummary);

    expect(secondStage.status).toBe('CREATED');

    //#endregion

    // start running the first task

    await consumer.dequeueTask(firstStage.type);

    //#region assert progress
    // validate that the first task started also progressed the stage
    const firstStageRunning = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: firstStage.id } },
    });

    expect(firstStageRunning.data).toMatchObject({
      status: 'IN_PROGRESS',
      summary: {
        total: 1,
        inProgress: 1,
        pending: 0,
        completed: 0,
        failed: 0,
        created: 0,
        retried: 0,
      },
    });

    const currentJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(currentJob.data).toMatchObject({
      status: 'IN_PROGRESS',
      percentage: 0,
    });

    //#endregion

    //#region complete first task and validate progress

    const completeFirstTaskPromise = consumer.markTaskCompleted(firstTask[0]!.id);

    await expect(completeFirstTaskPromise).resolves.not.toThrow();

    // validate first task completed also progress of stage and job
    const firstStageCompleted = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: firstStage.id } },
    });

    expect(firstStageCompleted.data).toMatchObject({
      status: 'COMPLETED',
      percentage: 100,
      summary: {
        total: 1,
        completed: 1,
        inProgress: 0,
        pending: 0,
        failed: 0,
        created: 0,
        retried: 0,
      },
    });

    //#region Validate second stage now available for dequeueing - changed to PENDING
    const secondStageAfterFirstCompleted = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: secondStage.id } },
    });

    const jobAfterFirstStageCompleted = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(secondStageAfterFirstCompleted.data!.status).toBe('PENDING');
    expect(jobAfterFirstStageCompleted.data).toMatchObject({
      status: 'IN_PROGRESS',
      percentage: 50,
    });

    //#endregion

    //#region complete second stage with related task and validate job completed
    const dequeuedSecondStageTask = await consumer.dequeueTask(secondStage.type);

    const completeSecondTaskPromise = consumer.markTaskCompleted(dequeuedSecondStageTask!.id);

    await expect(completeSecondTaskPromise).resolves.not.toThrow();

    const secondStageCompleted = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: secondStage.id } },
    });

    expect(secondStageCompleted.data).toMatchObject({
      status: 'COMPLETED',
      percentage: 100,
      summary: {
        total: 1,
        completed: 1,
        inProgress: 0,
        pending: 0,
        failed: 0,
        created: 0,
        retried: 0,
      },
    });

    const jobCompleted = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });

    expect(jobCompleted.data).toMatchObject({
      status: 'COMPLETED',
      percentage: 100,
    });

    //#endregion
  });
});
