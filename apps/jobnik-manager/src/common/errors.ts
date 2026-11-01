import type { JobOperationStatus, StageOperationStatus, TaskOperationStatus } from '@src/db/persistenceModel';

export function illegalStatusTransitionErrorMessage(
  currentStatus: JobOperationStatus | StageOperationStatus | TaskOperationStatus,
  requiredStatus: JobOperationStatus | StageOperationStatus | TaskOperationStatus
): string {
  return `Illegal status transition from ${currentStatus} to ${requiredStatus}`;
}
