import type { components, operations } from 'jobnik-openapi';
import type { Job, Stage } from '@src/db/persistenceModel';

type JobModel = components['schemas']['job'];
type JobCreateModel = components['schemas']['createJobPayload'];
type JobFindCriteriaArg = operations['findJobsV1']['parameters']['query'];
type JobsPaginatedResponse = components['schemas']['jobsPaginatedResponse'];

/**
 * A job row of the Persistence model, with its stages when they were requested
 * @template IncludeStages - Whether the stages were loaded with the job
 */
type JobRow<IncludeStages extends boolean = boolean> = Job & (IncludeStages extends true ? { stages: Stage[] } : { stages?: Stage[] });

/**
 * Criteria for searching jobs; filters that are not set are ignored
 */
interface JobSearchParams {
  name?: Job['name'];
  priority?: Job['priority'];
  /** Only jobs created at or after this time */
  fromDate?: Date;
  /** Only jobs created at or before this time */
  endDate?: Date;
  includeStages?: boolean;
  page?: number;
  pageSize?: number;
}

export type { JobModel, JobCreateModel, JobFindCriteriaArg, JobRow, JobSearchParams, JobsPaginatedResponse };
