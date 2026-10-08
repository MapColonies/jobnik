export interface $DbEnums {}

export namespace $DbEnums {
  type job_operation_status_enum = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ABORTED' | 'CREATED' | 'PAUSED';
  type stage_operation_status_enum = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ABORTED' | 'WAITING' | 'CREATED';
  type priority_enum = 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
  type task_operation_status_enum = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CREATED' | 'RETRIED';
}
