import { createActor } from 'xstate';
import { faker } from '@faker-js/faker';
import { type Prisma, type PrismaClient, type Stage as PrismaStage } from '@prismaClient';
import { stageStateMachine } from '@src/stages/models/stageStateMachine';
import { defaultStatusCounts } from '@src/stages/models/helper';
import { DEFAULT_TRACEPARENT } from '@src/common/utils/tracingHelpers';
import type { PrismaJobWithStages } from '../jobs/helpers';

const persistedSnapshot = createActor(stageStateMachine).start().getPersistedSnapshot();

/**
 * Adding job record
 * @param body - prisma job create body
 * @param prisma - prisma client
 * @returns job record with related stages
 */
export const addJobRecord = async (body: Prisma.JobCreateInput, prisma: PrismaClient): Promise<PrismaJobWithStages> => {
  const res = await prisma.job.create({
    data: body,
    include: { stage: true },
  });
  return res;
};

/**
 * adding stage record to exists job
 * @param body prisma stage create body
 * @param prisma prisma client
 * @returns
 */
export const addStageRecord = async (body: Prisma.StageCreateManyInput, prisma: PrismaClient): Promise<PrismaStage> => {
  const res = await prisma.stage.create({ data: body });
  return res;
};

export const createStageBody = {
  jobId: faker.string.uuid(),
  type: 'UNKNOWN',
  data: {},
  summary: defaultStatusCounts,
  xstate: persistedSnapshot,
  userMetadata: {},
  order: 1,
  traceparent: DEFAULT_TRACEPARENT,
  tracestate: null,
} satisfies Prisma.StageCreateManyInput;
