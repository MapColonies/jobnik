/* eslint-disable @typescript-eslint/naming-convention */
import type { Snapshot } from 'xstate';
import { createActor, setup } from 'xstate';
import { TaskOperationStatus } from '@prismaClient';
import { IllegalTaskStatusTransitionError } from '@src/common/generated/errors';
import { illegalStatusTransitionErrorMessage } from '@src/common/errors';

type changeStatusOperations = 'pend' | 'complete' | 'retry' | 'process' | 'fail' | 'create';

const OperationStatusMapper: { [key in TaskOperationStatus]: changeStatusOperations } = {
  [TaskOperationStatus.PENDING]: 'pend',
  [TaskOperationStatus.IN_PROGRESS]: 'process',
  [TaskOperationStatus.COMPLETED]: 'complete',
  [TaskOperationStatus.FAILED]: 'fail',
  [TaskOperationStatus.CREATED]: 'create',
  [TaskOperationStatus.RETRIED]: 'retry',
};

const taskStateMachine = setup({
  types: {
    events: {} as { type: 'pend' } | { type: 'complete' } | { type: 'process' } | { type: 'fail' } | { type: 'retry' } | { type: 'create' },
  },
}).createMachine({
  id: 'taskStatus',
  initial: 'CREATED',
  states: {
    CREATED: {
      on: {
        pend: { target: 'PENDING' },
      },
    },
    PENDING: {
      on: {
        process: { target: 'IN_PROGRESS' },
      },
    },
    IN_PROGRESS: {
      on: {
        complete: { target: 'COMPLETED' },
        fail: { target: 'FAILED' },
        retry: { target: 'RETRIED' },
      },
    },
    RETRIED: {
      on: {
        process: { target: 'IN_PROGRESS' },
      },
    },
    COMPLETED: {
      type: 'final',
    },
    FAILED: {
      type: 'final',
    },
  },
});

/**
 * Updates the task machine state based on the provided status and xstate snapshot.
 * @param {TaskOperationStatus} status - The new status to set.
 * @param {PrismaJson.PersistenceSnapshot} xstate - The current xstate snapshot.
 * @returns {Snapshot<unknown>} - The updated xstate snapshot.
 * @throws {IllegalTaskStatusTransitionError} - If the status change is invalid.
 */
function updateTaskMachineState(status: TaskOperationStatus, xstate: PrismaJson.PersistenceSnapshot): Snapshot<unknown> {
  const updateActor = createActor(taskStateMachine, { snapshot: xstate }).start();

  const nextStatusChange = OperationStatusMapper[status];
  const isValidStatus = updateActor.getSnapshot().can({ type: nextStatusChange });

  if (!isValidStatus) {
    throw new IllegalTaskStatusTransitionError(illegalStatusTransitionErrorMessage(updateActor.getSnapshot().value, status));
  }

  updateActor.send({ type: nextStatusChange });
  const newPersistedSnapshot = updateActor.getPersistedSnapshot();
  updateActor.stop();

  return newPersistedSnapshot;
}

export { taskStateMachine, updateTaskMachineState };
export type { changeStatusOperations };
