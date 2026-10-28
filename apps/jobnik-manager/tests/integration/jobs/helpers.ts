import { createActor, type Snapshot } from 'xstate';
import { faker } from '@faker-js/faker';
import type { JobId } from 'jobnik-openapi';
import { jobStateMachine } from '@src/jobs/models/jobStateMachine';
import type { JobCreateModel } from '@src/jobs/models/models';
import { DEFAULT_TRACEPARENT } from '@src/common/utils/tracingHelpers';
import type { Job, JobOperationStatus, NewJob } from '@src/db/persistenceModel';
import type { Drizzle } from '@src/db/drizzle';
import { jobTable } from '@src/db/entities';

type JobTestCreateModel = JobCreateModel & {
  id?: string;
  xstate?: Snapshot<unknown>;
  status?: JobOperationStatus;
};

export const createJobRecord = async (body: JobTestCreateModel, drizzle: Drizzle): Promise<Job> => {
  const persistedSnapshot = body.xstate ?? createActor(jobStateMachine).start().getPersistedSnapshot();

  const traceparent = body.traceparent ?? DEFAULT_TRACEPARENT;
  const input = {
    name: body.name,
    data: body.data,
    priority: body.priority,
    userMetadata: body.userMetadata,
    id: body.id as JobId | undefined,
    status: body.status,
    xstate: persistedSnapshot,
    traceparent,
    tracestate: body.tracestate ?? null,
  } satisfies NewJob;

  const [res] = await drizzle.insert(jobTable).values(input).returning();
  return res!;
};

export const createJobRequestBody = {
  name: 'DEFAULT',
  data: {},
  userMetadata: {},
} satisfies JobCreateModel;

export const testJobId = faker.string.uuid();
export const testStageId = faker.string.uuid();
