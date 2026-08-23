/* eslint-disable @typescript-eslint/naming-convention */
import { describe, beforeEach, afterEach, it, expect, beforeAll, vi } from 'vitest';
import { jsLogger, type Logger } from '@map-colonies/js-logger';
import { faker } from '@faker-js/faker';
import { trace } from '@opentelemetry/api';
import { subHours, subMinutes } from 'date-fns';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prismaClient';
import { Prisma, StageOperationStatus, TaskOperationStatus, JobOperationStatus } from '@prismaClient';
import { StageManager } from '@src/stages/models/manager';
import { JobManager } from '@src/jobs/models/manager';
import { errorMessages as stagesErrorMessages } from '@src/stages/models/errors';
import { errorMessages as tasksErrorMessages } from '@src/tasks/models/errors';
import { TaskManager } from '@src/tasks/models/manager';
import { prismaKnownErrors } from '@src/common/errors';
import type { TaskCreateModel } from '@src/tasks/models/models';
import { StageRepository } from '@src/stages/DAL/stageRepository';
import { TaskRepository } from '@src/tasks/DAL/taskRepository';
import { SERVICE_NAME } from '@src/common/constants';
import { IllegalTaskStatusTransitionError, NotAllowedToAddTasksToInProgressStageError, StageInFiniteStateError } from '@src/common/generated/errors';
import { getConfig, initConfig } from '@src/common/config';
import { DEFAULT_TRACEPARENT } from '@src/common/utils/tracingHelpers';
import { createJobEntity, createStageEntity, createTaskEntity } from '../generator';
import { abortedStageXstatePersistentSnapshot, inProgressStageXstatePersistentSnapshot, pendingStageXstatePersistentSnapshot } from '../data';

// Test date constants
const ONE_HOUR_AGO = subHours(new Date(), 1);
const FORTY_FIVE_MINUTES_AGO = subMinutes(new Date(), 45);

// Test task entities
const staleTaskOneHour = createTaskEntity({
  status: TaskOperationStatus.IN_PROGRESS,
  startTime: ONE_HOUR_AGO, // 1 hour ago
});

const staleTaskFortyFiveMinutes = createTaskEntity({
  status: TaskOperationStatus.IN_PROGRESS,
  startTime: FORTY_FIVE_MINUTES_AGO, // 45 minutes ago
});

let jobManager: JobManager;
let stageManager: StageManager;
let taskManager: TaskManager;
let stageRepository: StageRepository;
let taskRepository: TaskRepository;
let prisma: DeepMockProxy<PrismaClient>;

const tracer = trace.getTracer(SERVICE_NAME);

let config: ReturnType<typeof getConfig>;

const notFoundError = new Prisma.PrismaClientKnownRequestError('RECORD_NOT_FOUND', { code: prismaKnownErrors.recordNotFound, clientVersion: '1' });

describe('JobManager', () => {
  let logger: Logger;

  beforeAll(async function () {
    logger = jsLogger({ enabled: false });
    await initConfig(true);
  });

  beforeEach(function () {
    config = getConfig();
    prisma = mockDeep<PrismaClient>();
    jobManager = new JobManager(logger, prisma, tracer);
    stageRepository = new StageRepository(logger, prisma);
    taskRepository = new TaskRepository(logger, prisma);
    stageManager = new StageManager(logger, prisma, tracer, stageRepository, jobManager);
    taskManager = new TaskManager(logger, prisma, tracer, stageManager, config, taskRepository);
  });

  afterEach(function () {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('#Tasks', () => {
    describe('#getTasks', () => {
      describe('#HappyPath', () => {
        it('should return array with single task formatted object by criteria', async function () {
          const taskEntity = createTaskEntity({});
          prisma.task.findMany.mockResolvedValue([taskEntity]);
          prisma.task.count.mockResolvedValue(1);

          const result = await taskManager.getTasks({ stage_type: 'SOME_STAGE_TYPE' });

          const { creationTime, updateTime, xstate, startTime, endTime, ...rest } = taskEntity;
          const expectedTask = [{ ...rest, tracestate: undefined, creationTime: creationTime.toISOString(), updateTime: updateTime.toISOString() }];

          expect(result.total).toBe(1);
          expect(result.items).toMatchObject(expectedTask);
        });

        it('should return array with task formatted object by empty criteria', async function () {
          const taskEntity = createTaskEntity({});
          prisma.task.findMany.mockResolvedValue([taskEntity]);
          prisma.task.count.mockResolvedValue(1);

          const result = await taskManager.getTasks({});

          const { creationTime, updateTime, xstate, startTime, endTime, ...rest } = taskEntity;
          const expectedTask = [{ ...rest, tracestate: undefined, creationTime: creationTime.toISOString(), updateTime: updateTime.toISOString() }];

          expect(result.total).toBe(1);
          expect(result.items).toMatchObject(expectedTask);
        });

        it('should return empty array', async function () {
          prisma.task.findMany.mockResolvedValue([]);
          prisma.task.count.mockResolvedValue(0);

          const result = await taskManager.getTasks({ stage_type: 'SOME_STAGE_TYPE' });

          expect(result.total).toBe(0);
          expect(result.items).toMatchObject([]);
        });

        it('should return all tasks when no criteria is provided', async function () {
          const taskEntity = createTaskEntity({});
          prisma.task.findMany.mockResolvedValue([taskEntity]);
          prisma.task.count.mockResolvedValue(1);

          const result = await taskManager.getTasks(undefined);

          expect(result.total).toBe(1);
          expect(result.items).toHaveLength(1);
        });
      });

      describe('#SadPath', () => {
        it('should failed on db error when find tasks', async function () {
          prisma.task.findMany.mockRejectedValueOnce(new Error('db connection error'));

          await expect(taskManager.getTasks({ stage_type: 'SOME_STAGE_TYPE' })).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#getTaskById', () => {
      describe('#HappyPath', () => {
        it('should return task object by provided id', async function () {
          const taskEntity = createTaskEntity({});
          const taskId = taskEntity.id;
          prisma.task.findUnique.mockResolvedValue(taskEntity);

          const task = await taskManager.getTaskById(taskId);

          const { creationTime, updateTime, xstate, startTime, endTime, ...rest } = taskEntity;
          const expectedTask = { ...rest, tracestate: undefined, creationTime: creationTime.toISOString(), updateTime: updateTime.toISOString() };

          expect(task).toMatchObject(expectedTask);
        });
      });

      describe('#BadPath', () => {
        it('should result in failure when attempting to retrieve a task with a non-existent id', async function () {
          prisma.task.findUnique.mockResolvedValue(null);

          await expect(taskManager.getTaskById('some_id')).rejects.toThrow(tasksErrorMessages.taskNotFound);
        });
      });

      describe('#SadPath', () => {
        it('should fail and throw an error if prisma throws an error', async function () {
          prisma.task.findUnique.mockRejectedValueOnce(new Error('db connection error'));

          await expect(taskManager.getTaskById('some_id')).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#getTaskByStageId', () => {
      describe('#HappyPath', () => {
        it('should return task object by provided stage id', async function () {
          const stageEntity = createStageEntity({});
          const taskEntity = createTaskEntity({ stageId: stageEntity.id });
          prisma.stage.findUnique.mockResolvedValue(stageEntity);
          prisma.task.findMany.mockResolvedValue([taskEntity]);
          prisma.task.count.mockResolvedValue(1);

          const result = await taskManager.getTasksByStageId(stageEntity.id, {});

          const { creationTime, updateTime, xstate, startTime, endTime, ...rest } = taskEntity;
          const expectedTask = [{ ...rest, tracestate: undefined, creationTime: creationTime.toISOString(), updateTime: updateTime.toISOString() }];

          expect(result.total).toBe(1);
          expect(result.items).toMatchObject(expectedTask);
        });
      });

      describe('#BadPath', () => {
        it('should failed on not founded task when getting by non exists stage', async function () {
          prisma.stage.findUnique.mockResolvedValue(null);

          await expect(taskManager.getTasksByStageId('some_id', {})).rejects.toThrow(stagesErrorMessages.stageNotFound);
        });
      });

      describe('#SadPath', () => {
        it('should fail and throw an error if prisma throws an error', async function () {
          prisma.stage.findUnique.mockRejectedValueOnce(new Error('db connection error'));

          await expect(taskManager.getTasksByStageId('some_id', {})).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#updateUserMetadata', () => {
      describe('#HappyPath', () => {
        it("should update successfully task's metadata object by provided id", async function () {
          const taskEntity = createTaskEntity({});

          prisma.task.update.mockResolvedValue(taskEntity);

          await expect(taskManager.updateUserMetadata(taskEntity.id, { newData: 'test' })).toResolve();
        });
      });

      describe('#BadPath', () => {
        it('should failed on for not exists task when update user metadata', async function () {
          prisma.task.update.mockRejectedValue(notFoundError);

          await expect(taskManager.updateUserMetadata('someId', { testData: 'some new data' })).rejects.toThrow(tasksErrorMessages.taskNotFound);
        });
      });

      describe('#SadPath', () => {
        it('should fail and throw an error if prisma throws an error', async function () {
          prisma.task.update.mockRejectedValueOnce(new Error('db connection error'));

          await expect(taskManager.updateUserMetadata('someId', { testData: 'some new data' })).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#addTasks', () => {
      describe('#HappyPath', () => {
        it("should add new tasks to existing stage's tasks", async function () {
          const jobId = faker.string.uuid();
          const stageId = faker.string.uuid();
          const jobEntity = createJobEntity({ id: jobId });
          const stageEntity = createStageEntity({ jobId: jobEntity.id, id: stageId });
          const taskEntity = createTaskEntity({ stageId: stageId, id: faker.string.uuid(), userMetadata: {} });

          prisma.stage.findUnique.mockResolvedValue(stageEntity);
          prisma.job.findUnique.mockResolvedValue(jobEntity);

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              task: {
                createManyAndReturn: vi.fn().mockResolvedValue([taskEntity]),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          vi.spyOn(stageManager, 'updateStageProgressFromTaskChanges').mockResolvedValue(undefined);

          const taskPayload = {
            data: {},
            userMetadata: { someData: '123' },
          } satisfies TaskCreateModel;

          const tasksResponse = await taskManager.addTasks(stageId, [taskPayload]);

          // Extract unnecessary fields from the job object and assemble the expected result
          const { creationTime, updateTime, xstate, startTime, endTime, ...rest } = taskEntity;

          expect(tasksResponse).toMatchObject([
            { ...rest, tracestate: undefined, creationTime: creationTime.toISOString(), updateTime: updateTime.toISOString() },
          ]);
        });
      });

      describe('#BadPath', () => {
        it('should reject adding tasks to a non-existent stage', async function () {
          prisma.stage.findUnique.mockResolvedValue(null);

          await expect(taskManager.addTasks('someId', [])).rejects.toThrow(stagesErrorMessages.stageNotFound);
        });

        it('should reject adding tasks to job with IN_PROGRESS stage', async function () {
          const jobId = faker.string.uuid();
          const stageId = faker.string.uuid();

          const stageEntity = createStageEntity({
            jobId,
            id: stageId,
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
          });
          const jobEntity = createJobEntity({ id: jobId, stage: [stageEntity] });

          prisma.stage.findUnique.mockResolvedValue(stageEntity);
          prisma.job.findUnique.mockResolvedValue(jobEntity);

          await expect(taskManager.addTasks('someId', [])).rejects.toThrow(
            new NotAllowedToAddTasksToInProgressStageError(tasksErrorMessages.addTaskNotAllowed)
          );
        });

        it('should reject adding tasks to a finite stage', async function () {
          const stageEntity = createStageEntity({
            jobId: faker.string.uuid(),
            id: faker.string.uuid(),
            xstate: abortedStageXstatePersistentSnapshot,
          });

          prisma.stage.findUnique.mockResolvedValue(stageEntity);

          await expect(taskManager.addTasks('someId', [])).rejects.toThrow(
            new StageInFiniteStateError(stagesErrorMessages.stageAlreadyFinishedTasksError)
          );
        });
      });

      describe('#SadPath', () => {
        it('should fail with a database error when adding tasks', async function () {
          const jobId = faker.string.uuid();
          const stageId = faker.string.uuid();

          const jobEntity = createJobEntity({ id: jobId });
          const stageEntity = createStageEntity({ jobId: jobEntity.id, id: stageId });

          prisma.stage.findUnique.mockResolvedValue(stageEntity);
          prisma.job.findUnique.mockResolvedValue(jobEntity);

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              task: {
                createManyAndReturn: vi.fn().mockRejectedValue(new Error('db connection error')),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(taskManager.addTasks(jobEntity.id, [])).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#updateStatus', () => {
      describe('#HappyPath', () => {
        it('should update task status by provided ID', async function () {
          const jobId = faker.string.uuid();
          const stageId = faker.string.uuid();
          const taskId = faker.string.uuid();

          const jobEntity = createJobEntity({ id: jobId });
          const stageEntity = createStageEntity({ jobId: jobEntity.id, id: stageId });
          const taskEntity = createTaskEntity({
            stageId: stageEntity.id,
            id: taskId,
            status: TaskOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
          });

          prisma.task.findUnique.mockResolvedValue(taskEntity);
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              task: {
                findUnique: vi.fn().mockResolvedValue(taskEntity),
                updateManyAndReturn: vi.fn().mockResolvedValue([taskEntity]),
              },
              stage: {
                findUnique: vi.fn().mockResolvedValue(stageEntity),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          vi.spyOn(stageManager, 'getStageEntityById').mockResolvedValue(stageEntity);
          vi.spyOn(stageManager, 'updateStatus').mockResolvedValue(undefined);
          vi.spyOn(stageManager, 'updateStageProgressFromTaskChanges').mockResolvedValue(undefined);

          await expect(taskManager.updateStatus(taskId, TaskOperationStatus.COMPLETED)).toResolve();
        });

        it('should update task status to RETRIED', async function () {
          const jobId = faker.string.uuid();
          const stageId = faker.string.uuid();
          const taskId = faker.string.uuid();

          const jobEntity = createJobEntity({ id: jobId });
          const stageEntity = createStageEntity({ jobId: jobEntity.id, id: stageId });
          const taskEntity = createTaskEntity({
            stageId: stageEntity.id,
            id: taskId,
            status: TaskOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            attempts: 0,
            maxAttempts: 3,
          });

          prisma.task.findUnique.mockResolvedValue(taskEntity);
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              task: {
                findUnique: vi.fn().mockResolvedValue(taskEntity),
                updateManyAndReturn: vi.fn().mockResolvedValue([{ ...taskEntity, status: TaskOperationStatus.RETRIED, attempts: 1 }]),
              },
              stage: {
                findUnique: vi.fn().mockResolvedValue(stageEntity),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          vi.spyOn(stageManager, 'updateStageProgressFromTaskChanges').mockResolvedValue(undefined);

          await expect(taskManager.updateStatus(taskId, TaskOperationStatus.FAILED)).toResolve();
        });

        it('should update task status to IN_PROGRESS and add startTime', async function () {
          const jobId = faker.string.uuid();
          const stageId = faker.string.uuid();
          const taskId = faker.string.uuid();

          const jobEntity = createJobEntity({ id: jobId });
          const stageEntity = createStageEntity({ jobId: jobEntity.id, id: stageId });
          const taskEntity = createTaskEntity({
            stageId: stageEntity.id,
            id: taskId,
            status: TaskOperationStatus.PENDING,
            xstate: pendingStageXstatePersistentSnapshot,
            attempts: 0,
            maxAttempts: 3,
          });

          prisma.task.findUnique.mockResolvedValue(taskEntity);
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              task: {
                findUnique: vi.fn().mockResolvedValue(taskEntity),
                updateManyAndReturn: vi.fn().mockResolvedValue([{ ...taskEntity, startTime: new Date() }]),
              },
              stage: {
                findUnique: vi.fn().mockResolvedValue(stageEntity),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          vi.spyOn(stageManager, 'updateStageProgressFromTaskChanges').mockResolvedValue(undefined);

          await expect(taskManager.updateStatus(taskId, TaskOperationStatus.IN_PROGRESS)).toResolve();
        });

        it('should update task status to FAILED and add endTime', async function () {
          const jobId = faker.string.uuid();
          const stageId = faker.string.uuid();
          const taskId = faker.string.uuid();

          const jobEntity = createJobEntity({ id: jobId, status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot });
          const stageEntity = createStageEntity({
            jobId: jobEntity.id,
            id: stageId,
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
          });
          const taskEntity = createTaskEntity({
            stageId: stageEntity.id,
            id: taskId,
            status: TaskOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            attempts: 3,
            maxAttempts: 3,
          });

          prisma.task.findUnique.mockResolvedValue(taskEntity);
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              task: {
                findUnique: vi.fn().mockResolvedValue(taskEntity),
                updateManyAndReturn: vi.fn().mockResolvedValue([{ ...taskEntity, endTime: new Date() }]),
              },
              stage: {
                findUnique: vi.fn().mockResolvedValue(stageEntity),
                findFirst: vi.fn().mockResolvedValue(null),
                update: vi.fn().mockResolvedValue({ ...stageEntity, status: StageOperationStatus.FAILED }),
              },
              job: {
                findUnique: vi.fn().mockResolvedValue(jobEntity),
                update: vi.fn().mockResolvedValue(null),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          vi.spyOn(stageManager, 'updateStageProgressFromTaskChanges').mockResolvedValue(undefined);

          await expect(taskManager.updateStatus(taskId, TaskOperationStatus.FAILED)).toResolve();
        });

        it('should update task status to IN_PROGRESS', async function () {
          const jobId = faker.string.uuid();
          const stageId = faker.string.uuid();
          const taskId = faker.string.uuid();

          const jobEntity = createJobEntity({ id: jobId });
          const stageEntity = createStageEntity({ jobId: jobEntity.id, id: stageId });
          const taskEntity = createTaskEntity({
            stageId: stageEntity.id,
            id: taskId,
            status: TaskOperationStatus.PENDING,
            xstate: pendingStageXstatePersistentSnapshot,
            attempts: 3,
            maxAttempts: 3,
          });

          prisma.task.findUnique.mockResolvedValue(taskEntity);
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              task: {
                findUnique: vi.fn().mockResolvedValue(taskEntity),
                updateManyAndReturn: vi.fn().mockResolvedValue([taskEntity]),
              },
              stage: {
                findUnique: vi.fn().mockResolvedValue(stageEntity),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          vi.spyOn(stageManager, 'updateStageProgressFromTaskChanges').mockResolvedValue(undefined);

          await expect(taskManager.updateStatus(taskId, TaskOperationStatus.IN_PROGRESS)).toResolve();
        });
      });

      describe('#BadPath', () => {
        it('should reject changing status on a non-existent task', async function () {
          prisma.task.findUnique.mockResolvedValue(null);
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              task: {
                findUnique: vi.fn().mockResolvedValue(null),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
            return callback(mockTx);
          });

          await expect(taskManager.updateStatus('someId', TaskOperationStatus.COMPLETED)).rejects.toThrow(tasksErrorMessages.taskNotFound);
        });

        it("should reject update invalid task's status [from IN_PROGRESS to CREATED]", async function () {
          const jobId = faker.string.uuid();
          const stageId = faker.string.uuid();
          const taskId = faker.string.uuid();

          const jobEntity = createJobEntity({ id: jobId });
          const stageEntity = createStageEntity({ jobId: jobEntity.id, id: stageId });
          const taskEntity = createTaskEntity({
            stageId: stageEntity.id,
            id: taskId,
            status: TaskOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
          });

          prisma.task.findUnique.mockResolvedValue(taskEntity);
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              task: {
                findUnique: vi.fn().mockResolvedValue(taskEntity),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
            return callback(mockTx);
          });

          await expect(taskManager.updateStatus(taskId, TaskOperationStatus.CREATED)).rejects.toThrow(IllegalTaskStatusTransitionError);
        });
      });

      describe('#SadPath', () => {
        it('should fail with a database error when adding tasks', async function () {
          prisma.task.findUnique.mockRejectedValue(new Error('db connection error'));
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              task: {
                findUnique: vi.fn().mockRejectedValue(new Error('db connection error')),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
            return callback(mockTx);
          });

          await expect(taskManager.updateStatus(faker.string.uuid(), TaskOperationStatus.PENDING)).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#dequeue', () => {
      describe('#HappyPath', () => {
        it('should update task status by provided ID', async function () {
          const jobId = faker.string.uuid();
          const stageId = faker.string.uuid();
          const taskId = faker.string.uuid();

          const jobEntity = createJobEntity({ id: jobId });
          const stageEntity = createStageEntity({ jobId: jobEntity.id, id: stageId, type: 'SOME_DEQUEUE_STAGE_TYPE' });
          const taskEntity = createTaskEntity({
            stageId: stageEntity.id,
            id: taskId,
            status: TaskOperationStatus.PENDING,
            xstate: pendingStageXstatePersistentSnapshot,
          });

          vi.spyOn(taskRepository, 'findAndLockTaskForDequeue').mockResolvedValue(taskEntity);

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              task: {
                findUnique: vi.fn().mockResolvedValue(taskEntity),
                updateManyAndReturn: vi.fn().mockResolvedValue([taskEntity]),
              },
              stage: {
                findUnique: vi.fn().mockResolvedValue(stageEntity),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          vi.spyOn(stageManager, 'updateStageProgressFromTaskChanges').mockResolvedValue(undefined);

          await expect(taskManager.dequeue('SOME_DEQUEUE_STAGE_TYPE')).toResolve();
        });
      });

      describe('#BadPath', () => {
        it('should get code 404 not found for no available tasks to dequeue', async function () {
          vi.spyOn(taskRepository, 'findAndLockTaskForDequeue').mockResolvedValue(null);

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {} as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(taskManager.dequeue('SOME_DEQUEUE_STAGE_TYPE')).rejects.toThrow(tasksErrorMessages.taskNotFound);
        });
      });

      describe('#SadPath', () => {
        it('should fail with a database error when adding tasks', async function () {
          vi.spyOn(taskRepository, 'findAndLockTaskForDequeue').mockRejectedValue(new Error('db connection error'));

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {} as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(taskManager.dequeue('SOME_DEQUEUE_STAGE_TYPE')).rejects.toThrow('db connection error');
        });

        it('should fail with bad race conditions (task already pulled)', async function () {
          const jobId = faker.string.uuid();
          const stageId = faker.string.uuid();
          const taskId = faker.string.uuid();

          const jobEntity = createJobEntity({ id: jobId });
          const stageEntity = createStageEntity({ jobId: jobEntity.id, id: stageId });
          const taskEntity = createTaskEntity({
            stageId: stageEntity.id,
            id: taskId,
            status: TaskOperationStatus.PENDING,
            xstate: pendingStageXstatePersistentSnapshot,
          });

          vi.spyOn(taskRepository, 'findAndLockTaskForDequeue').mockResolvedValue(taskEntity);

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              task: {
                findUnique: vi.fn().mockResolvedValue(taskEntity),
                updateManyAndReturn: vi.fn().mockResolvedValue([]),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(taskManager.dequeue('SOME_DEQUEUE_STAGE_TYPE')).rejects.toThrow(tasksErrorMessages.taskStatusUpdateFailed);
        });
      });
    });

    describe('#cleanStaleTasks', () => {
      describe('HappyPath', () => {
        it('should successfully clean stale tasks and update them to FAILED status', async function () {
          prisma.task.findMany.mockResolvedValue([staleTaskOneHour, staleTaskFortyFiveMinutes]);
          const updateStatusMock = vi.spyOn(taskManager, 'updateStatus').mockResolvedValue({
            id: staleTaskOneHour.id,
            stageId: staleTaskOneHour.stageId,
            status: TaskOperationStatus.FAILED,
            attempts: 0,
            maxAttempts: 2,
            data: {},
            userMetadata: {},
            creationTime: new Date().toISOString(),
            updateTime: new Date().toISOString(),
            traceparent: DEFAULT_TRACEPARENT,
          });

          await expect(taskManager.cleanStaleTasks()).toResolve();

          expect(updateStatusMock).toHaveBeenCalledTimes(2);
          expect(updateStatusMock).toHaveBeenCalledWith(staleTaskOneHour.id, TaskOperationStatus.FAILED);
          expect(updateStatusMock).toHaveBeenCalledWith(staleTaskFortyFiveMinutes.id, TaskOperationStatus.FAILED);
        });

        it('should handle empty result when no stale tasks are found', async function () {
          const prismaFindManyMock = prisma.task.findMany.mockResolvedValue([]);
          const updateStatusMock = vi.spyOn(taskManager, 'updateStatus');

          await expect(taskManager.cleanStaleTasks()).toResolve();

          expect(prismaFindManyMock).toHaveBeenCalledOnce();
          expect(updateStatusMock).not.toHaveBeenCalled();
        });

        it('should handle mixed success and failure when updating task statuses', async function () {
          prisma.task.findMany.mockResolvedValue([staleTaskOneHour, staleTaskFortyFiveMinutes]);
          const updateStatusMock = vi
            .spyOn(taskManager, 'updateStatus')
            .mockResolvedValueOnce({
              id: staleTaskOneHour.id,
              stageId: staleTaskOneHour.stageId,
              status: TaskOperationStatus.FAILED,
              attempts: 0,
              maxAttempts: 2,
              data: {},
              userMetadata: {},
              creationTime: new Date().toISOString(),
              updateTime: new Date().toISOString(),
              traceparent: DEFAULT_TRACEPARENT,
            })
            .mockRejectedValueOnce(new Error('Update failed'));

          await expect(taskManager.cleanStaleTasks()).toResolve();

          expect(updateStatusMock).toHaveBeenCalledTimes(2);
        });

        it('should calculate cutoff time correctly for different time periods', async function () {
          const timeoutConfigs = [
            { staleTaskThresholdInMinutes: 15 }, // 15 minutes
            { staleTaskThresholdInMinutes: 120 }, // 2 hours
            { staleTaskThresholdInMinutes: 1440 }, // 1 day
          ];

          const prismaFindManyMock = prisma.task.findMany.mockResolvedValue([]);
          const configGetSpy = vi.spyOn(config, 'get');

          for (const timeoutConfig of timeoutConfigs) {
            // Mock the config.get method to return the test timeout value
            configGetSpy.mockReturnValueOnce(timeoutConfig.staleTaskThresholdInMinutes);

            const beforeTime = Date.now();
            await taskManager.cleanStaleTasks();
            const afterTime = Date.now();

            const lastCall = prismaFindManyMock.mock.calls.slice(-1)[0];
            const whereClause = lastCall?.[0]?.where?.startTime;
            const actualCutoffTime =
              typeof whereClause === 'object' && whereClause !== null && 'lt' in whereClause ? (whereClause.lt as Date) : undefined;
            const expectedCutoffMin = beforeTime - timeoutConfig.staleTaskThresholdInMinutes * 60 * 1000;
            const expectedCutoffMax = afterTime - timeoutConfig.staleTaskThresholdInMinutes * 60 * 1000;

            expect(actualCutoffTime!.getTime()).toBeGreaterThanOrEqual(expectedCutoffMin);
            expect(actualCutoffTime!.getTime()).toBeLessThanOrEqual(expectedCutoffMax);
          }

          // Restore the original implementation
          configGetSpy.mockRestore();
        });
      });

      describe('SadPath', () => {
        it('should throw error when database query fails', async function () {
          const dbError = new Error('Database connection error');
          const prismaFindManyMock = prisma.task.findMany.mockRejectedValue(dbError);

          await expect(taskManager.cleanStaleTasks()).rejects.toThrow('Database connection error');

          expect(prismaFindManyMock).toHaveBeenCalledOnce();
        });

        it('should throw error when all task updates fail', async function () {
          prisma.task.findMany.mockResolvedValue([staleTaskOneHour]);
          vi.spyOn(taskManager, 'updateStatus').mockRejectedValue(new Error('Update failed'));

          await expect(taskManager.cleanStaleTasks()).toResolve();
        });

        it('should properly handle and log failures when updating task statuses fails', async function () {
          prisma.task.findMany.mockResolvedValue([staleTaskOneHour, staleTaskFortyFiveMinutes]);
          vi.spyOn(taskManager, 'updateStatus').mockRejectedValue(new Error('Task update failed'));

          await expect(taskManager.cleanStaleTasks()).toResolve();
        });

        it('should handle non-Error objects when task updates fail', async function () {
          prisma.task.findMany.mockResolvedValue([staleTaskOneHour]);
          vi.spyOn(taskManager, 'updateStatus').mockRejectedValue('String error');

          await expect(taskManager.cleanStaleTasks()).toResolve();
        });
      });
    });
  });
});
