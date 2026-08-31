import { components } from './openapi';
import { StageTypesTemplate } from './stage';
import { Prettify } from './utils';

type UserMetadata = components['schemas']['userMetadata'];
type TaskPayload = components['schemas']['taskPayload'];
type TaskGenericProperties = 'userMetadata' | 'data';

export interface TaskData {
  userMetadata: UserMetadata;
  data: TaskPayload;
}

export type ValidTaskType<TaskTypes> = Extract<keyof TaskTypes, string> | (string & {});

export type InferTaskData<StageType, StageTypes extends StageTypesTemplate<StageTypes>> =
  StageType extends Extract<keyof StageTypes, string> ? StageTypes[StageType]['task'] : TaskData;

/**
 * @example
 * ```typescript
 {
   id: 'task-123',
   stageId: 'stage-456',
   status: 'completed',
   attempts: 1,
   maxAttempts: 3,
   creationTime: '2025-11-20T10:00:00Z',
   updateTime: '2025-11-20T10:05:00Z',
   data: { action: 'resize', width: 800, height: 600 },
   userMetadata: { requestId: 'req-789' },
   traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
   tracestate: null
 }
```
 */
export type Task<TaskInfo extends TaskData = TaskData> = Prettify<
  Omit<components['schemas']['taskResponse'], TaskGenericProperties> & {
    userMetadata?: TaskInfo['userMetadata'];
    data: TaskInfo['data'];
  }
>;

/**
 * @example
 * ```typescript
 {
   data: { action: 'resize', width: 800, height: 600 },
   userMetadata: { requestId: 'req-789' },
   maxAttempts: 3
 }
```
 */
export type NewTask<TaskInfo extends TaskData = TaskData> = Prettify<
  Omit<components['schemas']['createTaskPayload'], TaskGenericProperties | 'tracestate' | 'traceparent'> & {
    userMetadata?: TaskInfo['userMetadata'];
    data: TaskInfo['data'];
  }
>;
