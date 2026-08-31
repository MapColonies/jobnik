/* eslint-disable */
// This file was auto-generated. Do not edit manually.
// To update, run the error generation script again.

export class ValidationError extends Error {
  public readonly code = 'VALIDATION_ERROR';
  /**
   * Creates an instance of ValidationError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DatabaseRelatedError extends Error {
  public readonly code = 'DATABASE_RELATED_ERROR';
  /**
   * Creates an instance of DatabaseRelatedError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnknownError extends Error {
  public readonly code = 'UNKNOWN_ERROR';
  /**
   * Creates an instance of UnknownError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class JobNotFoundError extends Error {
  public readonly code = 'JOB_NOT_FOUND';
  /**
   * Creates an instance of JobNotFoundError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class JobNotInFiniteStateError extends Error {
  public readonly code = 'JOB_NOT_IN_FINITE_STATE';
  /**
   * Creates an instance of JobNotInFiniteStateError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class IllegalJobStatusTransitionError extends Error {
  public readonly code = 'ILLEGAL_JOB_STATUS_TRANSITION';
  /**
   * Creates an instance of IllegalJobStatusTransitionError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class JobInFiniteStateError extends Error {
  public readonly code = 'JOB_IN_FINITE_STATE';
  /**
   * Creates an instance of JobInFiniteStateError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StageNotFoundError extends Error {
  public readonly code = 'STAGE_NOT_FOUND';
  /**
   * Creates an instance of StageNotFoundError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class IllegalStageStatusTransitionError extends Error {
  public readonly code = 'ILLEGAL_STAGE_STATUS_TRANSITION';
  /**
   * Creates an instance of IllegalStageStatusTransitionError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class StageInFiniteStateError extends Error {
  public readonly code = 'STAGE_IN_FINITE_STATE';
  /**
   * Creates an instance of StageInFiniteStateError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotAllowedToAddTasksToInProgressStageError extends Error {
  public readonly code = 'NOT_ALLOWED_TO_ADD_TASKS_TO_IN_PROGRESS_STAGE';
  /**
   * Creates an instance of NotAllowedToAddTasksToInProgressStageError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TaskNotFoundError extends Error {
  public readonly code = 'TASK_NOT_FOUND';
  /**
   * Creates an instance of TaskNotFoundError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TaskStatusUpdateFailedError extends Error {
  public readonly code = 'TASK_STATUS_UPDATE_FAILED';
  /**
   * Creates an instance of TaskStatusUpdateFailedError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class IllegalTaskStatusTransitionError extends Error {
  public readonly code = 'ILLEGAL_TASK_STATUS_TRANSITION';
  /**
   * Creates an instance of IllegalTaskStatusTransitionError.
   * @param message - The error message.
   * @param cause - Optional original error or server response data.
   */
  public constructor(message: string, cause?: unknown) {
    super(message, { cause });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
