import { faker } from '@faker-js/faker';
import { type Snapshot } from 'xstate';
import type { Application } from 'express';
import type { DependencyContainer } from 'tsyringe';
import type { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { getApp } from '@src/app';
import type { JobCreateModel } from '@src/jobs/models/models';
import { SERVICES } from '@common/constants';
import type { Job, JobOperationStatus, NewStage, NewTask, Stage, Task } from '@src/db/persistenceModel';
import type { Drizzle } from '@src/db/drizzle';
import { createJobRecord, createJobRequestBody } from '../jobs/helpers';
import { createStageBody, addStageRecord } from '../stages/helpers';
import { createTaskBody, createTaskRecords } from '../tasks/helpers';

const LOCK_WAIT_TIMEOUT_MS = 5000;
const LOCK_WAIT_POLL_INTERVAL_MS = 20;

type JobTestCreateModel = JobCreateModel & {
  id?: string;
  xstate?: Snapshot<unknown>;
  status?: JobOperationStatus;
};

/**
 * Wipes all job/stage/task rows before a test runs.
 * Integration test files share one physical database, so without this a test can observe
 * rows left behind by a previous test (e.g. `cleanStaleTasks` or unscoped "list all" queries
 * picking up unrelated leftover data), causing flaky assertions.
 */
async function truncateAllTables(drizzle: Drizzle): Promise<void> {
  await drizzle.execute(sql`TRUNCATE TABLE "job_manager"."job" RESTART IDENTITY CASCADE`);
}

/**
 * Creates a test job tree with optional stage and tasks.
 * Uses function overloads to provide better type safety based on configuration.
 */

// Overload 1: Job only (no stage, no tasks)
export async function createJobnikTree(
  drizzle: Drizzle,
  jobOverrides: Partial<JobTestCreateModel>,
  stageOverrides: Partial<NewStage>,
  tasksOverrides: Partial<NewTask>[],
  options: { createStage: false; createTasks?: false }
): Promise<JobOnlyTree>;

// Overload 2: Job with stage only (no tasks)
export async function createJobnikTree(
  drizzle: Drizzle,
  jobOverrides: Partial<JobTestCreateModel>,
  stageOverrides: Partial<NewStage>,
  tasksOverrides: Partial<NewTask>[],
  options: { createStage: true; createTasks: false }
): Promise<JobWithStageTree>;

// Overload 3: Full tree (job, stage, and tasks) - default behavior
export async function createJobnikTree(
  drizzle: Drizzle,
  jobOverrides?: Partial<JobTestCreateModel>,
  stageOverrides?: Partial<NewStage>,
  tasksOverrides?: Partial<NewTask>[],
  options?: { createStage?: true; createTasks?: true }
): Promise<FullJobnikTree>;

// Implementation
export async function createJobnikTree(
  drizzle: Drizzle,
  jobOverrides: Partial<JobTestCreateModel> = {},
  stageOverrides: Partial<NewStage> = {},
  tasksOverrides: Partial<NewTask>[] = [{}],
  options: {
    createStage?: boolean;
    createTasks?: boolean;
  } = {}
): Promise<JobOnlyTree | JobWithStageTree | FullJobnikTree> {
  const { createStage = true, createTasks = true } = options;

  // Create job with overrides
  const jobData = { ...createJobRequestBody, id: faker.string.uuid(), ...jobOverrides };
  const job = await createJobRecord(jobData, drizzle);

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
  const stage = await addStageRecord(stageData, drizzle);

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
  const tasks = await createTaskRecords(tasksData, drizzle);

  return { job, stage, tasks };
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

/**
 * Waits until enough database queries are blocked waiting for a lock, for tests that need requests to queue behind a held row.
 * Integration test files run one at a time, so every query waiting on a lock belongs to the current test.
 * @param drizzle - a client that isn't the one holding the lock
 * @param minBlocked - how many blocked queries to wait for
 * @param timeoutMs - how long to wait before failing
 */
export async function waitForQueryBlockedOnLock(drizzle: Drizzle, minBlocked = 1, timeoutMs = LOCK_WAIT_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await drizzle.execute<{ waiting: number }>(
      sql`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
    );
    if ((rows[0]?.waiting ?? 0) >= minBlocked) {
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`Fewer than ${minBlocked} queries were blocked on a lock within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_POLL_INTERVAL_MS));
  }
}

export interface IntegrationApp {
  readonly app: Application;
  readonly container: DependencyContainer;
  readonly drizzle: Drizzle;
}

/**
 * Builds the app in a child container with logging disabled and a test tracer, and wipes all job/stage/task rows.
 * Pair with {@link teardownIntegrationApp}.
 */
export async function setupIntegrationApp(): Promise<IntegrationApp> {
  const [app, container] = await getApp({
    override: [
      { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
      { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
    ],
    useChild: true,
  });

  const drizzle = container.resolve<Drizzle>(SERVICES.DRIZZLE);
  await truncateAllTables(drizzle);

  return { app, container, drizzle };
}

/**
 * Releases the app's database pool.
 * Accepts an undefined container so that a failed {@link setupIntegrationApp} surfaces its own error instead of a teardown one.
 * @param container - the app's dependency container, if the setup got far enough to create one
 */
export async function teardownIntegrationApp(container: DependencyContainer | undefined): Promise<void> {
  if (container !== undefined) {
    await endDatabasePool(container);
  }
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
