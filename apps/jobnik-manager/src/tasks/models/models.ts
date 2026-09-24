import type { components, operations, StageId, TaskId } from 'jobnik-openapi';
import type { Prisma } from '@prismaClient';

type TaskModel = components['schemas']['taskResponse'];
type TaskCreateModel = components['schemas']['createTaskPayload'];
type TasksFindCriteriaArg = operations['getTasksByCriteriaV1']['parameters']['query'];
/**
 * TODO: `id`/`stageId` are re-branded here instead of at the Prisma schema level because
 * prisma-json-types-generator throws on `@db.Uuid` string columns (breaks its `UuidFilter`
 * handling and silently drops Json overrides for later models). Move this branding into
 * schema.prisma once that upstream bug is fixed.
 */
type TaskPrismaObject = Omit<Prisma.TaskGetPayload<Prisma.TaskDefaultArgs>, 'id' | 'stageId'> & { id: TaskId; stageId: StageId };
type TasksPaginatedResponse = components['schemas']['tasksPaginatedResponse'];
type TasksByStageIdQuery = operations['getTasksByStageIdV1']['parameters']['query'];

export type { TaskModel, TaskCreateModel, TasksFindCriteriaArg, TaskPrismaObject, TasksPaginatedResponse, TasksByStageIdQuery };
