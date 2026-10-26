import type { components, operations } from 'jobnik-openapi';

type TaskModel = components['schemas']['taskResponse'];
type TaskCreateModel = components['schemas']['createTaskPayload'];
type TasksFindCriteriaArg = operations['getTasksByCriteriaV1']['parameters']['query'];
type TasksPaginatedResponse = components['schemas']['tasksPaginatedResponse'];
type TasksByStageIdQuery = operations['getTasksByStageIdV1']['parameters']['query'];

export type { TaskModel, TaskCreateModel, TasksFindCriteriaArg, TasksPaginatedResponse, TasksByStageIdQuery };
