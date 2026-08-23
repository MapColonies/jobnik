import { describe, beforeEach, afterEach, it, expect, vi, beforeAll } from 'vitest';
import type { Logger } from '@map-colonies/js-logger';
import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prismaClient';
import { Prisma, JobOperationStatus, Priority } from '@prismaClient';
import { illegalStatusTransitionErrorMessage, prismaKnownErrors } from '@src/common/errors';
import { JobManager } from '@src/jobs/models/manager';
import { errorMessages as jobsErrorMessages } from '@src/jobs/models/errors';
import type { JobCreateModel } from '@src/jobs/models/models';
import { randomUuid } from '@tests/unit/generator';
import { SERVICE_NAME } from '@src/common/constants';
import { jobEntityWithAbortStatus, jobEntityWithoutStages, jobEntityWithStages } from '../data';

let jobManager: JobManager;
let prisma: DeepMockProxy<PrismaClient>;
const tracer = trace.getTracer(SERVICE_NAME);
const jobNotFoundError = new Prisma.PrismaClientKnownRequestError('RECORD_NOT_FOUND', { code: prismaKnownErrors.recordNotFound, clientVersion: '1' });

describe('JobManager', () => {
  let logger: Logger;

  beforeAll(function () {
    logger = jsLogger({ enabled: false });
  });

  beforeEach(function () {
    prisma = mockDeep<PrismaClient>();
    jobManager = new JobManager(logger, prisma, tracer);
  });

  afterEach(function () {
    vi.clearAllMocks();
  });

  describe('#Jobs', () => {
    describe('#createJob', () => {
      describe('#HappyPath', () => {
        it('should return a formatted job after creation', async function () {
          prisma.job.create.mockResolvedValue(jobEntityWithStages);
          const createJobParams = {
            name: jobEntityWithStages.name,
            data: jobEntityWithStages.data,
            userMetadata: jobEntityWithStages.userMetadata as Record<string, unknown>,
          } satisfies JobCreateModel;

          const job = await jobManager.createJob(createJobParams);

          expect(job).toMatchObject(createJobParams);
        });
      });

      describe('#SadPath', () => {
        it('should fail with a database error when creating job', async function () {
          prisma.job.create.mockRejectedValueOnce(new Error('db connection error'));

          const createJobParams = {
            name: jobEntityWithStages.name,
            data: jobEntityWithStages.data,
            userMetadata: jobEntityWithStages.userMetadata as Record<string, unknown>,
          } satisfies JobCreateModel;

          await expect(jobManager.createJob(createJobParams)).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#findJobs', () => {
      describe('#HappyPath', () => {
        it('should return formatted jobs matching the search criteria', async function () {
          const mediumPriorityJob = { ...jobEntityWithoutStages, priority: Priority.MEDIUM };
          prisma.job.findMany.mockResolvedValue([mediumPriorityJob]);
          prisma.job.count.mockResolvedValue(1);

          const result = await jobManager.getJobs({ priority: Priority.MEDIUM });

          const { xstate, stage, ...rest } = mediumPriorityJob;
          const expectedJob = [
            {
              ...rest,
              stages: stage,
              creationTime: rest.creationTime.toISOString(),
              updateTime: rest.updateTime.toISOString(),
              tracestate: undefined,
            },
          ];

          expect(result.total).toBe(1);
          expect(result.items).toMatchObject(expectedJob);
        });

        it('should return all formatted jobs when no criteria is provided', async function () {
          const jobEntity = { ...jobEntityWithoutStages };
          prisma.job.findMany.mockResolvedValue([jobEntity]);
          prisma.job.count.mockResolvedValue(1);

          const result = await jobManager.getJobs(undefined);

          const { xstate, stage, tracestate, ...rest } = jobEntity;
          const expectedJob = [{ ...rest, stages: stage, creationTime: rest.creationTime.toISOString(), updateTime: rest.updateTime.toISOString() }];

          expect(result.total).toBe(1);
          expect(result.items).toMatchObject(expectedJob);
        });
      });

      describe('#SadPath', () => {
        it('should fail with a database error when finding jobs', async function () {
          prisma.job.findMany.mockRejectedValueOnce(new Error('db connection error'));

          await expect(jobManager.getJobs({ priority: Priority.MEDIUM })).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#getJobById', () => {
      describe('#HappyPath', () => {
        it('should return a job matching the provided id', async function () {
          prisma.job.findUnique.mockResolvedValue(jobEntityWithoutStages);

          const jobs = await jobManager.getJobById(jobEntityWithoutStages.id);

          const { xstate, stage, ...rest } = jobEntityWithoutStages;
          const expectedJob = {
            ...rest,
            stages: stage,
            tracestate: undefined,
            creationTime: rest.creationTime.toISOString(),
            updateTime: rest.updateTime.toISOString(),
          };

          expect(jobs).toMatchObject(expectedJob);
        });
      });

      describe('#BadPath', () => {
        it("should fail with a 'job not found' error when retrieving the job", async function () {
          prisma.job.findUnique.mockResolvedValue(null);

          await expect(jobManager.getJobById('some_id')).rejects.toThrow(jobsErrorMessages.jobNotFound);
        });
      });

      describe('#SadPath', () => {
        it('should fail with a database error when retrieving a job', async function () {
          prisma.job.findUnique.mockRejectedValueOnce(new Error('db connection error'));

          await expect(jobManager.getJobById('some_id')).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#updateUserMetadata', () => {
      describe('#HappyPath', () => {
        it("should successfully update job's user metadata by id", async function () {
          prisma.job.update.mockResolvedValue(jobEntityWithoutStages);

          await expect(jobManager.updateUserMetadata(jobEntityWithoutStages.id, { newData: 'test' })).toResolve();
        });
      });

      describe('#BadPath', () => {
        it('should fail when updating user metadata of a non-existent job', async function () {
          prisma.job.update.mockRejectedValue(jobNotFoundError);

          await expect(jobManager.updateUserMetadata('someId', { testData: 'some new data' })).rejects.toThrow(jobsErrorMessages.jobNotFound);
        });
      });

      describe('#SadPath', () => {
        it('should fail with a database error when updating user metadata', async function () {
          prisma.job.update.mockRejectedValueOnce(new Error('db connection error'));

          await expect(jobManager.updateUserMetadata('someId', { testData: 'some new data' })).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#updatePriority', () => {
      describe('#HappyPath', () => {
        it("should successfully update job's priority by id", async function () {
          prisma.job.findUnique.mockResolvedValue(jobEntityWithoutStages);
          prisma.job.update.mockResolvedValue(jobEntityWithoutStages);

          await expect(jobManager.updatePriority(jobEntityWithoutStages.id, Priority.MEDIUM)).toResolve();
        });

        it('should not perform a job priority update when the provided priority matches the current job priority', async function () {
          prisma.job.findUnique.mockResolvedValue({ ...jobEntityWithoutStages, priority: Priority.HIGH });

          await expect(jobManager.updatePriority(jobEntityWithoutStages.id, Priority.HIGH)).rejects.toThrow(
            jobsErrorMessages.priorityCannotBeUpdatedToSameValue
          );
        });
      });

      describe('#BadPath', () => {
        it('should fail when updating priority of a non-existent job', async function () {
          prisma.job.findUnique.mockResolvedValue(null);

          await expect(jobManager.updatePriority('someId', Priority.MEDIUM)).rejects.toThrow(jobsErrorMessages.jobNotFound);
        });
      });

      describe('#SadPath', () => {
        it('should fail with a database error when updating priority', async function () {
          prisma.job.findUnique.mockRejectedValueOnce(new Error('db connection error'));

          await expect(jobManager.updatePriority('someId', Priority.MEDIUM)).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#updateStatus', () => {
      describe('#HappyPath', () => {
        it('should successfully update job status by id', async function () {
          const jobId = randomUuid;

          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              job: {
                findUnique: vi.fn().mockResolvedValue({ ...jobEntityWithoutStages, id: jobId }),
                update: vi.fn().mockResolvedValue(jobEntityWithoutStages),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(jobManager.updateStatus(jobId, JobOperationStatus.PENDING)).toResolve();
        });
      });

      describe('#BadPath', () => {
        it('should fail when updating status for a job that does not exist', async function () {
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              job: {
                findUnique: vi.fn().mockResolvedValue(null),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(jobManager.updateStatus('someId', JobOperationStatus.PENDING)).rejects.toThrow(jobsErrorMessages.jobNotFound);
        });

        it('should fail on invalid status transition', async function () {
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              job: {
                findUnique: vi.fn().mockResolvedValue(jobEntityWithoutStages),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(jobManager.updateStatus(jobEntityWithoutStages.id, JobOperationStatus.COMPLETED)).rejects.toThrow(
            illegalStatusTransitionErrorMessage(jobEntityWithoutStages.status, JobOperationStatus.COMPLETED)
          );
        });
      });

      describe('#SadPath', () => {
        it('should fail with a database error when updating status', async function () {
          prisma.$transaction.mockImplementationOnce(async (callback) => {
            const mockTx = {
              job: {
                findUnique: vi.fn().mockRejectedValueOnce(new Error('db connection error')),
              },
            } as unknown as Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

            return callback(mockTx);
          });

          await expect(jobManager.updateStatus('someId', JobOperationStatus.COMPLETED)).rejects.toThrow('db connection error');
        });
      });
    });

    describe('#deleteJob', () => {
      describe('#HappyPath', () => {
        it('should successfully delete a job and its associated stages', async function () {
          prisma.job.findUnique.mockResolvedValue(jobEntityWithAbortStatus);
          prisma.job.delete.mockResolvedValue(jobEntityWithAbortStatus);

          await expect(jobManager.deleteJob(jobEntityWithAbortStatus.id)).toResolve();
        });
      });

      describe('#BadPath', () => {
        it('should return an error for a request to delete non finalized-status job', async function () {
          prisma.job.findUnique.mockResolvedValue(jobEntityWithoutStages);

          await expect(jobManager.deleteJob(jobEntityWithoutStages.id)).rejects.toThrow(jobsErrorMessages.jobNotInFiniteState);
        });

        it('should return an error for a request to delete a non-existent job', async function () {
          prisma.job.findUnique.mockResolvedValue(null);

          await expect(jobManager.deleteJob('someId')).rejects.toThrow(jobsErrorMessages.jobNotFound);
        });
      });

      describe('#SadPath', () => {
        it('should fail with a database error when deleting a job', async function () {
          prisma.job.findUnique.mockRejectedValueOnce(new Error('db connection error'));

          await expect(jobManager.deleteJob('someId')).rejects.toThrow('db connection error');
        });
      });
    });
  });
});
