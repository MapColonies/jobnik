import { createActor } from 'xstate';
import { faker } from '@faker-js/faker';
import type { StageId } from 'jobnik-openapi';
import type { NewTask, Task } from '@src/db/persistenceModel';
import type { Drizzle } from '@src/db/drizzle';
import { taskTable } from '@src/db/entities';
import { taskStateMachine } from '@src/tasks/models/taskStateMachine';
import { DEFAULT_TRACEPARENT } from '@src/common/utils/tracingHelpers';

const persistedSnapshot = createActor(taskStateMachine).start().getPersistedSnapshot();

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
