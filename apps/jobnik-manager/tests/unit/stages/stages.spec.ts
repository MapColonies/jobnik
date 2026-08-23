/* eslint-disable @typescript-eslint/naming-convention */
import { describe, beforeEach, afterEach, it, expect, vi, beforeAll } from 'vitest';
import type { Logger } from '@map-colonies/js-logger';
import { jsLogger } from '@map-colonies/js-logger';
import { faker } from '@faker-js/faker';
import { trace } from '@opentelemetry/api';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prismaClient';
import { Prisma, StageOperationStatus, JobOperationStatus } from '@prismaClient';
import { StageManager } from '@src/stages/models/manager';
import { JobManager } from '@src/jobs/models/manager';
import { errorMessages as jobsErrorMessages } from '@src/jobs/models/errors';
import { illegalStatusTransitionErrorMessage, prismaKnownErrors } from '@src/common/errors';
import { errorMessages as stagesErrorMessages } from '@src/stages/models/errors';
import type { StageCreateModel, StageIncludingJob, UpdateSummaryCount } from '@src/stages/models/models';
import { defaultStatusCounts } from '@src/stages/models/helper';
import { StageRepository } from '@src/stages/DAL/stageRepository';
import type { JobPrismaObject } from '@src/jobs/models/models';
import { SERVICE_NAME } from '@src/common/constants';
import { JobInFiniteStateError } from '@src/common/generated/errors';
import {
  completedStageXstatePersistentSnapshot,
  inProgressStageXstatePersistentSnapshot,
  jobEntityWithAbortStatus,
  jobEntityWithStages,
  jobId,
  pendingStageXstatePersistentSnapshot,
  stageEntity,
} from '../data';
import type { StageWithTasks } from '../generator';
import { createStageEntity, createJobEntity, createTaskEntity } from '../generator';

let jobManager: JobManager;
let stageManager: StageManager;
let stageRepository: StageRepository;
let prisma: DeepMockProxy<PrismaClient>;
const tracer = trace.getTracer(SERVICE_NAME);
type StageAggregateResult = Prisma.GetStageAggregateType<Prisma.StageAggregateArgs>;

const notFoundError = new Prisma.PrismaClientKnownRequestError('RECORD_NOT_FOUND', { code: prismaKnownErrors.recordNotFound, clientVersion: '1' });

describe('JobManager', () => {
  let logger: Logger;

  beforeAll(function () {
    logger = jsLogger({ enabled: false });
  });

  beforeEach(function () {
    prisma = mockDeep<PrismaClient>();
    jobManager = new JobManager(logger, prisma, tracer);
    stageRepository = new StageRepository(logger, prisma);
    stageManager = new StageManager(logger, prisma, tracer, stageRepository, jobManager);
  });

  afterEach(function () {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('#Stages', () => {
    describe('#getStages', () => {
      describe('#HappyPath', () => {
        it('should return array with single stage formatted object by criteria without tasks', async function () {
          const stageEntity = createStageEntity({ type: 'SOME_STAGE_TYPE' });
          prisma.stage.findMany.mockResolvedValue([stageEntity]);
          prisma.stage.count.mockResolvedValue(1);

          const result = await stageManager.getStages({ stage_type: 'SOME_STAGE_TYPE' });
          const { xstate, task, tracestate, ...rest } = stageEntity;

          const expectedStage = [rest];

          expect(result.total).toBe(1);
          expect(result.items).toMatchObject(expectedStage);
          expect(result.items[0]?.tasks).toBeUndefined();
        });

        it('should return array with single stage formatted object by criteria with related tasks', async function () {
          const stageId = faker.string.uuid();
          const taskEntity = createTaskEntity({ stageId });
          const stageEntity = createStageEntity({ id: stageId, task: [taskEntity], type: 'SOME_STAGE_TYPE' });
          prisma.stage.findMany.mockResolvedValue([stageEntity]);
          prisma.stage.count.mockResolvedValue(1);

          const result = await stageManager.getStages({ stage_type: 'SOME_STAGE_TYPE', should_return_tasks: true });
          const { xstate, task, tracestate, ...rest } = stageEntity;

          const expectedStage = [rest];

          expect(result.total).toBe(1);
          expect(result.items).toMatchObject(expectedStage);
          expect(result.items[0]?.tasks).toMatchObject([{ id: taskEntity.id }]);
        });

        it('should return array with all stages when no criteria is provided', async function () {
          const stageEntity = createStageEntity({});
          prisma.stage.findMany.mockResolvedValue([stageEntity]);
          prisma.stage.count.mockResolvedValue(1);

          const result = await stageManager.getStages(undefined);
          const { xstate, task, tracestate, ...rest } = stageEntity;

          const expectedStage = [rest];

          expect(result.total).toBe(1);
          expect(result.items).toMatchObject(expectedStage);
        });
      });

      describe('#SadPath', () => {
        it('should failed on db error when find stages', async function () {
          const prismaCreateJobMock = prisma.stage.findMany.mockRejectedValueOnce(new Error('db connection error'));

          await expect(stageManager.getStages({ stage_type: 'SOME_STAGE_TYPE' })).rejects.toThrow('db connection error');

          expect(prismaCreateJobMock).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('#getStageById', () => {
      describe('#HappyPath', () => {
        it('should return stage object by provided id', async function () {
          const stageEntity = createStageEntity({});
          const stageId = stageEntity.id;
          prisma.stage.findUnique.mockResolvedValue(stageEntity);

          const stage = await stageManager.getStageById(stageId);

          const { xstate, task, tracestate, ...rest } = stageEntity;

          const expectedStage = rest;

          expect(stage).toMatchObject(expectedStage);
          expect(stage.tasks).toBeUndefined();
        });

        it('should return stage object by provided id with related tasks', async function () {
          const stageId = faker.string.uuid();
          const taskEntity = createTaskEntity({ stageId });
          const stageEntity = createStageEntity({ id: stageId, task: [taskEntity] });

          prisma.stage.findUnique.mockResolvedValue(stageEntity);

          const stage = await stageManager.getStageById(stageId);

          const { xstate, task, tracestate, ...rest } = stageEntity;

          const expectedStage = rest;

          expect(stage).toMatchObject(expectedStage);
          expect(stage.tasks).toMatchObject([{ id: taskEntity.id }]);
        });
      });

      describe('#BadPath', () => {
        it('should result in failure when attempting to retrieve a job with a non-existent stage', async function () {
          prisma.stage.findUnique.mockResolvedValue(null);

          await expect(stageManager.getStageById('some_id')).rejects.toThrow(stagesErrorMessages.stageNotFound);
        });
      });

      describe('#SadPath', () => {
        it('should fail and throw an error if prisma throws an error', async function () {
          prisma.stage.findUnique.mockRejectedValueOnce(new Error('db connection error'));

          await expect(stageManager.getStageById('some_id')).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#getStagesByJobId', () => {
      describe('#HappyPath', () => {
        it('should return stage object by provided job id', async function () {
          prisma.job.findUnique.mockResolvedValue(jobEntityWithStages);
          prisma.stage.findMany.mockResolvedValue([stageEntity]);

          const stage = await stageManager.getStagesByJobId(stageEntity.jobId);

          const { xstate, task, tracestate, ...rest } = stageEntity;
          const expectedStage = [rest];

          expect(stage).toMatchObject(expectedStage);
          expect(stage[0]?.tasks).toBeUndefined();
        });

        it('should return stage object by provided job id with related tasks', async function () {
          const stageId = faker.string.uuid();
          const taskEntity = createTaskEntity({ stageId });
          const stageEntity = createStageEntity({ id: stageId, task: [taskEntity] });

          prisma.job.findUnique.mockResolvedValue(jobEntityWithStages);
          prisma.stage.findMany.mockResolvedValue([stageEntity]);

          const stage = await stageManager.getStagesByJobId(stageEntity.jobId, true);

          const { xstate, task, tracestate, ...rest } = stageEntity;

          const expectedStage = [rest];

          expect(stage).toMatchObject(expectedStage);
          expect(stage[0]?.tasks).toMatchObject([{ id: taskEntity.id }]);
        });

        it('should return stages ordered by order field', async function () {
          const jobId = faker.string.uuid();
          const stage1 = createStageEntity({ jobId, order: 1, type: 'FIRST_STAGE' });
          const stage2 = createStageEntity({ jobId, order: 2, type: 'SECOND_STAGE' });
          const stage3 = createStageEntity({ jobId, order: 3, type: 'THIRD_STAGE' });

          // Mock database to return stages in correct order (simulating orderBy)
          const orderedStages = [stage1, stage2, stage3];

          prisma.job.findUnique.mockResolvedValue(jobEntityWithStages);
          prisma.stage.findMany.mockResolvedValue(orderedStages);

          const stages = await stageManager.getStagesByJobId(jobId);

          expect(stages).toMatchObject([
            { id: stage1.id, order: 1 },
            { id: stage2.id, order: 2 },
            { id: stage3.id, order: 3 },
          ]);
        });
      });

      describe('#BadPath', () => {
        it('should failed on not founded stage when getting by non exists job', async function () {
          prisma.job.findUnique.mockResolvedValue(null);

          await expect(stageManager.getStagesByJobId('some_id')).rejects.toThrow(jobsErrorMessages.jobNotFound);
        });
      });

      describe('#SadPath', () => {
        it('should failed on db error when getting desired stage', async function () {
          prisma.job.findUnique.mockRejectedValueOnce(new Error('db connection error'));

          await expect(stageManager.getStagesByJobId('some_id')).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#getSummaryByStageId', () => {
      describe('#HappyPath', () => {
        it("should return stage's summary object by provided stage id", async function () {
          prisma.stage.findUnique.mockResolvedValue(stageEntity);

          const stage = await stageManager.getSummaryByStageId(stageEntity.id);

          expect(stage).toMatchObject({});
        });
      });

      describe('#BadPath', () => {
        it('should failed on not founded stage when getting by non exists job', async function () {
          prisma.stage.findUnique.mockResolvedValue(null);

          await expect(stageManager.getSummaryByStageId('some_id')).rejects.toThrow(stagesErrorMessages.stageNotFound);
        });
      });

      describe('#SadPath', () => {
        it('should failed on db error when getting desired stage', async function () {
          prisma.stage.findUnique.mockRejectedValueOnce(new Error('db connection error'));

          await expect(stageManager.getSummaryByStageId('some_id')).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#updateUserMetadata', () => {
      describe('#HappyPath', () => {
        it("should update successfully stage's metadata object by provided id", async function () {
          const stageEntity = createStageEntity({});
          const stageId = stageEntity.id;
          const prismaUpdateStageMock = prisma.stage.update.mockResolvedValue(stageEntity);

          await stageManager.updateUserMetadata(stageId, { newData: 'test' });

          expect(prismaUpdateStageMock).toHaveBeenCalledTimes(1);
        });
      });

      describe('#BadPath', () => {
        it('should failed on for not exists stage when update user metadata of desired stage', async function () {
          prisma.stage.update.mockRejectedValue(notFoundError);

          await expect(stageManager.updateUserMetadata('someId', { testData: 'some new data' })).rejects.toThrow(stagesErrorMessages.stageNotFound);
        });
      });

      describe('#SadPath', () => {
        it('should failed on db error when update user metadata of desired stage', async function () {
          prisma.stage.update.mockRejectedValueOnce(new Error('db connection error'));

          await expect(stageManager.updateUserMetadata('someId', { testData: 'some new data' })).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#addStage', () => {
      describe('#HappyPath', () => {
        it('should add new stage to existing job stage', async function () {
          const uniqueJobId = faker.string.uuid();
          const uniqueStageId = faker.string.uuid();
          const jobWithOneStageEntity = createJobEntity({ id: uniqueJobId, data: {} });

          prisma.job.findUnique.mockResolvedValue(jobWithOneStageEntity);
          prisma.stage.aggregate.mockResolvedValue({ _max: { order: 1 } } as StageAggregateResult);

          const anotherStagePayload = {
            data: {},
            type: 'SOME_STAGE_TYPE',
            userMetadata: { someData: '123' },
          } satisfies StageCreateModel;

          const anotherStageEntity = createStageEntity({
            jobId: uniqueJobId,
            id: uniqueStageId,
            userMetadata: anotherStagePayload.userMetadata,
            type: anotherStagePayload.type,
            order: 2,
          });

          prisma.stage.create.mockResolvedValue(anotherStageEntity);

          const stagesResponse = await stageManager.addStage(uniqueJobId, anotherStagePayload);

          // Extract unnecessary fields from the stage object and assemble the expected result
          const { xstate, task, tracestate, ...rest } = anotherStageEntity;

          expect(stagesResponse).toMatchObject(rest);
        });

        it('should add stage with WAITING status when startAsWaiting flag is true', async function () {
          const uniqueJobId = faker.string.uuid();
          const uniqueStageId = faker.string.uuid();
          const jobWithOneStageEntity = createJobEntity({ id: uniqueJobId, data: {} });

          prisma.job.findUnique.mockResolvedValue(jobWithOneStageEntity);
          prisma.stage.aggregate.mockResolvedValue({ _max: { order: null } } as StageAggregateResult);

          const anotherStagePayload = {
            data: {},
            type: 'SOME_STAGE_TYPE',
            userMetadata: { someData: '123' },
            startAsWaiting: true,
          } satisfies StageCreateModel;

          const anotherStageEntity = createStageEntity({
            jobId: uniqueJobId,
            id: uniqueStageId,
            userMetadata: anotherStagePayload.userMetadata,
            type: anotherStagePayload.type,
            order: 1,
          });

          prisma.stage.create.mockResolvedValue(anotherStageEntity);

          const stagesResponse = await stageManager.addStage(uniqueJobId, anotherStagePayload);

          // Extract unnecessary fields from the stage object and assemble the expected result
          const { xstate, task, tracestate, ...rest } = anotherStageEntity;

          expect(stagesResponse).toMatchObject(rest);
        });

        it('should assign order 1 to the first stage in a job (internal logic)', async function () {
          const uniqueJobId = faker.string.uuid();
          const uniqueStageId = faker.string.uuid();
          const jobEntity = createJobEntity({ id: uniqueJobId, data: {} });

          prisma.job.findUnique.mockResolvedValue(jobEntity);
          prisma.stage.aggregate.mockResolvedValue({ _max: { order: null } } as StageAggregateResult);

          const stagePayload = {
            data: {},
            type: 'SOME_STAGE_TYPE',
            userMetadata: { testData: 'first' },
          } satisfies StageCreateModel;

          const expectedStageEntity = createStageEntity({
            jobId: uniqueJobId,
            id: uniqueStageId,
            userMetadata: stagePayload.userMetadata,
            type: stagePayload.type,
            order: 1,
          });

          prisma.stage.create.mockResolvedValue(expectedStageEntity);

          const result = await stageManager.addStage(uniqueJobId, stagePayload);

          expect(result).toMatchObject({
            id: expectedStageEntity.id,
            order: 1,
          });
        });

        it('should assign incremental order numbers for multiple stages in the same job (internal logic)', async function () {
          const uniqueJobId = faker.string.uuid();
          const uniqueStageId = faker.string.uuid();
          const jobEntity = createJobEntity({ id: uniqueJobId, data: {} });

          prisma.job.findUnique.mockResolvedValue(jobEntity);
          prisma.stage.aggregate.mockResolvedValue({ _max: { order: 3 } } as StageAggregateResult);

          const stagePayload = {
            data: {},
            type: 'FOURTH_STAGE_TYPE',
            userMetadata: { testData: 'fourth' },
          } satisfies StageCreateModel;

          const expectedStageEntity = createStageEntity({
            jobId: uniqueJobId,
            id: uniqueStageId,
            userMetadata: stagePayload.userMetadata,
            type: stagePayload.type,
            order: 4,
          });

          prisma.stage.create.mockResolvedValue(expectedStageEntity);

          const result = await stageManager.addStage(uniqueJobId, stagePayload);

          expect(result).toMatchObject({
            id: expectedStageEntity.id,
            order: 4,
          });
        });

        it('should assign independent order numbers for stages in different jobs (internal logic)', async function () {
          const jobId1 = faker.string.uuid();
          const jobId2 = faker.string.uuid();
          const stageId1 = faker.string.uuid();
          const stageId2 = faker.string.uuid();

          const jobEntity1 = createJobEntity({ id: jobId1, data: {} });
          const jobEntity2 = createJobEntity({ id: jobId2, data: {} });

          // For job1: already has 2 stages
          prisma.job.findUnique.mockResolvedValueOnce(jobEntity1).mockResolvedValueOnce(jobEntity2);
          prisma.stage.aggregate
            .mockResolvedValueOnce({ _max: { order: 2 } } as StageAggregateResult)
            .mockResolvedValueOnce({ _max: { order: null } } as StageAggregateResult);

          const stagePayload1 = {
            data: {},
            type: 'JOB1_STAGE',
            userMetadata: { job: 'job1' },
          } satisfies StageCreateModel;

          const stagePayload2 = {
            data: {},
            type: 'JOB2_STAGE',
            userMetadata: { job: 'job2' },
          } satisfies StageCreateModel;

          const expectedStageEntity1 = createStageEntity({
            jobId: jobId1,
            id: stageId1,
            order: 3, // Should be 3 for job1
          });

          const expectedStageEntity2 = createStageEntity({
            jobId: jobId2,
            id: stageId2,
            order: 1, // Should be 1 for job2
          });

          prisma.stage.create.mockResolvedValueOnce(expectedStageEntity1).mockResolvedValueOnce(expectedStageEntity2);

          const result1 = await stageManager.addStage(jobId1, stagePayload1);
          const result2 = await stageManager.addStage(jobId2, stagePayload2);

          expect(result1).toMatchObject({
            id: expectedStageEntity1.id,
            order: 3,
          });
          expect(result2).toMatchObject({
            id: expectedStageEntity2.id,
            order: 1,
          });
        });
      });

      describe('#BadPath', () => {
        it('should reject adding stage to a non-existent job', async function () {
          prisma.job.findUnique.mockResolvedValue(null);

          await expect(stageManager.addStage('someId', {} as unknown as StageCreateModel)).rejects.toThrow(jobsErrorMessages.jobNotFound);
        });

        it('should reject adding stage to a finite job', async function () {
          prisma.job.findUnique.mockResolvedValue({ ...jobEntityWithAbortStatus });

          await expect(stageManager.addStage('someId', {} as unknown as StageCreateModel)).rejects.toThrow(
            new JobInFiniteStateError(jobsErrorMessages.jobAlreadyFinishedStagesError)
          );
        });
      });

      describe('#SadPath', () => {
        it('should fail with a database error when adding stage', async function () {
          const jobEntity = createJobEntity({});
          prisma.job.findUnique.mockResolvedValueOnce(jobEntity);
          prisma.stage.aggregate.mockResolvedValueOnce({ _max: { order: null } } as StageAggregateResult); // No existing stages
          prisma.stage.create.mockRejectedValueOnce(new Error('db connection error'));

          await expect(stageManager.addStage(jobEntity.id, {} as unknown as StageCreateModel)).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#updateStatus', () => {
      describe('#HappyPath', () => {
        it('should successfully update stage status by id', async function () {
          const stageId = faker.string.uuid();
          const stageEntityResult = { ...stageEntity, id: stageId, job: { status: JobOperationStatus.CREATED } } as unknown as StageWithTasks;

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              stage: {
                findUnique: vi.fn().mockResolvedValue(stageEntityResult),
                update: vi.fn().mockResolvedValue({ ...stageEntity, id: stageId }),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(stageManager.updateStatus(stageEntity.id, StageOperationStatus.PENDING)).toResolve();
        });

        it('should successfully update stage status by id with previous stage check', async function () {
          const stageId = faker.string.uuid();
          const stageEntityResult = {
            ...stageEntity,
            id: stageId,
            job: { status: JobOperationStatus.CREATED },
            order: 2,
          } as unknown as StageWithTasks;

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              stage: {
                findUnique: vi.fn().mockResolvedValue(stageEntityResult),
                update: vi.fn().mockResolvedValue({ ...stageEntity, id: stageId }),
                findFirst: vi.fn().mockResolvedValue({ ...stageEntity, status: StageOperationStatus.COMPLETED }),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(stageManager.updateStatus(stageEntity.id, StageOperationStatus.PENDING)).toResolve();
        });

        it('should successfully update next ordered stage status to pending after completion of current', async function () {
          const stageId = faker.string.uuid();
          const stageId2 = faker.string.uuid();
          const stageEntityOrder1 = {
            ...stageEntity,
            id: stageId,
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            job: { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
            order: 1,
          } as unknown as StageWithTasks;

          const stageEntityOrder2 = {
            ...stageEntity,
            id: stageId2,
            status: StageOperationStatus.CREATED,
            job: { ...jobEntityWithStages, status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
            order: 2,
          } as unknown as StageWithTasks;

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              stage: {
                findUnique: vi.fn().mockResolvedValueOnce(stageEntityOrder1).mockResolvedValueOnce(stageEntityOrder2),
                update: vi
                  .fn()
                  .mockResolvedValueOnce({
                    ...stageEntityOrder1,
                    status: StageOperationStatus.COMPLETED,
                    xstate: completedStageXstatePersistentSnapshot,
                  })
                  .mockResolvedValueOnce(stageEntityOrder2),
                findFirst: vi.fn().mockResolvedValue({
                  ...stageEntityOrder1,
                  status: StageOperationStatus.COMPLETED,
                  xstate: completedStageXstatePersistentSnapshot,
                }),
                count: vi.fn().mockResolvedValue(2).mockResolvedValueOnce(1),
              },
              job: {
                update: vi.fn().mockResolvedValue(jobEntityWithStages),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(stageManager.updateStatus(stageId, StageOperationStatus.COMPLETED)).toResolve();
        });

        it('should successfully complete the final stage and also complete the job', async function () {
          const stageId = faker.string.uuid();
          const stageEntityObject = {
            ...stageEntity,
            id: stageId,
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            job: { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
            order: 1,
          } as unknown as StageWithTasks;

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              stage: {
                findUnique: vi.fn().mockResolvedValueOnce(stageEntityObject),
                findFirst: vi.fn().mockResolvedValue(null),
                update: vi.fn().mockResolvedValueOnce({
                  ...stageEntityObject,
                  status: StageOperationStatus.COMPLETED,
                  xstate: completedStageXstatePersistentSnapshot,
                }),
                count: vi.fn().mockResolvedValue(1),
              },
              job: {
                findUnique: vi.fn().mockResolvedValue({
                  ...jobEntityWithStages,
                  status: JobOperationStatus.IN_PROGRESS,
                  xstate: inProgressStageXstatePersistentSnapshot,
                }),
                update: vi.fn().mockResolvedValue({ ...jobEntityWithStages, status: JobOperationStatus.COMPLETED }),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(stageManager.updateStatus(stageEntity.id, StageOperationStatus.COMPLETED)).toResolve();
        });

        it("should successfully complete stage and also update in-progress job's percentage", async function () {
          const stageId = faker.string.uuid();
          const stageEntityOrder1 = {
            ...stageEntity,
            id: stageId,
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            job: { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
            order: 1,
          } as unknown as StageWithTasks;

          const stageEntityOrder2 = {
            ...stageEntity,
            id: stageId,
            status: StageOperationStatus.CREATED,
            job: { status: JobOperationStatus.CREATED },
            order: 2,
          } as unknown as StageWithTasks;

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              stage: {
                findUnique: vi.fn().mockResolvedValueOnce(stageEntityOrder1).mockResolvedValueOnce(stageEntityOrder2),
                update: vi
                  .fn()
                  .mockResolvedValueOnce({
                    ...stageEntityOrder1,
                    status: StageOperationStatus.COMPLETED,
                    xstate: completedStageXstatePersistentSnapshot,
                  })
                  .mockResolvedValueOnce(stageEntityOrder2)
                  .mockResolvedValueOnce(stageEntityOrder2),
                findFirst: vi.fn().mockResolvedValueOnce({ ...stageEntityOrder2, status: StageOperationStatus.COMPLETED }),
                count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
              },
              job: {
                update: vi.fn().mockResolvedValue(jobEntityWithStages),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(stageManager.updateStatus(stageEntity.id, StageOperationStatus.COMPLETED)).toResolve();
        });

        it('should successfully update stage to IN_PROGRESS and move also the PENDING job to IN_PROGRESS', async function () {
          const stageId = faker.string.uuid();
          const stageEntityResult = {
            ...stageEntity,
            id: stageId,
            status: StageOperationStatus.PENDING,
            xstate: pendingStageXstatePersistentSnapshot,
            job: { status: JobOperationStatus.PENDING, id: jobId },
          } as unknown as StageWithTasks;

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              stage: {
                findUnique: vi.fn().mockResolvedValue(stageEntityResult),
                update: vi.fn().mockResolvedValue({ ...stageEntity, id: stageId }),
              },
              job: {
                findUnique: vi
                  .fn()
                  .mockResolvedValue({ ...jobEntityWithStages, status: JobOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }),
                update: vi.fn().mockResolvedValue(jobEntityWithStages),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(stageManager.updateStatus(stageEntity.id, StageOperationStatus.IN_PROGRESS)).toResolve();
        });
      });

      describe('#BadPath', () => {
        it('should fail when updating status for a state that does not exist', async function () {
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              stage: {
                findUnique: vi.fn().mockResolvedValue(null),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(stageManager.updateStatus('someId', StageOperationStatus.PENDING)).rejects.toThrow(stagesErrorMessages.stageNotFound);
        });

        it('should fail when updating status for a stage before previous completed', async function () {
          const stageId = faker.string.uuid();
          const stageEntityResult = {
            ...stageEntity,
            id: stageId,
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            job: { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
            order: 2,
          } as unknown as StageWithTasks;

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              stage: {
                findUnique: vi.fn().mockResolvedValue(stageEntityResult),
                findFirst: vi.fn().mockResolvedValue({ ...stageEntity, status: StageOperationStatus.IN_PROGRESS }),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(stageManager.updateStatus(stageId, StageOperationStatus.PENDING)).rejects.toThrow('Previous stage is not COMPLETED');
        });

        it('should fail on invalid status transition', async function () {
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              stage: {
                findUnique: vi.fn().mockResolvedValue({ ...stageEntity, job: { status: JobOperationStatus.IN_PROGRESS } }),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(stageManager.updateStatus(stageEntity.id, StageOperationStatus.COMPLETED)).rejects.toThrow(
            illegalStatusTransitionErrorMessage(stageEntity.status, StageOperationStatus.COMPLETED)
          );
        });
      });

      describe('#SadPath', () => {
        it('should fail with a database error when updating status', async function () {
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              stage: {
                findUnique: vi.fn().mockRejectedValueOnce(new Error('db connection error')),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(stageManager.updateStatus('someId', StageOperationStatus.COMPLETED)).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#updateStageProgressFromTaskChanges', () => {
      describe('#HappyPath', () => {
        it('should update stage data according task progressing', async function () {
          const updateSummaryCount = {} as unknown as UpdateSummaryCount;

          const jobId = faker.string.uuid();
          const stageId = faker.string.uuid();
          const jobEntity = createJobEntity({ id: jobId }) as unknown as JobPrismaObject;
          const stageEntity = createStageEntity({
            jobId: jobEntity.id,
            id: stageId,
            status: StageOperationStatus.PENDING,
            xstate: pendingStageXstatePersistentSnapshot,
            summary: { ...defaultStatusCounts, total: 2, inProgress: 1 },
          }) as StageIncludingJob;

          const mockTx = {
            stage: {
              findUnique: vi.fn().mockResolvedValue({
                ...stageEntity,
                job: { ...jobEntity, status: JobOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot },
              }),
              update: vi.fn().mockResolvedValueOnce(null),
            },
          } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

          vi.spyOn(stageRepository, 'updateStageSummary').mockResolvedValueOnce({ ...defaultStatusCounts, total: 2, inProgress: 1 });
          vi.spyOn(stageManager, 'updateStatus').mockResolvedValueOnce(undefined);

          await expect(stageManager.updateStageProgressFromTaskChanges(stageId, updateSummaryCount, mockTx)).toResolve();
        });

        it('should update stage data according with auto completed', async function () {
          const updateSummaryCount = {} as unknown as UpdateSummaryCount;

          const jobId = faker.string.uuid();
          const stageId = faker.string.uuid();
          const jobEntity = createJobEntity({
            id: jobId,
            status: JobOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
          }) as unknown as JobPrismaObject;
          const stageEntity = createStageEntity({
            jobId: jobEntity.id,
            id: stageId,
            summary: { ...defaultStatusCounts, total: 2, inProgress: 1 },
          }) as StageIncludingJob;

          const mockTx = {
            stage: {
              findUnique: vi.fn().mockResolvedValue({
                ...stageEntity,
                job: { ...jobEntity, status: JobOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot },
              }),
              update: vi.fn().mockResolvedValueOnce(null),
              count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(2),
            },
            job: {
              findUnique: vi.fn().mockResolvedValue(jobEntity),
              update: vi.fn().mockResolvedValue(null),
            },
          } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

          vi.spyOn(stageRepository, 'updateStageSummary').mockResolvedValueOnce({ ...defaultStatusCounts, total: 2, completed: 2 });
          vi.spyOn(stageManager, 'updateStatus').mockResolvedValueOnce(undefined);

          await expect(stageManager.updateStageProgressFromTaskChanges(stageId, updateSummaryCount, mockTx)).toResolve();
        });
      });
    });
  });
});
