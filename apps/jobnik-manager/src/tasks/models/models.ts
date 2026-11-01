import type { PaginationParams } from '@map-colonies/drizzle-utils';
import type { components, operations } from 'jobnik-openapi';
import type { Stage, Task } from '@src/db/persistenceModel';

type TaskModel = components['schemas']['taskResponse'];
type TaskCreateModel = components['schemas']['createTaskPayload'];
type TasksFindCriteriaArg = operations['getTasksByCriteriaV1']['parameters']['query'];
type TasksPaginatedResponse = components['schemas']['tasksPaginatedResponse'];
type TasksByStageIdQuery = operations['getTasksByStageIdV1']['parameters']['query'];

/**
 * Criteria for searching tasks; filters that are not set are ignored
 */
interface TaskSearchParams extends Partial<PaginationParams> {
  stageId?: Task['stageId'];
  stageType?: Stage['type'];
  status?: Task['status'];
  fromDate?: Date;
  endDate?: Date;
}

export type { TaskModel, TaskCreateModel, TasksFindCriteriaArg, TasksPaginatedResponse, TasksByStageIdQuery, TaskSearchParams };
