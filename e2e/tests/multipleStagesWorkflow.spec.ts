import type { ApiClient, JobnikSDK } from '@map-colonies/jobnik-sdk';
import { beforeAll, afterAll, it, describe, expect } from 'vitest';
import { createJobnikSDKInstance } from '../infrastructure/sdk';
import { createJobData, createStageData, createTaskData } from 'infrastructure/data';

describe('Multiple Stages Workflow Tests', () => {
  let jobnikSDK: JobnikSDK;
  let api: ApiClient;

  beforeAll(() => {
    jobnikSDK = createJobnikSDKInstance();
    api = jobnikSDK.getApiClient();
  });

  afterAll(() => {
    // teardown code
  });

  it('should execute 3 stages in sequence with proper status transitions', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create job with 3 sequential stages
    const jobData = createJobData();
    const job = await producer.createJob(jobData);

    const stage1 = await producer.createStage(job.id, createStageData());
    const [task1] = await producer.createTasks(stage1.id, stage1.type, [createTaskData()]);

    const stage2 = await producer.createStage(job.id, createStageData());
    const [task2] = await producer.createTasks(stage2.id, stage2.type, [createTaskData()]);

    const stage3 = await producer.createStage(job.id, createStageData());
    const [task3] = await producer.createTasks(stage3.id, stage3.type, [createTaskData()]);
    //#endregion

    //#region Verify initial states - only first stage should be PENDING
    const initialStage1 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage1.id } },
    });
    expect(initialStage1.data?.status).toBe('PENDING');

    const initialStage2 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage2.id } },
    });
    expect(initialStage2.data?.status).toBe('CREATED');

    const initialStage3 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage3.id } },
    });
    expect(initialStage3.data?.status).toBe('CREATED');
    //#endregion

    //#region Complete first stage
    await consumer.dequeueTask(stage1.type);

    await consumer.markTaskCompleted(task1!.id);

    const completedStage1 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage1.id } },
    });
    expect(completedStage1.data?.status).toBe('COMPLETED');
    expect(completedStage1.data?.percentage).toBe(100);
    //#endregion

    //#region Verify second stage now available (PENDING)
    const activatedStage2 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage2.id } },
    });
    expect(activatedStage2.data?.status).toBe('PENDING');

    const stillCreatedStage3 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage3.id } },
    });
    expect(stillCreatedStage3.data?.status).toBe('CREATED');
    //#endregion

    //#region Verify job progress after first stage
    const jobAfterStage1 = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });
    expect(jobAfterStage1.data?.status).toBe('IN_PROGRESS');
    expect(jobAfterStage1.data?.percentage).toBeGreaterThan(0);
    expect(jobAfterStage1.data?.percentage).toBeLessThan(100);
    //#endregion

    //#region Complete second stage
    const dequeuedTask2 = await consumer.dequeueTask(stage2.type);

    await consumer.markTaskCompleted(dequeuedTask2!.id);

    const completedStage2 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage2.id } },
    });
    expect(completedStage2.data?.status).toBe('COMPLETED');
    //#endregion

    //#region Verify third stage now available
    const activatedStage3 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage3.id } },
    });
    expect(activatedStage3.data?.status).toBe('PENDING');
    //#endregion

    //#region Verify job progress after second stage
    const jobAfterStage2 = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });
    expect(jobAfterStage2.data?.percentage).toBeGreaterThan(jobAfterStage1.data!.percentage!);
    expect(jobAfterStage2.data?.percentage).toBeLessThan(100);
    //#endregion

    //#region Complete third stage
    const dequeuedTask3 = await consumer.dequeueTask(stage3.type);
    await consumer.markTaskCompleted(dequeuedTask3!.id);

    const completedStage3 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage3.id } },
    });
    expect(completedStage3.data?.status).toBe('COMPLETED');
    //#endregion

    //#region Verify job completed
    const completedJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });
    expect(completedJob.data?.status).toBe('COMPLETED');
    expect(completedJob.data?.percentage).toBe(100);
    //#endregion
  });

  it('should handle 5 stages with multiple tasks per stage', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create job with 5 stages
    const jobData = createJobData();
    const job = await producer.createJob(jobData);

    const stages = [];
    for (let i = 0; i < 5; i++) {
      const stage = await producer.createStage(job.id, createStageData());
      await producer.createTasks(stage.id, stage.type, [createTaskData(), createTaskData()]);
      stages.push(stage);
    }
    //#endregion

    //#region Complete all stages sequentially
    for (const stage of stages) {
      // Complete both tasks for each stage
      for (let i = 0; i < 2; i++) {
        const task = await consumer.dequeueTask(stage.type);
        expect(task).not.toBeNull();
        await consumer.markTaskCompleted(task!.id);
      }

      // Verify stage is completed
      const stageStatus = await api.GET('/v1/stages/{stageId}', {
        params: { path: { stageId: stage.id } },
      });
      expect(stageStatus.data?.status).toBe('COMPLETED');
    }
    //#endregion

    //#region Verify all stages completed in order
    const allStages = await api.GET('/v1/jobs/{jobId}/stages', {
      params: { path: { jobId: job.id } },
    });

    expect(allStages.data).toHaveLength(5);
    allStages.data!.forEach((stage, index) => {
      expect(stage.order).toBe(index + 1);
      expect(stage.status).toBe('COMPLETED');
    });
    //#endregion

    //#region Verify job completed
    const completedJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });
    expect(completedJob.data?.status).toBe('COMPLETED');
    expect(completedJob.data?.percentage).toBe(100);
    //#endregion
  });

  it('should calculate job percentage correctly across multiple stages', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create job with 4 stages
    const jobData = createJobData();
    const job = await producer.createJob(jobData);

    const stage1 = await producer.createStage(job.id, createStageData());
    await producer.createTasks(stage1.id, stage1.type, [createTaskData()]);

    const stage2 = await producer.createStage(job.id, createStageData());
    await producer.createTasks(stage2.id, stage2.type, [createTaskData()]);

    const stage3 = await producer.createStage(job.id, createStageData());
    await producer.createTasks(stage3.id, stage3.type, [createTaskData()]);

    const stage4 = await producer.createStage(job.id, createStageData());
    await producer.createTasks(stage4.id, stage4.type, [createTaskData()]);
    //#endregion

    //#region Track percentage after each stage
    const percentages = [];

    // Initial percentage
    const initial = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });
    percentages.push(initial.data!.percentage!);

    // Complete each stage and track percentage
    for (const stage of [stage1, stage2, stage3, stage4]) {
      const dequeuedTask = await consumer.dequeueTask(stage.type);

      await consumer.markTaskCompleted(dequeuedTask!.id);

      const jobStatus = await api.GET('/v1/jobs/{jobId}', {
        params: { path: { jobId: job.id } },
      });
      percentages.push(jobStatus.data!.percentage!);
    }
    //#endregion

    //#region Verify percentage increases monotonically
    for (let i = 1; i < percentages.length; i++) {
      expect(percentages[i]).toBeGreaterThanOrEqual(percentages[i - 1]!);
    }

    // First should be 0, last should be 100
    expect(percentages[0]).toBe(0);
    expect(percentages[percentages.length - 1]).toBe(100);

    // With 4 stages, each stage should contribute approximately 25%
    // (may vary based on implementation)
    expect(percentages[1]).toBeGreaterThan(0);
    expect(percentages[2]).toBeGreaterThan(percentages[1]!);
    expect(percentages[3]).toBeGreaterThan(percentages[2]!);
    //#endregion
  });

  it('should fail job when a middle stage fails', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create job with 3 stages
    const jobData = createJobData();
    const job = await producer.createJob(jobData);

    const stage1 = await producer.createStage(job.id, createStageData());
    await producer.createTasks(stage1.id, stage1.type, [createTaskData()]);

    const stage2 = await producer.createStage(job.id, createStageData());
    await producer.createTasks(stage2.id, stage2.type, [{ ...createTaskData(), maxAttempts: 1 }]);

    const stage3 = await producer.createStage(job.id, createStageData());
    await producer.createTasks(stage3.id, stage3.type, [createTaskData()]);
    //#endregion

    //#region Complete first stage
    const task1 = await consumer.dequeueTask(stage1.type);

    await consumer.markTaskCompleted(task1!.id);
    //#endregion

    //#region Fail second stage
    const task2 = await consumer.dequeueTask(stage2.type);

    await consumer.markTaskFailed(task2!.id);

    const failedStage2 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage2.id } },
    });

    expect(failedStage2.data?.status).toBe('FAILED');
    //#endregion

    //#region Verify job is failed
    const failedJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });
    expect(failedJob.data?.status).toBe('FAILED');
    //#endregion

    //#region Verify third stage remains in CREATED state
    const unchangedStage3 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage3.id } },
    });
    // Stage 3 should still be CREATED or WAITING since it never became available
    expect(['CREATED', 'WAITING']).toContain(unchangedStage3.data!.status);
    //#endregion

    //#region Verify no more tasks can be dequeued from stage 3
    const noTask = await consumer.dequeueTask(stage3.type);
    expect(noTask).toBeNull();
    //#endregion
  });

  it('should handle WAITING stage in the middle of workflow', async () => {
    const producer = jobnikSDK.getProducer();
    const consumer = jobnikSDK.getConsumer();

    //#region Create job with 3 stages, middle one starts as WAITING
    const jobData = createJobData();
    const job = await producer.createJob(jobData);

    const stage1 = await producer.createStage(job.id, createStageData());
    await producer.createTasks(stage1.id, stage1.type, [createTaskData()]);

    const stage2 = await producer.createStage(job.id, createStageData(), true);

    await producer.createTasks(stage2.id, stage2.type, [createTaskData()]);

    const stage3 = await producer.createStage(job.id, createStageData());
    await producer.createTasks(stage3.id, stage3.type, [createTaskData()]);
    //#endregion

    //#region Complete first stage
    const task1 = await consumer.dequeueTask(stage1.type);

    await consumer.markTaskCompleted(task1!.id);

    const completedStage1 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage1.id } },
    });
    expect(completedStage1.data?.status).toBe('COMPLETED');
    //#endregion

    //#region Verify second stage is WAITING (not PENDING)
    const waitingStage2 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage2.id } },
    });
    expect(waitingStage2.data?.status).toBe('WAITING');
    //#endregion

    //#region Verify cannot dequeue from waiting stage
    const noTask = await consumer.dequeueTask(stage2.type);
    expect(noTask).toBeNull();
    //#endregion

    //#region Manually transition stage to PENDING
    await api.PUT('/v1/stages/{stageId}/status', {
      params: { path: { stageId: stage2.id } },
      body: { status: 'PENDING' },
    });

    const pendingStage2 = await api.GET('/v1/stages/{stageId}', {
      params: { path: { stageId: stage2.id } },
    });
    expect(pendingStage2.data?.status).toBe('PENDING');
    //#endregion

    //#region Complete second stage
    const task2 = await consumer.dequeueTask(stage2.type);

    expect(task2).not.toBeNull();
    await consumer.markTaskCompleted(task2!.id);
    //#endregion

    //#region Complete third stage
    const task3 = await consumer.dequeueTask(stage3.type);

    await consumer.markTaskCompleted(task3!.id);
    //#endregion

    //#region Verify job completed
    const completedJob = await api.GET('/v1/jobs/{jobId}', {
      params: { path: { jobId: job.id } },
    });
    expect(completedJob.data?.status).toBe('COMPLETED');
    //#endregion
  });

  it('should retrieve all stages in correct order via /jobs/{jobId}/stages', async () => {
    const producer = jobnikSDK.getProducer();

    //#region Create job with 4 stages
    const jobData = createJobData();
    const job = await producer.createJob(jobData);

    const stages: Array<{ id: string; type: string; order: number }> = [];
    for (let i = 0; i < 4; i++) {
      const stage = await producer.createStage(job.id, createStageData());
      stages.push(stage);
    }
    //#endregion

    //#region Get all stages via endpoint
    const allStages = await api.GET('/v1/jobs/{jobId}/stages', {
      params: { path: { jobId: job.id } },
    });

    expect(allStages.response.status).toBe(200);
    expect(allStages.data).toHaveLength(4);
    //#endregion

    //#region Verify stages are in order
    allStages.data!.forEach((stage, index) => {
      expect(stage.order).toBe(index + 1);
      expect(stage.id).toBe(stages[index]!.id);
      expect(stage.jobId).toBe(job.id);
    });
    //#endregion
  });
});
