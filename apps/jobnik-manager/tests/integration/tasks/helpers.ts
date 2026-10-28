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
