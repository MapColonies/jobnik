import type { components, operations, JobId, StageId } from 'jobnik-openapi';
import type { Prisma, TaskOperationStatus } from '@prismaClient';
import type { JobPrismaObject } from '@src/jobs/models/models';
import type { PrismaTransaction } from '@src/db/types';

type StageModel = components['schemas']['getStageResponse'];
type StageCreateModel = components['schemas']['createStagePayloadRequest'];
type StageSummary = components['schemas']['summary'];
type StageFindCriteriaArg = operations['getStagesV1']['parameters']['query'];
type StagesPaginatedResponse = components['schemas']['stagesPaginatedResponse'];
/**
 * TODO: `id`/`jobId` are re-branded here instead of at the Prisma schema level because
 * prisma-json-types-generator throws on `@db.Uuid` string columns (breaks its `UuidFilter`
 * handling and silently drops Json overrides for later models). Move this branding into
 * schema.prisma once that upstream bug is fixed.
 */
type StageIncludingJob = Omit<StagePrismaObject, 'id' | 'jobId'> & { id: StageId; jobId: JobId; job: JobPrismaObject };
interface UpdateSummaryCount {
  add: { status: TaskOperationStatus; count: number };
  remove?: { status: TaskOperationStatus; count: number };
}

/**
 * Options for retrieving a stage entity
 * @interface StageEntityOptions
 */
interface StageEntityOptions {
  includeTasks?: boolean;
  includeJob?: boolean;
  tx?: PrismaTransaction;
}

/**
 * Type definition for Stage with optional Task and Job inclusion
 * @interface StagePrismaObject
 */
interface StagePrismaObjectBase extends Prisma.StageGetPayload<object> {
  task?: Prisma.TaskGetPayload<object>[];
  job?: Prisma.JobGetPayload<object>;
}
type StagePrismaObject = StagePrismaObjectBase;

export type {
  StageSummary,
  StageModel,
  StageFindCriteriaArg,
  StageCreateModel,
  StagePrismaObject,
  UpdateSummaryCount,
  StageIncludingJob,
  StageEntityOptions,
  StagesPaginatedResponse,
};
