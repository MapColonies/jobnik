import * as api from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import type { JobnikSDK } from '@map-colonies/jobnik-sdk';
import { beforeAll, afterAll, it, describe, expect } from 'vitest';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { propagation } from '@opentelemetry/api';
import { faker } from '@faker-js/faker';
import { createJobnikSDKInstance } from '../infrastructure/sdk';

import { createJobData, createStageData, createTaskData } from 'infrastructure/data';

const contextManager = new AsyncHooksContextManager();
contextManager.enable();
api.context.setGlobalContextManager(contextManager);
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

describe('shared stage types test', () => {
  let jobnikSDK: JobnikSDK;
  const sharedStageType = faker.lorem.word();

  beforeAll(() => {
    jobnikSDK = createJobnikSDKInstance();
  });

  afterAll(() => {
    // teardown code
  });

  it('should run a shared stage types test', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region create first job
    const jobSampleData1 = createJobData();
    const job1 = await producer.createJob(jobSampleData1);

    //#endregion

    //#region create stage
    const stageSampleData1 = createStageData({ type: sharedStageType });
    const stage1 = await producer.createStage(job1.id, stageSampleData1);

    const taskSampleData1 = createTaskData();
    await producer.createTasks(stage1.id, stage1.type, [taskSampleData1]);
    //#endregion

    //#region create second job
    const jobSampleData2 = createJobData();
    const job2 = await producer.createJob(jobSampleData2);
    //#endregion

    //#region create stage
    const stageSampleData2 = createStageData({ type: sharedStageType });
    const stage2 = await producer.createStage(job2.id, stageSampleData2);

    const taskSampleData2 = createTaskData();
    await producer.createTasks(stage2.id, stage2.type, [taskSampleData2]);

    //#endregion

    const dequeueResult1 = await consumer.dequeueTask(sharedStageType);
    const dequeueResult2 = await consumer.dequeueTask(sharedStageType);
    const dequeueResult3 = await consumer.dequeueTask(sharedStageType);

    expect(dequeueResult1).not.toBeNull();
    expect(dequeueResult2).not.toBeNull();
    expect(dequeueResult3).toBeNull();
  });
});
