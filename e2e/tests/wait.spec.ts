import * as api from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import type { ApiClient, JobnikSDK } from '@map-colonies/jobnik-sdk';
import { beforeAll, afterAll, it, describe, expect } from 'vitest';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { propagation } from '@opentelemetry/api';
import { createJobnikSDKInstance } from '../infrastructure/sdk';

import { createJobData, createStageData, createTaskData } from 'infrastructure/data';

const contextManager = new AsyncHooksContextManager();
contextManager.enable();
api.context.setGlobalContextManager(contextManager);
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

describe('wait test', () => {
  let jobnikSDK: JobnikSDK;
  let api: ApiClient;

  beforeAll(() => {
    jobnikSDK = createJobnikSDKInstance();
    api = jobnikSDK.getApiClient();
  });

  afterAll(() => {
    // teardown code
  });

  it('should run a wait test', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();
    //#region create job

    const jobSampleData = createJobData();
    const job = await producer.createJob(jobSampleData);

    //#endregion

    //#region create stage
    const stageSampleData = createStageData();
    // startAsWaiting creates the stage as WAITING directly; the status endpoint only accepts
    // PENDING (WAITING is system-managed), so there is no user-facing way to set it here.
    const stage = await producer.createStage(job.id, stageSampleData, true);

    const taskSampleData = createTaskData();
    // Tasks are created PENDING already, even under a WAITING stage; the status endpoint only
    // accepts COMPLETED/FAILED, so there is no user-facing way to set PENDING here.
    await producer.createTasks(stage.id, stage.type, [taskSampleData]);
    //#endregion
    const dequeueResult = await consumer.dequeueTask(stage.type);

    expect(dequeueResult).toBeNull();

    //#region unwait stage
    await api.PUT('/v1/stages/{stageId}/status', {
      body: { status: 'PENDING' },
      params: { path: { stageId: stage.id } },
    });
    //#endregion

    //#region dequeue task after unpause
    const dequeueResultAfterUnpause = await consumer.dequeueTask(stage.type);

    expect(dequeueResultAfterUnpause).not.toBeNull();
    //#endregion
  });
});
