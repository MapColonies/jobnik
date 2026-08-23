import { components } from './openapi';
import { TaskData } from './task';
import { Prettify } from './utils';

type UserMetadata = components['schemas']['userMetadata'];
type StagePayload = components['schemas']['stagePayload'];
type StageGenericProperties = 'userMetadata' | 'data' | 'type';

export interface StageData {
  userMetadata: UserMetadata;
  data: StagePayload;
  task: TaskData;
}

export type StageTypesTemplate<StageTypes> = { [K in keyof StageTypes]: StageData };

export type ValidStageType<StageTypes> = Extract<keyof StageTypes, string> | (string & {});

export type InferStageData<StageType, StageTypes> = StageType extends Extract<keyof StageTypes, string> ? StageTypes[StageType] : StageData;

/**
 * @example
 * ```typescript
 {
   id: 'stage-123',
   type: 'image-processing',
   status: 'completed',
   percentage: 100,
   jobId: 'job-123',
   order: 1,
   data: { imageUrl: 'https://example.com/image.jpg', filters: ['resize', 'compress'] },
   userMetadata: { userId: 'user-456' },
   traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
   tracestate: null
 }
```
 */
export type Stage<StageType extends string = string, StageInfo extends StageData = StageData> = Prettify<
  Omit<components['schemas']['stageResponse'], StageGenericProperties> & {
    userMetadata?: StageInfo['userMetadata'];
    data: StageInfo['data'];
    type: StageType;
  }
>;

/**
 * @example
 * ```typescript
 {
   type: 'image-processing',
   data: { imageUrl: 'https://example.com/image.jpg', filters: ['resize', 'compress'] },
   userMetadata: { userId: 'user-456' }
 }
```
 */
export type NewStage<StageType extends string = string, StageInfo extends StageData = StageData> = Prettify<
  Omit<components['schemas']['createStagePayload'], StageGenericProperties | 'tracestate' | 'traceparent'> & {
    type: StageType;
    userMetadata?: StageInfo['userMetadata'];
    data: StageInfo['data'];
  }
>;
