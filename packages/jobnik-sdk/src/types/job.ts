import { components } from './openapi';
import { Prettify } from './utils';

type UserMetadata = components['schemas']['userMetadata'];
type JobPayload = components['schemas']['jobPayload'];
/**
 * @inline
 */
type JobGenericProperties = 'userMetadata' | 'data';

export type JobTypesTemplate<JobTypes> = { [K in keyof JobTypes]: JobData };

export interface JobData {
  userMetadata: UserMetadata;
  data: JobPayload;
}

export type ValidJobType<JobTypes> = Extract<keyof JobTypes, string> | (string & {});

export type InferJobData<JobType, JobTypes> = JobType extends Extract<keyof JobTypes, string> ? JobTypes[JobType] : JobData;

/**
 * @example
 * ```typescript
 {
   id: 'job-123',
   name: 'process-order',
   status: 'completed',
   priority: 'MEDIUM,
   createdAt: '2025-11-20T10:00:00Z',
   updatedAt: '2025-11-20T10:05:00Z',
   startedAt: '2025-11-20T10:00:30Z',
   completedAt: '2025-11-20T10:05:00Z',
   data: { orderId: 'ord-456', amount: 99.99 },
   userMetadata: { customerId: 'cust-789' }
 }
```
 */
export type Job<
  JobTypes extends JobTypesTemplate<JobTypes> = Record<string, JobData>,
  JobType extends ValidJobType<JobTypes> = 'unset',
  // JobInfo extends JobData = JobData,
> = Prettify<
  Omit<components['schemas']['job'], JobGenericProperties> & {
    // name: JobName;
    userMetadata?: InferJobData<JobType, JobTypes>['userMetadata'];
    data: InferJobData<JobType, JobTypes>['data'];
  }
>;

/**
 * @example
 * ```typescript
 {
   name: 'process-order',
   priority: 'MEDIUM',
   data: { orderId: 'ord-456', amount: 99.99 },
   userMetadata: { customerId: 'cust-789' }
 }
```
 */
export type NewJob<
  JobTypes extends JobTypesTemplate<JobTypes> = Record<string, JobData>,
  JobType extends ValidJobType<JobTypes> = 'unset',
> = Prettify<
  Omit<components['schemas']['createJobPayload'], JobGenericProperties | 'tracestate' | 'traceparent'> & {
    // name: JobName;
    userMetadata?: InferJobData<JobType, JobTypes>['userMetadata'];
    data: InferJobData<JobType, JobTypes>['data'];
  }
>;
