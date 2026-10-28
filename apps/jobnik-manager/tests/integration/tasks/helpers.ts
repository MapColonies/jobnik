import { setTimeout as sleep } from 'node:timers/promises';
import { createActor } from 'xstate';
import { faker } from '@faker-js/faker';
import { sql } from 'drizzle-orm';
import type { StageId } from 'jobnik-openapi';
import type { NewTask, Task } from '@src/db/persistenceModel';
import type { Drizzle } from '@src/db/drizzle';
import { taskTable } from '@src/db/entities';
import { taskStateMachine } from '@src/tasks/models/taskStateMachine';
import { DEFAULT_TRACEPARENT } from '@src/common/utils/tracingHelpers';

const persistedSnapshot = createActor(taskStateMachine).start().getPersistedSnapshot();

const LOCK_WAIT_TIMEOUT_MS = 10_000;
const LOCK_WAIT_POLL_INTERVAL_MS = 20;

export const createTaskRecords = async (body: NewTask[], drizzle: Drizzle): Promise<Task[]> => {
  return drizzle.insert(taskTable).values(body).returning();
};

export const createTaskBody = {
  stageId: faker.string.uuid() as StageId,
  data: {},
  xstate: persistedSnapshot,
  userMetadata: {},
  traceparent: DEFAULT_TRACEPARENT,
  tracestate: null,
} satisfies NewTask;

/**
 * Waits until the given number of task UPDATEs are blocked waiting for a row lock.
 * @param drizzle - the fixtures' client
 * @param count - how many blocked updates to wait for
 */
export async function waitForBlockedTaskUpdates(drizzle: Drizzle, count: number): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const {
      rows: [result],
    } = await drizzle.execute<{ blocked: number }>(sql`
      SELECT count(*)::int AS blocked FROM pg_stat_activity
      WHERE wait_event_type = 'Lock' AND query ILIKE 'update "job_manager"."task"%'`);
    if (result !== undefined && result.blocked >= count) {
      return;
    }
    await sleep(LOCK_WAIT_POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for ${count} blocked task updates`);
}
