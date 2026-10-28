import { faker } from '@faker-js/faker';
import { type Snapshot } from 'xstate';
import type { DependencyContainer } from 'tsyringe';
import type { Pool } from 'pg';
import type { Job as PrismaJob, Stage as PrismaStage, Prisma, PrismaClient } from '@prismaClient';
import type { JobCreateModel } from '@src/jobs/models/models';
import { SERVICES } from '@common/constants';
import type { JobOperationStatus, Task } from '@src/db/persistenceModel';
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
 * Closes the app's database pool, so every following query of the app fails. Safe to call more than once.
 * @param container - the app's dependency container
 */
export async function endDatabasePool(container: DependencyContainer): Promise<void> {
  const pool = container.resolve<Pool>(SERVICES.PG_POOL);
  if (!pool.ended) {
    await pool.end();
  }
}

// Type definitions using inheritance - cleaner hierarchy
export interface JobOnlyTree {
  // Still Prisma rows: the fixtures are written through Prisma until the integration setup moves to Drizzle.
  readonly job: PrismaJob;
}

export interface JobWithStageTree extends JobOnlyTree {
  readonly stage: PrismaStage;
}

export interface FullJobnikTree extends JobWithStageTree {
  readonly tasks: Task[];
}
