export class SamePriorityChangeError extends Error {
  public readonly code = 'SAME_PRIORITY_CHANGE';
  /**
   * Creates an instance of SamePriorityChangeError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const errorMessages = {
  /**Operation that are restricted for jobs with finite statuses*/
  jobNotInFiniteState: 'JOB_NOT_IN_FINITE_STATE',
  /**Adding stages to finite state jobs is not allowed*/
  jobAlreadyFinishedStagesError: 'JOB_ALREADY_FINISHED_STAGES_ERROR',
  /**Signifies that the specified job could not be located*/
  jobNotFound: 'JOB_NOT_FOUND',
  /**Stages cannot be added to or modified for predefined jobs*/
  preDefinedJobStageModificationError: 'PREDEFINED_JOB_STAGE_MODIFICATION_ERROR',
  /**Signifies that the job status transition is not allowed*/
  illegalJobStatusTransitionError: 'ILLEGAL_JOB_STATUS_TRANSITION_ERROR',
  /**Signifies that the job priority cannot be updated to the same value*/
  priorityCannotBeUpdatedToSameValue: 'PRIORITY_CANNOT_BE_UPDATED_TO_SAME_VALUE',
} as const;
