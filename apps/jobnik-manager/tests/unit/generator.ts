import { faker } from '@faker-js/faker';
import { createActor } from 'xstate';
import type { Prisma, Stage, Task } from '@prismaClient';
import { JobOperationStatus, Priority, StageOperationStatus, TaskOperationStatus } from '@prismaClient';
import type { findAndLockTask } from '@src/db/prisma/generated/client/sql';
import { jobStateMachine } from '@src/jobs/models/jobStateMachine';
import type { JobCreateModel } from '@src/jobs/models/models';
import { stageStateMachine } from '@src/stages/models/stageStateMachine';
import type { TaskPrismaObject } from '@src/tasks/models/models';
import { taskStateMachine } from '@src/tasks/models/taskStateMachine';
import { defaultStatusCounts } from '@src/stages/models/helper';
import { DEFAULT_TRACEPARENT } from '@src/common/utils/tracingHelpers';

const stageInitializedPersistedSnapshot = createActor(stageStateMachine).start().getPersistedSnapshot();
const taskInitializedPersistedSnapshot = createActor(taskStateMachine).start().getPersistedSnapshot();

export const randomUuid = faker.string.uuid();
export interface JobWithStages extends Prisma.JobGetPayload<Record<string, unknown>> {
  stage?: Stage[];
}
export interface StageWithTasks extends Prisma.StageGetPayload<Record<string, unknown>> {
  task?: Task[];
}

export const createJobParams = {
  name: 'DEFAULT',
  data: { stages: [] },
  userMetadata: {},
} satisfies JobCreateModel;

export function createJobEntity(override: Partial<JobWithStages>): JobWithStages {
  const jobEntity = {
    creationTime: new Date(),
    data: {},
    id: randomUuid,
    name: 'DEFAULT',
    percentage: 0,
    priority: Priority.HIGH,
    status: JobOperationStatus.PENDING,
    updateTime: new Date(),
    userMetadata: {},
    xstate: createActor(jobStateMachine).start().getPersistedSnapshot(),
    traceparent: DEFAULT_TRACEPARENT,
    tracestate: null,
  } satisfies JobWithStages;
  return { ...jobEntity, ...override };
}

export const createStageEntity = (override: Partial<StageWithTasks>): StageWithTasks => {
  const stageEntity = {
    data: {},
    type: 'DEFAULT_TEST_STAGE_TYPE',
    summary: defaultStatusCounts,
    jobId: faker.string.uuid(),
    id: faker.string.uuid(),
    status: StageOperationStatus.CREATED,
    userMetadata: {},
    percentage: 0,
    order: 1,
    xstate: stageInitializedPersistedSnapshot,
    task: undefined,
    traceparent: DEFAULT_TRACEPARENT,
    tracestate: null,
  } satisfies StageWithTasks;

  return { ...stageEntity, ...override };
};

export const createTaskEntity = (override: Partial<TaskPrismaObject>): TaskPrismaObject => {
  const taskEntity = {
    data: {},
    stageId: faker.string.uuid(),
    id: faker.string.uuid(),
    status: TaskOperationStatus.CREATED,
    userMetadata: {},
    attempts: 0,
    maxAttempts: 0,
    creationTime: new Date(),
    updateTime: new Date(),
    xstate: taskInitializedPersistedSnapshot,
    traceparent: DEFAULT_TRACEPARENT,
    tracestate: null,
    startTime: null,
    endTime: null,
  } satisfies TaskPrismaObject;
  return { ...taskEntity, ...override };
};

/**
 * Creates raw task entity with snake_case field names for database layer testing
 */
/* eslint-disable @typescript-eslint/naming-convention */
export const createRawTaskEntity = (override?: Partial<findAndLockTask.Result>): findAndLockTask.Result => {
  const rawTaskEntity: findAndLockTask.Result = {
    id: faker.string.uuid(),
    stage_id: faker.string.uuid(),
    status: 'Created',
    attempts: 0,
    max_attempts: 3,
    data: {},
    user_metadata: {},
    xstate: taskInitializedPersistedSnapshot as Prisma.JsonValue,
    creation_time: new Date(),
    update_time: new Date(),
    start_time: null,
    end_time: null,
    traceparent: DEFAULT_TRACEPARENT,
    tracestate: null,
  };
  return { ...rawTaskEntity, ...override };
};
/* eslint-enable @typescript-eslint/naming-convention */
