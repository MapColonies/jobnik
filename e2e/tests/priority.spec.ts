import type { ApiClient, JobnikSDK } from '@map-colonies/jobnik-sdk';
import { beforeAll, afterAll, it, describe, expect } from 'vitest';
import { createJobnikSDKInstance } from '../infrastructure/sdk';
import { createJobData, createStageData, createTaskData } from 'infrastructure/data';

describe('Job Priority Test', () => {
  let jobnikSDK: JobnikSDK;
  let api: ApiClient;

  beforeAll(() => {
    jobnikSDK = createJobnikSDKInstance();
    api = jobnikSDK.getApiClient();
  });

  afterAll(() => {
    // teardown code
  });

  it('should dequeue tasks from higher priority jobs first', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    const stageType = `priority-test-${Date.now()}`;

    //#region Create jobs with different priorities
    const priorities = ['LOW', 'MEDIUM', 'VERY_HIGH', 'HIGH'] as const;

    const jobsWithTasks = await Promise.all(
      priorities.map(async (priority) => {
        const job = await producer.createJob({ ...createJobData(), priority });
        expect(job.priority).toBe(priority);

        const stage = await producer.createStage(job.id, { ...createStageData(), type: stageType });
        const [task] = await producer.createTasks(stage.id, stage.type, [createTaskData()]);

        return { priority, task };
      })
    );
    //#endregion

    //#region Dequeue tasks and verify priority order
    const expectedOrder = ['VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW'] as const;

    for (const expectedPriority of expectedOrder) {
      const dequeuedTask = await consumer.dequeueTask(stageType);
      const expectedTask = jobsWithTasks.find((j) => j.priority === expectedPriority)!.task;
      expect(dequeuedTask!.id).toBe(expectedTask!.id);
    }

    const noTask = await consumer.dequeueTask(stageType);
    expect(noTask).toBeNull();
    //#endregion
  });
});
