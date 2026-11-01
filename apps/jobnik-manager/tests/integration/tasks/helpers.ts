import { createActor } from 'xstate';
import { faker } from '@faker-js/faker';
import { type Prisma, type PrismaClient } from '@prismaClient';
import type { Task } from '@src/db/persistenceModel';
import { taskStateMachine } from '@src/tasks/models/taskStateMachine';
import { DEFAULT_TRACEPARENT } from '@src/common/utils/tracingHelpers';

const persistedSnapshot = createActor(taskStateMachine).start().getPersistedSnapshot();

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
