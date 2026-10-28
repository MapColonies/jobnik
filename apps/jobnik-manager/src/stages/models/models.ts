import type { components, operations } from 'jobnik-openapi';
import type { DrizzleTx } from '@src/db/drizzle';
import type { Job, Stage, Task, TaskOperationStatus } from '@src/db/persistenceModel';

type StageModel = components['schemas']['getStageResponse'];
type StageCreateModel = components['schemas']['createStagePayloadRequest'];
type StageSummary = components['schemas']['summary'];
type StageFindCriteriaArg = operations['getStagesV1']['parameters']['query'];
type StagesPaginatedResponse = components['schemas']['stagesPaginatedResponse'];

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
  tx?: DrizzleTx;
}

/**
 * Criteria for searching stages; filters that are not set are ignored
 */
interface StageSearchParams {
  jobId?: Stage['jobId'];
  type?: Stage['type'];
  status?: Stage['status'];
  includeTasks?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * A stage row of the Persistence model, with its tasks and job when they were requested
 */
type StageRow = Stage & { tasks?: Task[]; job?: Job };

/**
 * A stage row loaded together with its job
 */
type StageIncludingJob = Stage & { job: Job };

/**
 * The stage row shape returned for the given entity options
 * @template TOptions - the options the stage was loaded with
 */
type StageEntity<TOptions extends StageEntityOptions> = Stage &
  (TOptions extends { includeTasks: true } ? { tasks: Task[] } : unknown) &
  (TOptions extends { includeJob: true } ? { job: Job } : unknown);

export type {
  StageSummary,
  StageModel,
  StageFindCriteriaArg,
  StageCreateModel,
  StageRow,
  StageEntity,
  UpdateSummaryCount,
  StageIncludingJob,
  StageEntityOptions,
  StageSearchParams,
  StagesPaginatedResponse,
};
