import { createActor } from 'xstate';
import { TaskOperationStatus } from '@prismaClient';
import { convertArrayPrismaTaskToTaskResponse } from '@src/tasks/models/helper';
import { createCamelCaseMapper } from '@src/common/utils/formatter';
import type { StageCreateModel, StageModel, StagePrismaObject, StageSummary } from './models';
import { stageStateMachine } from './stageStateMachine';

/**
 * Type representing a persisted snapshot of the stage state machine
 * that can be stored in the database as JSON
 */
type StagePersistedSnapshot = ReturnType<ReturnType<typeof createActor<typeof stageStateMachine>>['getPersistedSnapshot']>;

const taskOperationStatusWithTotal = {
  ...TaskOperationStatus,
  // eslint-disable-next-line @typescript-eslint/naming-convention
  TOTAL: 'TOTAL',
} as const;
const summaryCountsMapper = createCamelCaseMapper(taskOperationStatusWithTotal);
// eslint-disable-next-line @typescript-eslint/naming-convention
type SummaryCountsMapper = typeof summaryCountsMapper & { TOTAL: 'total' };

const defaultStatusCounts = Object.fromEntries(Object.values(summaryCountsMapper).map((value) => [value, 0])) as Record<
  SummaryCountsMapper[keyof SummaryCountsMapper],
  0
>;

/**
 * This function converts a Prisma stage object to a StageModel API object.
 * @param prismaObjects db entity
 * @returns StageModel
 */
function convertPrismaToStageResponse(prismaObjects: StagePrismaObject): StageModel {
  const { data, userMetadata, task, tracestate, xstate, ...rest } = prismaObjects;

  const transformedFields = {
    data: data as Record<string, unknown>,
    userMetadata: userMetadata as Record<string, unknown>,
    tasks: Array.isArray(task) ? convertArrayPrismaTaskToTaskResponse(task) : undefined,
    tracestate: tracestate ?? undefined,
  };
  return Object.assign(rest, transformedFields);
}

/**
 * This function converts an array of Prisma stage objects to an array of StageModel API objects.
 * @param prismaObjects array of db entities
 * @returns array of StageModel
 */
function convertArrayPrismaStageToStageResponse(prismaObjects: StagePrismaObject[]): StageModel[] {
  return prismaObjects.map((stage) => convertPrismaToStageResponse(stage));
}

/**
 * This method calculates the current percentage of completed tasks in a stage.
 * @param stageSummary summary of the stage
 * @returns percentage of completed tasks
 */
function getCurrentPercentage(stageSummary: StageSummary): number {
  const completed = stageSummary[summaryCountsMapper.COMPLETED];
  const total = stageSummary[summaryCountsMapper.TOTAL];

  // If total is 0, return 0 to avoid division by zero
  if (total === 0) {
    return 0;
  }

  const PERCENTAGE_MULTIPLIER = 100;
  return Math.floor((completed / total) * PERCENTAGE_MULTIPLIER);
}

/**
 * This method is used to get the initial xstate snapshot for a stage.
 * @param stage The stage object containing the initial state flag.
 * @returns The initial xstate snapshot for the stage, Created as default or Wait if flag is true.
 */
function getInitialXstate(stage: StageCreateModel, firstStage = false): StagePersistedSnapshot {
  const createStageActor = createActor(stageStateMachine).start();

  if (stage.startAsWaiting === true) {
    createStageActor.send({ type: 'wait' });
  } else if (firstStage) {
    createStageActor.send({ type: 'pend' });
  }

  return createStageActor.getPersistedSnapshot();
}

export {
  getCurrentPercentage,
  convertArrayPrismaStageToStageResponse,
  convertPrismaToStageResponse,
  getInitialXstate,
  summaryCountsMapper,
  defaultStatusCounts,
  taskOperationStatusWithTotal,
};

export type { StagePersistedSnapshot };
