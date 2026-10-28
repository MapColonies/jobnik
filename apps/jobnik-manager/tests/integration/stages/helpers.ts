import { createActor } from 'xstate';
import { faker } from '@faker-js/faker';
import type { JobId } from 'jobnik-openapi';
import { stageStateMachine } from '@src/stages/models/stageStateMachine';
import { defaultStatusCounts } from '@src/stages/models/helper';
import { DEFAULT_TRACEPARENT } from '@src/common/utils/tracingHelpers';
import type { Job, NewJob, NewStage, Stage } from '@src/db/persistenceModel';
import type { Drizzle } from '@src/db/drizzle';
import { jobTable, stageTable } from '@src/db/entities';

const persistedSnapshot = createActor(stageStateMachine).start().getPersistedSnapshot();

/**
 * Adding job record
 * @param body - job insert body, with a plain string id
 * @param drizzle - the fixtures' client
 * @returns the inserted job row
 */
export const addJobRecord = async (body: Omit<NewJob, 'id'> & { id?: string }, drizzle: Drizzle): Promise<Job> => {
  const [res] = await drizzle
    .insert(jobTable)
    .values({ ...body, id: body.id as JobId | undefined })
    .returning();
  return res!;
};

/**
 * adding stage record to exists job
 * @param body stage insert body
 * @param drizzle the fixtures' client
 * @returns the inserted stage row
 */
export const addStageRecord = async (body: NewStage, drizzle: Drizzle): Promise<Stage> => {
  const [res] = await drizzle.insert(stageTable).values(body).returning();
  return res!;
};

export const createStageBody = {
  jobId: faker.string.uuid() as JobId,
  type: 'UNKNOWN',
  data: {},
  summary: defaultStatusCounts,
  xstate: persistedSnapshot,
  userMetadata: {},
  order: 1,
  traceparent: DEFAULT_TRACEPARENT,
  tracestate: null,
} satisfies NewStage;
