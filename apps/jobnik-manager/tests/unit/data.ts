import { createActor } from 'xstate';
import { jobStateMachine } from '@src/jobs/models/jobStateMachine';
import { stageStateMachine } from '@src/stages/models/stageStateMachine';
import { taskStateMachine } from '@src/tasks/models/taskStateMachine';

const deleteActor = createActor(jobStateMachine).start();
deleteActor.send({ type: 'abort' });

const abortedStageActor = createActor(stageStateMachine).start();
abortedStageActor.send({ type: 'abort' });

const pendingStageActor = createActor(stageStateMachine).start();
pendingStageActor.send({ type: 'pend' });

const runningStageActor = createActor(stageStateMachine).start();
runningStageActor.send({ type: 'pend' });
runningStageActor.send({ type: 'process' });

const completedStageActor = createActor(stageStateMachine).start();
completedStageActor.send({ type: 'pend' });
completedStageActor.send({ type: 'process' });
completedStageActor.send({ type: 'complete' });

const failedStageActor = createActor(stageStateMachine).start();
failedStageActor.send({ type: 'pend' });
failedStageActor.send({ type: 'process' });
failedStageActor.send({ type: 'fail' });

const retriedTaskActor = createActor(taskStateMachine).start();
retriedTaskActor.send({ type: 'pend' });
retriedTaskActor.send({ type: 'process' });
retriedTaskActor.send({ type: 'retry' });

export const abortedXstatePersistentSnapshot = deleteActor.getPersistedSnapshot();
export const inProgressStageXstatePersistentSnapshot = runningStageActor.getPersistedSnapshot();
export const abortedStageXstatePersistentSnapshot = abortedStageActor.getPersistedSnapshot();
export const pendingStageXstatePersistentSnapshot = pendingStageActor.getPersistedSnapshot();
export const failedStageXstatePersistentSnapshot = failedStageActor.getPersistedSnapshot();
export const retryTaskXstatePersistentSnapshot = retriedTaskActor.getPersistedSnapshot();
export const completedStageXstatePersistentSnapshot = completedStageActor.getPersistedSnapshot();
