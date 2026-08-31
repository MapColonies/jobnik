import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';
import { jsLogger } from '@map-colonies/js-logger';
import { faker } from '@faker-js/faker';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prismaClient';
import { TaskOperationStatus } from '@prismaClient';
import type { UpdateSummaryCount } from '@src/stages/models/models';
import { defaultStatusCounts } from '@src/stages/models/helper';
import { StageRepository } from '@src/stages/DAL/stageRepository';
import { createStageEntity } from '../generator';

let prisma: DeepMockProxy<PrismaClient>;
let stageRepository: StageRepository;

describe('JobManager', () => {
  beforeEach(function () {
    prisma = mockDeep<PrismaClient>();
    stageRepository = new StageRepository(jsLogger({ enabled: false }), prisma);
  });

  afterEach(function () {
    vi.clearAllMocks();
  });

  describe('#StageRepository', () => {
    describe('#updateStageSummary', () => {
      describe('#HappyPath', () => {
        it('should increase total count and created count', async function () {
          const stageId = faker.string.uuid();
          const stageEntity = createStageEntity({ id: stageId, summary: { ...defaultStatusCounts, total: 1, created: 1 } });
          const mockTx = {
            $queryRaw: vi.fn().mockResolvedValue([{ summary: { defaultStatusCounts, total: 2, created: 2 } }]),
          } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

          const summaryUpdatePayload = {
            add: { status: TaskOperationStatus.CREATED, count: 1 },
          } satisfies UpdateSummaryCount;

          await expect(stageRepository.updateStageSummary(stageEntity.id, summaryUpdatePayload, mockTx)).toResolve();
        });

        it('should not increase total count and change counting of other', async function () {
          const stageId = faker.string.uuid();
          const stageEntity = createStageEntity({ id: stageId, summary: { ...defaultStatusCounts, total: 1, created: 1 } });

          const mockTx = {
            $queryRaw: vi.fn().mockResolvedValue([{ summary: { defaultStatusCounts, total: 1, created: 0, pending: 1 } }]),
          } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

          const summaryUpdatePayload = {
            add: { status: TaskOperationStatus.PENDING, count: 1 },
            remove: { status: TaskOperationStatus.CREATED, count: 1 },
          } satisfies UpdateSummaryCount;

          await expect(stageRepository.updateStageSummary(stageEntity.id, summaryUpdatePayload, mockTx)).toResolve();
        });
      });

      describe('#SadPath', () => {
        it('should fail on summary internal failure (result not returned)', async function () {
          const stageId = faker.string.uuid();
          const stageEntity = createStageEntity({ id: stageId, summary: { ...defaultStatusCounts, total: 1, created: 1 } });

          const mockTx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
          } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

          const summaryUpdatePayload = {
            add: { status: TaskOperationStatus.PENDING, count: 1 },
            remove: { status: TaskOperationStatus.CREATED, count: 1 },
          } satisfies UpdateSummaryCount;

          await expect(stageRepository.updateStageSummary(stageEntity.id, summaryUpdatePayload, mockTx)).rejects.toThrow(
            'Failed to update stage summary: No summary returned from database.'
          );
        });

        it('should fail with a database error when updating status', async function () {
          const summaryUpdatePayload = {
            add: { status: TaskOperationStatus.PENDING, count: 1 },
            remove: { status: TaskOperationStatus.CREATED, count: 1 },
          } satisfies UpdateSummaryCount;

          const mockTx = {
            $queryRaw: vi.fn().mockRejectedValueOnce(new Error('db connection error')),
          } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

          await expect(stageRepository.updateStageSummary('someId', summaryUpdatePayload, mockTx)).rejects.toThrow('db connection error');
        });
      });
    });
  });
});
