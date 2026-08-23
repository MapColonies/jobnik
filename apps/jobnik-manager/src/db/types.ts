import type { Snapshot } from 'xstate';
import type { components } from '@openapi';
import type { Prisma } from '@prismaClient';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace PrismaJson {
    type JobData = components['schemas']['jobPayload'];
    type UserMetadata = components['schemas']['userMetadata'];
    type StageData = components['schemas']['stagePayload'];
    type StageSummary = components['schemas']['summary'];
    type TaskData = components['schemas']['taskPayload'];
    type PersistenceSnapshot = Snapshot<unknown>;
  }
}

export type PrismaTransaction = Prisma.TransactionClient;
