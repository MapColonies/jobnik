/**
 * Interface for Consumer instances that consume and process tasks from the job management system.
 * Supports dequeueing tasks and updating their status to completed or failed.
 *
 * @template StageTypes - Interface defining stage types with their metadata, data, and task schemas
 */

import type { TaskId } from './brands';
import type { StageTypesTemplate, ValidStageType } from './stage';
import type { InferTaskData, Task } from './task';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IConsumer<StageTypes extends StageTypesTemplate<StageTypes> = {}> {
  /**
   * Dequeues the highest priority pending task of the specified stage type.
   * @param stageType - Stage type to dequeue tasks from
   * @returns Promise resolving to the dequeued task, or null if no tasks are available
   */
  dequeueTask: <StageType extends ValidStageType<StageTypes>>(stageType: StageType) => Promise<Task<InferTaskData<StageType, StageTypes>> | null>;

  /**
   * Marks a task as completed by updating its status.
   * @param taskId - Branded task ID to mark as completed
   * @returns Promise that resolves when the status update is complete
   */
  markTaskCompleted: (taskId: TaskId) => Promise<void>;

  /**
   * Marks a task as failed by updating its status.
   * @param taskId - Branded task ID to mark as failed
   * @returns Promise that resolves when the status update is complete
   */
  markTaskFailed: (taskId: TaskId) => Promise<void>;
}
