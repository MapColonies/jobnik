import type { Snapshot } from 'xstate';
import type { Prisma } from '@prismaClient';
import type { findAndLockTask } from '@src/db/prisma/generated/client/sql';
import type { TaskModel, TaskPrismaObject } from './models';

/**
 * This function converts a Prisma stage object to a TaskModel API object.
 * @param prismaObjects db entity
 * @returns TaskModel
 */
export function convertPrismaToTaskResponse(prismaObjects: Prisma.TaskGetPayload<Record<string, unknown>>): TaskModel {
  const { data, userMetadata, xstate, creationTime, tracestate, startTime, endTime, updateTime, ...rest } = prismaObjects;

  const transformedFields = {
    data: data as Record<string, unknown>,
    userMetadata: userMetadata as { [key: string]: unknown },
    updateTime: updateTime.toISOString(),
    creationTime: creationTime.toISOString(),
    tracestate: tracestate ?? undefined,
    startTime: startTime ? startTime.toISOString() : undefined,
    endTime: endTime ? endTime.toISOString() : undefined,
  };

  return Object.assign(rest, transformedFields);
}

/**
 * This function converts an array of Prisma task objects to an array of TaskModel API objects.
 * @param prismaObjects array of db entities
 * @returns array of TaskModel
 */
export function convertArrayPrismaTaskToTaskResponse(prismaObjects: Prisma.TaskGetPayload<Record<string, unknown>>[]): TaskModel[] {
  return prismaObjects.map((task) => convertPrismaToTaskResponse(task));
}

/**
 * This function converts a Prisma stage object to a TaskModel API object.
 * @param prismaObjects db entity
 * @returns TaskModel
 */
export function convertRawToTaskModel(raw: findAndLockTask.Result): TaskPrismaObject {
  return {
    ...raw,
    stageId: raw.stage_id, // Handle camelCase conversion
    status: raw.status.toUpperCase() as TaskPrismaObject['status'],
    data: raw.data as Record<string, unknown>,
    userMetadata: (raw.user_metadata ?? {}) as Record<string, unknown>,
    xstate: raw.xstate as unknown as Snapshot<unknown>,
  } as unknown as TaskPrismaObject;
}
