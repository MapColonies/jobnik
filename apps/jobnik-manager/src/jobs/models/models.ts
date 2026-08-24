import type { components, operations } from 'jobnik-openapi';
import type { Prisma } from '@prismaClient';

type JobModel = components['schemas']['job'];
type JobCreateModel = components['schemas']['createJobPayload'];
type JobFindCriteriaArg = operations['findJobsV1']['parameters']['query'];
type JobsPaginatedResponse = components['schemas']['jobsPaginatedResponse'];

/**
 * Generic type for Job Prisma objects with configurable stage inclusion
 * @template IncludeStages - Whether to include stages in the result
 */
type JobPrismaObject<IncludeStages extends boolean = boolean> = Prisma.JobGetPayload<{
  include: { stage: IncludeStages };
}>;

export type { JobModel, JobCreateModel, JobFindCriteriaArg, JobPrismaObject, JobsPaginatedResponse };
