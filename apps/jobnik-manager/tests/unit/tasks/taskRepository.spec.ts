/* eslint-disable @typescript-eslint/naming-convention */
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { jsLogger } from '@map-colonies/js-logger';
import { faker } from '@faker-js/faker';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prismaClient';
import { TaskOperationStatus } from '@prismaClient';
import { TaskRepository } from '@src/tasks/DAL/taskRepository';
import { createRawTaskEntity } from '../generator';

let taskRepository: TaskRepository;
let prisma: DeepMockProxy<PrismaClient>;

describe('TaskRepository', () => {
  beforeEach(function () {
    prisma = mockDeep<PrismaClient>();
    taskRepository = new TaskRepository(jsLogger({ enabled: false }), prisma);
  });

  describe('#findAndLockTaskForDequeue', () => {
    describe('#HappyPath', () => {
      it('should find and lock a task for dequeue', async function () {
        const stageType = 'SOME_STAGE_TYPE';
        const taskId = faker.string.uuid();
        const stageId = faker.string.uuid();

        const rawTaskEntity = createRawTaskEntity({
          id: taskId,
          stage_id: stageId,
          status: 'Pending',
        });

        const mockTx = {
          $queryRawTyped: vi.fn().mockResolvedValue([rawTaskEntity]),
        } as unknown as Parameters<typeof taskRepository.findAndLockTaskForDequeue>[1];

        const result = await taskRepository.findAndLockTaskForDequeue(stageType, mockTx);

        expect(result).toMatchObject({ stageId: stageId, status: TaskOperationStatus.PENDING, id: taskId });
        expect(mockTx.$queryRawTyped).toHaveBeenCalledOnce();
      });

      it('should handle null data and userMetadata fields', async function () {
        const stageType = 'SOME_STAGE_TYPE';
        const taskId = faker.string.uuid();
        const stageId = faker.string.uuid();

        const rawTaskEntity = createRawTaskEntity({
          id: taskId,
          stage_id: stageId,
          status: 'Pending',
          data: null,
          user_metadata: null,
        });

        const mockTx = {
          $queryRawTyped: vi.fn().mockResolvedValue([rawTaskEntity]),
        } as unknown as Parameters<typeof taskRepository.findAndLockTaskForDequeue>[1];

        const result = await taskRepository.findAndLockTaskForDequeue(stageType, mockTx);

        expect(result).toMatchObject({
          stageId: stageId,
          status: TaskOperationStatus.PENDING,
          id: taskId,
          data: {},
          userMetadata: {},
        });
        expect(mockTx.$queryRawTyped).toHaveBeenCalledOnce();
      });

      it('should return null when no tasks are available', async function () {
        const stageType = 'SOME_STAGE_TYPE';

        const mockTx = {
          $queryRawTyped: vi.fn().mockResolvedValue([]),
        } as unknown as Parameters<typeof taskRepository.findAndLockTaskForDequeue>[1];

        const result = await taskRepository.findAndLockTaskForDequeue(stageType, mockTx);

        expect(result).toBeNull();
        expect(mockTx.$queryRawTyped).toHaveBeenCalledOnce();
      });
    });

    describe('#SadPath', () => {
      it('should throw error when database query fails', async function () {
        const stageType = 'SOME_STAGE_TYPE';
        const error = new Error('Database connection error');

        const mockTx = {
          $queryRawTyped: vi.fn().mockRejectedValue(error),
        } as unknown as Parameters<typeof taskRepository.findAndLockTaskForDequeue>[1];

        await expect(taskRepository.findAndLockTaskForDequeue(stageType, mockTx)).rejects.toThrow('Database connection error');
      });

      it('should throw error when findUnique fails', async function () {
        const stageType = 'SOME_STAGE_TYPE';

        const error = new Error('Database connection error');

        const mockTx = {
          $queryRawTyped: vi.fn().mockRejectedValue(error),
        } as unknown as Parameters<typeof taskRepository.findAndLockTaskForDequeue>[1];

        await expect(taskRepository.findAndLockTaskForDequeue(stageType, mockTx)).rejects.toThrow('Database connection error');
      });
    });
  });
});
