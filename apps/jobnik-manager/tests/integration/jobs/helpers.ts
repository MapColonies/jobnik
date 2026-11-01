import { createActor, type Snapshot } from 'xstate';
import { faker } from '@faker-js/faker';
import type { Prisma, PrismaClient } from '@prismaClient';
import { jobStateMachine } from '@src/jobs/models/jobStateMachine';
import type { JobCreateModel } from '@src/jobs/models/models';
import { DEFAULT_TRACEPARENT } from '@src/common/utils/tracingHelpers';
import type { JobOperationStatus } from '@src/db/persistenceModel';

// Job fixtures are still written through Prisma; they move to Drizzle with the rest of the integration setup.
type PrismaJobWithStages = Prisma.JobGetPayload<{ include: { stage: true } }>;

type JobTestCreateModel = JobCreateModel & {
  id?: string;
  xstate?: Snapshot<unknown>;
  status?: JobOperationStatus;
};

export const createJobRecord = async (body: JobTestCreateModel, prisma: PrismaClient): Promise<PrismaJobWithStages> => {
  const persistedSnapshot = body.xstate ?? createActor(jobStateMachine).start().getPersistedSnapshot();

  const traceparent = body.traceparent ?? DEFAULT_TRACEPARENT;
  const input = {
    name: body.name,
    data: body.data,
    priority: body.priority,
    userMetadata: body.userMetadata,
    id: body.id,
    status: body.status,
    xstate: persistedSnapshot,
    traceparent,
    tracestate: body.tracestate ?? null,
  } satisfies Prisma.JobCreateInput;

  const res = await prisma.job.create({ data: input, include: { stage: true } });
  return res;
};

export const createJobRequestBody = {
  name: 'DEFAULT',
  data: {},
  userMetadata: {},
} satisfies JobCreateModel;

export const testJobId = faker.string.uuid();
export const testStageId = faker.string.uuid();

export type { PrismaJobWithStages };
