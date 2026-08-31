import { faker } from '@faker-js/faker';
import { type Snapshot } from 'xstate';
import type { JobOperationStatus, Prisma, PrismaClient, Job, Stage, Task } from '@prismaClient';
import type { JobCreateModel } from '@src/jobs/models/models';
import { createJobRecord, createJobRequestBody } from '../jobs/helpers';
import { createStageBody, addStageRecord } from '../stages/helpers';
import { createTaskBody, createTaskRecords } from '../tasks/helpers';

type JobTestCreateModel = JobCreateModel & {
  id?: string;
  xstate?: Snapshot<unknown>;
  status?: JobOperationStatus;
};

/**
 * Creates a test job tree with optional stage and tasks.
 * Uses function overloads to provide better type safety based on configuration.
 */

// Overload 1: Job only (no stage, no tasks)
export async function createJobnikTree(
  prisma: PrismaClient,
  jobOverrides: Partial<JobTestCreateModel>,
  stageOverrides: Partial<Prisma.StageCreateManyInput>,
  tasksOverrides: Partial<Prisma.TaskCreateManyInput>[],
  options: { createStage: false; createTasks?: false }
): Promise<JobOnlyTree>;

// Overload 2: Job with stage only (no tasks)
export async function createJobnikTree(
  prisma: PrismaClient,
  jobOverrides: Partial<JobTestCreateModel>,
  stageOverrides: Partial<Prisma.StageCreateManyInput>,
  tasksOverrides: Partial<Prisma.TaskCreateManyInput>[],
  options: { createStage: true; createTasks: false }
): Promise<JobWithStageTree>;

// Overload 3: Full tree (job, stage, and tasks) - default behavior
export async function createJobnikTree(
  prisma: PrismaClient,
  jobOverrides?: Partial<JobTestCreateModel>,
  stageOverrides?: Partial<Prisma.StageCreateManyInput>,
  tasksOverrides?: Partial<Prisma.TaskCreateManyInput>[],
  options?: { createStage?: true; createTasks?: true }
): Promise<FullJobnikTree>;

// Implementation
export async function createJobnikTree(
  prisma: PrismaClient,
  jobOverrides: Partial<JobTestCreateModel> = {},
  stageOverrides: Partial<Prisma.StageCreateManyInput> = {},
  tasksOverrides: Partial<Prisma.TaskCreateManyInput>[] = [{}],
  options: {
    createStage?: boolean;
    createTasks?: boolean;
  } = {}
): Promise<JobOnlyTree | JobWithStageTree | FullJobnikTree> {
  const { createStage = true, createTasks = true } = options;

  // Create job with overrides
  const jobData = { ...createJobRequestBody, id: faker.string.uuid(), ...jobOverrides };
  const job = await createJobRecord(jobData, prisma);

  // Job only scenario
  if (!createStage) {
    return { job };
  }

  // Create stage
  const stageData = {
    ...createStageBody,
    jobId: job.id,
    ...stageOverrides,
  };
  const stage = await addStageRecord(stageData, prisma);

  // Job with stage only scenario
  if (!createTasks) {
    return { job, stage };
  }

  // Full tree scenario - ensure we have at least one task
  const finalTasksOverrides = tasksOverrides.length > 0 ? tasksOverrides : [{}];
  const tasksData = finalTasksOverrides.map((taskOverride) => ({
    ...createTaskBody,
    stageId: stage.id,
    ...taskOverride,
  }));
  const tasks = await createTaskRecords(tasksData, prisma);

  return { job, stage, tasks };
}

/**
 * Wipes all job/stage/task rows before a test runs.
 * Integration test files share one physical database, so without this a test can observe
 * rows left behind by a previous test (e.g. `cleanStaleTasks` or unscoped "list all" queries
 * picking up unrelated leftover data), causing flaky assertions.
 */
export async function truncateAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`TRUNCATE TABLE "job_manager"."job" RESTART IDENTITY CASCADE`;
}

/**
 * Creates a mock Prisma error for testing purposes.
 * Default message is 'Database error'.
 * The error is marked with a custom property to simulate a Prisma error.
 * @returns A mock Prisma error.
 */
export function createMockPrismaError(): Error {
  const error = new Error('Database error');
  // @ts-expect-error using this flag to mark the error as a Prisma error
  error.isPrismaError = true;
  return error;
}

/**
 * Creates a mock unknown database error for testing purposes.
 * Default message is 'Database error'.
 * The error is not marked as a Prisma error.
 * @returns A mock unknown database error.
 */
export function createMockUnknownDbError(): Error {
  const error = new Error('Database error');
  // @ts-expect-error using this flag to explicitly mark the error as NOT a Prisma error
  error.isPrismaError = false;
  return error;
}

// Type definitions using inheritance - cleaner hierarchy
export interface JobOnlyTree {
  readonly job: Job;
}

export interface JobWithStageTree extends JobOnlyTree {
  readonly stage: Stage;
}

export interface FullJobnikTree extends JobWithStageTree {
  readonly tasks: Task[];
}
