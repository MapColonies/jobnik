export const errorMessages = {
  /**Signifies that the specified task could not be located*/
  taskNotFound: 'TASK_NOT_FOUND',
  /**Signifies that the specified task could not be added*/
  addTaskNotAllowed: 'ADD_TASK_NOT_ALLOWED',
  /**Signifies that the specified task could not be updated*/
  taskStatusUpdateFailed: 'TASK_STATUS_UPDATE_FAILED',
  /**Signifies that the specified task status transition is not allowed*/
  illegalTaskStatusTransitionError: 'ILLEGAL_TASK_STATUS_TRANSITION_ERROR',
} as const;
