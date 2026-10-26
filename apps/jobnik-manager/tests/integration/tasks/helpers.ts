import { setTimeout as sleep } from 'node:timers/promises';
import { createActor } from 'xstate';
import { faker } from '@faker-js/faker';
import { type Prisma, type PrismaClient } from '@prismaClient';
import type { Task } from '@src/db/persistenceModel';
import { taskStateMachine } from '@src/tasks/models/taskStateMachine';
import { DEFAULT_TRACEPARENT } from '@src/common/utils/tracingHelpers';

const persistedSnapshot = createActor(taskStateMachine).start().getPersistedSnapshot();

const LOCK_WAIT_TIMEOUT_MS = 10_000;
const LOCK_WAIT_POLL_INTERVAL_MS = 20;
const TEST_TRIGGER_NAME = 'jobnik_test_trigger';

// Trigger function bodies used to make real updates fail or affect no rows, instead of mocking the database client
const triggerFunctions = {
  fail: { name: 'jobnik_test_fail_update', body: "BEGIN RAISE EXCEPTION 'update failed by test trigger'; END;" },
  skip: { name: 'jobnik_test_skip_update', body: 'BEGIN RETURN NULL; END;' },
} as const;

export const createTaskRecords = async (body: Prisma.TaskCreateManyInput[], prisma: PrismaClient): Promise<Task[]> => {
  // Cast because Prisma rows carry no Branded IDs; the fixtures move to Drizzle with the integration setup.
  const res = await prisma.task.createManyAndReturn({ data: body });
  return res as Task[];
};

export const createTaskBody = {
  stageId: faker.string.uuid(),
  data: {},
  xstate: persistedSnapshot,
  userMetadata: {},
  traceparent: DEFAULT_TRACEPARENT,
  tracestate: null,
} satisfies Prisma.TaskCreateManyInput;

/**
 * Installs a BEFORE UPDATE trigger on some rows of a table. Remove it with {@link dropTriggerOnUpdate}.
 * @param prisma - the fixtures' client
 * @param table - the table in the job_manager schema
 * @param rowIds - the ids of the rows whose updates the trigger intercepts
 * @param behavior - 'fail' raises an error, 'skip' makes the update affect no rows
 */
export async function createTriggerOnUpdate(
  prisma: PrismaClient,
  table: 'stage' | 'task',
  rowIds: string[],
  behavior: keyof typeof triggerFunctions
): Promise<void> {
  const { name, body } = triggerFunctions[behavior];
  const ids = rowIds.map((id) => `'${id}'::uuid`).join(', ');

  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "job_manager"."${name}"() RETURNS trigger AS $$ ${body} $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER ${TEST_TRIGGER_NAME} BEFORE UPDATE ON "job_manager"."${table}" FOR EACH ROW WHEN (OLD.id IN (${ids})) EXECUTE FUNCTION "job_manager"."${name}"()`
  );
}

/**
 * Removes the trigger installed by {@link createTriggerOnUpdate}.
 * @param prisma - the fixtures' client
 * @param table - the table the trigger was installed on
 */
export async function dropTriggerOnUpdate(prisma: PrismaClient, table: 'stage' | 'task'): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TEST_TRIGGER_NAME} ON "job_manager"."${table}"`);
}

/**
 * Waits until the given number of task UPDATEs are blocked waiting for a row lock.
 * @param prisma - the fixtures' client, which doesn't share the app's pool
 * @param count - how many blocked updates to wait for
 */
export async function waitForBlockedTaskUpdates(prisma: PrismaClient, count: number): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [result] = await prisma.$queryRaw<{ blocked: number }[]>`
      SELECT count(*)::int AS blocked FROM pg_stat_activity
      WHERE wait_event_type = 'Lock' AND query ILIKE 'update "job_manager"."task"%'`;
    if (result !== undefined && result.blocked >= count) {
      return;
    }
    await sleep(LOCK_WAIT_POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${count} blocked task updates`);
}
