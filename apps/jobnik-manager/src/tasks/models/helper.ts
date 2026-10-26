import type { Task } from '@src/db/persistenceModel';
import type { TaskModel } from './models';

/**
 * This function converts a task row to a TaskModel API object.
 * @param taskRow db row
 * @returns TaskModel
 */
export function convertTaskRowToResponse(taskRow: Task): TaskModel {
  const { xstate, creationTime, tracestate, startTime, endTime, updateTime, ...rest } = taskRow;

  const transformedFields = {
    updateTime: updateTime.toISOString(),
    creationTime: creationTime.toISOString(),
    tracestate: tracestate ?? undefined,
    startTime: startTime ? startTime.toISOString() : undefined,
    endTime: endTime ? endTime.toISOString() : undefined,
  };

  return Object.assign(rest, transformedFields);
}

/**
 * This function converts an array of task rows to an array of TaskModel API objects.
 * @param taskRows array of db rows
 * @returns array of TaskModel
 */
export function convertArrayTaskRowToResponse(taskRows: Task[]): TaskModel[] {
  return taskRows.map((task) => convertTaskRowToResponse(task));
}
