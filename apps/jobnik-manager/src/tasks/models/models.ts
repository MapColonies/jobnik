import type { Prisma } from '@prismaClient';
import type { components, operations } from '@src/openapi';

type TaskModel = components['schemas']['taskResponse'];
type TaskCreateModel = components['schemas']['createTaskPayload'];
type TasksFindCriteriaArg = operations['getTasksByCriteriaV1']['parameters']['query'];
type TaskPrismaObject = Prisma.TaskGetPayload<Prisma.TaskDefaultArgs>;
type TasksPaginatedResponse = components['schemas']['tasksPaginatedResponse'];
type TasksByStageIdQuery = operations['getTasksByStageIdV1']['parameters']['query'];

export type { TaskModel, TaskCreateModel, TasksFindCriteriaArg, TaskPrismaObject, TasksPaginatedResponse, TasksByStageIdQuery };
