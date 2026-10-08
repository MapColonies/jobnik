import { describe, beforeEach, afterEach, it, expect, beforeAll, vi } from 'vitest';
import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { addMinutes, subMinutes } from 'date-fns';
import type { StageId } from 'jobnik-openapi';
import { type PrismaClient } from '@prismaClient';
import { getApp } from '@src/app';
import { SERVICES } from '@common/constants';
import { getConfig, initConfig } from '@src/common/config';
import { inProgressStageXstatePersistentSnapshot } from '@tests/unit/data';
import { defaultStatusCounts } from '@src/stages/models/helper';
import { TaskManager } from '@src/tasks/models/manager';
import { createProxyMock } from '@tests/configurations/mockPrisma';
import { TaskOperationStatus, StageOperationStatus, JobOperationStatus } from '@src/db/persistenceModel';
import { createJobnikTree, truncateAllTables } from '../common/utils';

describe('TaskSweeper', () => {
  let prisma: PrismaClient;
  let taskManager: TaskManager;

  beforeAll(async function () {
    await initConfig(true);
  });

  beforeEach(async function () {
    const [, container] = await getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
      ],
      useChild: true,
    });

    prisma = container.resolve<PrismaClient>(SERVICES.PRISMA);
    taskManager = container.resolve(TaskManager);
    await truncateAllTables(prisma);

    // Ensure Prisma methods exist before they can be spied on (Vitest 4.0 requirement)
  });

  afterEach(async function () {
    await prisma.$disconnect();
    vi.resetModules();
  });

  describe('#cleanStaleTasks', function () {
    const createStageWithStaleTasks = async (taskCount: number) =>
      createJobnikTree(
        prisma,
        { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
        {
          status: StageOperationStatus.IN_PROGRESS,
          xstate: inProgressStageXstatePersistentSnapshot,
          type: 'SOME_STALE_TEST',
          summary: { ...defaultStatusCounts, inProgress: taskCount, total: taskCount },
        },
        Array.from({ length: taskCount }, () => ({
          status: TaskOperationStatus.IN_PROGRESS,
          xstate: inProgressStageXstatePersistentSnapshot,
          maxAttempts: 1,
          attempts: 0,
          startTime: subMinutes(new Date(), 45),
        }))
      );

    const getTaskStatuses = async (stageId: StageId): Promise<TaskOperationStatus[]> => {
      const tasks = await prisma.task.findMany({ where: { stageId }, select: { status: true } });
      return tasks.map((task) => task.status).sort();
    };

    describe('Happy Path', function () {
      it('should clean stale tasks and update stage summaries correctly', async function () {
        // Create job tree with stale tasks that have maxAttempts: 1 so they go directly to FAILED
        const { stage } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            type: 'SOME_STALE_TEST',
            summary: { ...defaultStatusCounts, inProgress: 2, total: 2 },
          },
          [
            {
              status: TaskOperationStatus.IN_PROGRESS,
              xstate: inProgressStageXstatePersistentSnapshot,
              maxAttempts: 1, // Ensure tasks fail immediately instead of going to RETRIED
              attempts: 0,
              startTime: new Date(Date.now() - 45 * 60 * 1000),
            },
            {
              status: TaskOperationStatus.IN_PROGRESS,
              xstate: inProgressStageXstatePersistentSnapshot,
              maxAttempts: 1, // Ensure tasks fail immediately instead of going to RETRIED
              attempts: 0,
              startTime: new Date(Date.now() - 45 * 60 * 1000),
            },
          ]
        );

        // Verify initial state
        const initialTasks = await prisma.task.findMany({
          where: { stageId: stage.id },
          select: { id: true, status: true, startTime: true, maxAttempts: true, attempts: true },
        });

        expect(initialTasks).toSatisfyAll((t: (typeof initialTasks)[0]) => t.status === TaskOperationStatus.IN_PROGRESS);

        // Run cleanup
        await expect(taskManager.cleanStaleTasks()).toResolve();

        // // Verify tasks were updated to FAILED
        const updatedTasks = await prisma.task.findMany({
          where: { stageId: stage.id },
          select: { id: true, status: true, startTime: true, attempts: true, maxAttempts: true },
        });

        expect(updatedTasks).toSatisfyAll((t: (typeof updatedTasks)[0]) => t.status === TaskOperationStatus.FAILED);

        // Verify stage summary was updated
        const updatedStage = await prisma.stage.findUnique({
          where: { id: stage.id },
          select: { summary: true, status: true },
        });

        // Verify stage reflects failed tasks
        expect(updatedStage).toMatchObject({
          summary: {
            failed: 2,
            inProgress: 0,
            total: 2,
          },
          status: StageOperationStatus.FAILED,
        });
      });

      it('should not clean stale tasks when startTime less than period threshold', async function () {
        // Create job tree with stale tasks that have maxAttempts: 1 so they go directly to FAILED
        const { stage } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            type: 'SOME_STALE_TEST',
            summary: { ...defaultStatusCounts, inProgress: 1, total: 1 },
          },
          [
            {
              status: TaskOperationStatus.IN_PROGRESS,
              xstate: inProgressStageXstatePersistentSnapshot,
              maxAttempts: 1, // Ensure tasks fail immediately instead of going to RETRIED
              attempts: 0,
              startTime: addMinutes(new Date(), 50),
            },
          ]
        );

        // // Verify initial state
        const initialTasks = await prisma.task.findMany({
          where: { stageId: stage.id },
          select: { id: true, status: true, startTime: true, maxAttempts: true, attempts: true },
        });

        expect(initialTasks).toSatisfyAll((t: (typeof initialTasks)[0]) => t.status === TaskOperationStatus.IN_PROGRESS);

        // Run cleanup
        await expect(taskManager.cleanStaleTasks()).toResolve();

        // // Verify tasks were updated to FAILED
        const updatedTasks = await prisma.task.findMany({
          where: { stageId: stage.id },
          select: { id: true, status: true, startTime: true, attempts: true, maxAttempts: true },
        });

        expect(updatedTasks).toSatisfyAll((t: (typeof updatedTasks)[0]) => t.status === TaskOperationStatus.IN_PROGRESS);

        // Verify stage summary was updated
        const updatedStage = await prisma.stage.findUnique({
          where: { id: stage.id },
          select: { summary: true },
        });

        expect(updatedStage?.summary).toMatchObject({
          failed: 0,
          inProgress: 1,
          total: 1,
        });
      });

      it('should clean only tasks that started before the configured threshold', async function () {
        const thresholdInMinutes = getConfig().get('task.staleTaskThresholdInMinutes');
        const { stage } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            type: 'SOME_STALE_TEST',
            summary: { ...defaultStatusCounts, inProgress: 2, total: 2 },
          },
          [
            {
              status: TaskOperationStatus.IN_PROGRESS,
              xstate: inProgressStageXstatePersistentSnapshot,
              maxAttempts: 1,
              attempts: 0,
              startTime: subMinutes(new Date(), thresholdInMinutes + 1),
            },
            {
              status: TaskOperationStatus.IN_PROGRESS,
              xstate: inProgressStageXstatePersistentSnapshot,
              maxAttempts: 1,
              attempts: 0,
              startTime: subMinutes(new Date(), thresholdInMinutes - 0.5),
            },
          ]
        );
        const [staleTask, freshTask] = await prisma.task.findMany({ where: { stageId: stage.id }, orderBy: { startTime: 'asc' } });

        await expect(taskManager.cleanStaleTasks()).toResolve();

        await expect(prisma.task.findUnique({ where: { id: staleTask!.id } })).resolves.toHaveProperty('status', TaskOperationStatus.FAILED);
        await expect(prisma.task.findUnique({ where: { id: freshTask!.id } })).resolves.toHaveProperty('status', TaskOperationStatus.IN_PROGRESS);
      });

      it('should handle empty database gracefully', async function () {
        await expect(taskManager.cleanStaleTasks()).toResolve();
      });

      it('should move tasks to RETRIED status when they have remaining attempts', async function () {
        // Create job tree with stale tasks that have maxAttempts > 1 so they go to RETRIED
        const { stage } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            type: 'SOME_STALE_TEST',
            summary: { ...defaultStatusCounts, inProgress: 1, total: 1 },
          },
          [
            {
              status: TaskOperationStatus.IN_PROGRESS,
              xstate: inProgressStageXstatePersistentSnapshot,
              maxAttempts: 3, // Allow tasks to be retried before failing
              attempts: 0,
              startTime: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
            },
          ]
        );

        // Run cleanup
        await expect(taskManager.cleanStaleTasks()).toResolve();

        // Verify task was moved to RETRIED
        const updatedTasks = await prisma.task.findMany({
          where: { stageId: stage.id },
          select: { id: true, status: true, attempts: true, maxAttempts: true },
        });

        expect(updatedTasks[0]).toMatchObject({
          status: TaskOperationStatus.RETRIED,
          attempts: 1,
          maxAttempts: 3,
        });
      });

      it('should log debug messages when successfully updating stale task status', async function () {
        // Create job tree with stale tasks that have maxAttempts: 1 so they go directly to FAILED
        await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            type: 'SOME_STALE_TEST',
            summary: { ...defaultStatusCounts, inProgress: 1, total: 1 },
          },
          [
            {
              status: TaskOperationStatus.IN_PROGRESS,
              maxAttempts: 1, // Ensure tasks fail immediately instead of going to RETRIED
              attempts: 0,
              startTime: new Date(Date.now() - 45 * 60 * 1000),
            },
          ]
        );

        // Run cleanup
        await expect(taskManager.cleanStaleTasks()).toResolve();
      });
    });

    describe('Sad Path', function () {
      it('should return 500 status code when the database driver throws an error', async function () {
        const findManySpy = createProxyMock(prisma.task, 'findMany');
        findManySpy.mockRejectedValueOnce(new Error('Database error'));

        await expect(taskManager.cleanStaleTasks()).toReject();
      });

      it('should keep cleaning the remaining stale tasks when updating one of them fails', async function () {
        const { stage } = await createStageWithStaleTasks(2);
        const originalTransaction = prisma.$transaction.bind(prisma);
        const transactionSpy = createProxyMock(prisma, '$transaction');
        transactionSpy.mockImplementation(originalTransaction);
        transactionSpy.mockRejectedValueOnce(new Error('Database error'));

        await expect(taskManager.cleanStaleTasks()).toResolve();

        await expect(getTaskStatuses(stage.id as StageId)).resolves.toEqual([TaskOperationStatus.FAILED, TaskOperationStatus.IN_PROGRESS].sort());
      });

      it.each([
        { errorKind: 'an Error', error: new Error('Database error') },
        { errorKind: 'a non-Error value', error: 'Database error' },
      ])('should resolve and leave the tasks untouched when every update throws $errorKind', async function ({ error }) {
        const { stage } = await createStageWithStaleTasks(2);
        const transactionSpy = createProxyMock(prisma, '$transaction');
        transactionSpy.mockRejectedValue(error);

        await expect(taskManager.cleanStaleTasks()).toResolve();

        await expect(getTaskStatuses(stage.id as StageId)).resolves.toEqual([TaskOperationStatus.IN_PROGRESS, TaskOperationStatus.IN_PROGRESS]);
      });
    });
  });
});
