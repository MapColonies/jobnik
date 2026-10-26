import { createActor } from 'xstate';
import { convertArrayTaskRowToResponse } from '@src/tasks/models/helper';
import { createCamelCaseMapper } from '@src/common/utils/formatter';
import { TaskOperationStatus } from '@src/db/persistenceModel';
import type { StageCreateModel, StageModel, StageRow, StageSummary } from './models';
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
 * This function converts a stage row to a StageModel API object.
 * @param stageRow stage row
 * @returns StageModel
 */
function convertStageRowToResponse(stageRow: StageRow): StageModel {
  const { data, userMetadata, tasks, job, tracestate, xstate, ...rest } = stageRow;

  const transformedFields = {
    data,
    userMetadata,
    tasks: tasks ? convertArrayTaskRowToResponse(tasks) : undefined,
    tracestate: tracestate ?? undefined,
  };
  return Object.assign(rest, transformedFields);
}

/**
 * This function converts an array of stage rows to an array of StageModel API objects.
 * @param stageRows array of stage rows
 * @returns array of StageModel
 */
function convertArrayStageRowToResponse(stageRows: StageRow[]): StageModel[] {
  return stageRows.map((stage) => convertStageRowToResponse(stage));
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
  convertArrayStageRowToResponse,
  convertStageRowToResponse,
  getInitialXstate,
  summaryCountsMapper,
  defaultStatusCounts,
  taskOperationStatusWithTotal,
};
