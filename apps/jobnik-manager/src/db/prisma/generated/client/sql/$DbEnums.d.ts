export interface $DbEnums {}

export namespace $DbEnums {
  type job_operation_status_enum = 'Pending' | 'In-Progress' | 'Completed' | 'Failed' | 'Aborted' | 'Created' | 'Paused';
  type stage_operation_status_enum = 'Pending' | 'In-Progress' | 'Completed' | 'Failed' | 'Aborted' | 'Waiting' | 'Created';
  type priority_enum = 'Very-High' | 'High' | 'Medium' | 'Low' | 'Very-Low';
  type task_operation_status_enum = 'Pending' | 'In-Progress' | 'Completed' | 'Failed' | 'Created' | 'Retried';
}
