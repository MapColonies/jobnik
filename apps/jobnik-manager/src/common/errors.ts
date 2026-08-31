import type { JobOperationStatus, StageOperationStatus, TaskOperationStatus } from '@src/db/prisma/generated/client';

export const prismaKnownErrors = {
  /**An operation failed because it depends on one or more records that were required but not found. {cause} */
  recordNotFound: 'P2025',
} as const;

export function illegalStatusTransitionErrorMessage(
  currentStatus: JobOperationStatus | StageOperationStatus | TaskOperationStatus,
  requiredStatus: JobOperationStatus | StageOperationStatus | TaskOperationStatus
): string {
  return `Illegal status transition from ${currentStatus} to ${requiredStatus}`;
}
