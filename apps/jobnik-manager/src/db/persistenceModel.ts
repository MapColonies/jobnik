import type { $Enums, Job as PrismaJob, Stage as PrismaStage, Task as PrismaTask } from '@prismaClient';

/* eslint-disable @typescript-eslint/naming-convention */
export const JobOperationStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  ABORTED: 'ABORTED',
  CREATED: 'CREATED',
  PAUSED: 'PAUSED',
} as const satisfies typeof $Enums.JobOperationStatus;

export type JobOperationStatus = (typeof JobOperationStatus)[keyof typeof JobOperationStatus];

export const StageOperationStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  ABORTED: 'ABORTED',
  WAITING: 'WAITING',
  CREATED: 'CREATED',
} as const satisfies typeof $Enums.StageOperationStatus;

export type StageOperationStatus = (typeof StageOperationStatus)[keyof typeof StageOperationStatus];

export const TaskOperationStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CREATED: 'CREATED',
  RETRIED: 'RETRIED',
} as const satisfies typeof $Enums.TaskOperationStatus;

export type TaskOperationStatus = (typeof TaskOperationStatus)[keyof typeof TaskOperationStatus];

export const Priority = {
  VERY_HIGH: 'VERY_HIGH',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  VERY_LOW: 'VERY_LOW',
} as const satisfies typeof $Enums.Priority;

export type Priority = (typeof Priority)[keyof typeof Priority];
/* eslint-enable @typescript-eslint/naming-convention */

// Row types of the Persistence model. Aliases of Prisma's model types until the Drizzle cutover infers them from the table definitions.
export type Job = PrismaJob;
export type Stage = PrismaStage;
export type Task = PrismaTask;
