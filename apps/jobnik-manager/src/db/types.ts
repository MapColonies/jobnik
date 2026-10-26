// Declares the JSON column types of the Prisma generated client, which is no longer used at runtime and is removed together with it.
import type { Snapshot } from 'xstate';
import type { components } from 'jobnik-openapi';

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
