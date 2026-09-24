import { createActor } from 'xstate';
import { faker } from '@faker-js/faker';
import { type Prisma, type PrismaClient } from '@prismaClient';
import type { TaskPrismaObject } from '@src/tasks/models/models';
import { taskStateMachine } from '@src/tasks/models/taskStateMachine';
import { DEFAULT_TRACEPARENT } from '@src/common/utils/tracingHelpers';

const persistedSnapshot = createActor(taskStateMachine).start().getPersistedSnapshot();

export const createTaskRecords = async (body: Prisma.TaskCreateManyInput[], prisma: PrismaClient): Promise<TaskPrismaObject[]> => {
  // TODO: cast here because Prisma has no concept of branded scalars (see TaskPrismaObject in
  // src/tasks/models/models.ts for why); revisit once that's fixed upstream.
  const res = await prisma.task.createManyAndReturn({ data: body });
  return res as TaskPrismaObject[];
};

export const createTaskBody = {
  stageId: faker.string.uuid(),
  data: {},
  xstate: persistedSnapshot,
  userMetadata: {},
  traceparent: DEFAULT_TRACEPARENT,
  tracestate: null,
} satisfies Prisma.TaskCreateManyInput;
