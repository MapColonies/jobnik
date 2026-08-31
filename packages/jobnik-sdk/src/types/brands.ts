declare const brand: unique symbol;

export type Brand<T, Brand extends string> = T & { [brand]: Brand };

/**
 * Branded type for job identifiers.
 * Prevents accidentally mixing job IDs with stage or task IDs at compile time.
 *
 * @example
 * ```typescript
 * const jobId = 'job-123' as JobId;
 * ```
 */
export type JobId = Brand<string, 'JobId'>;

/**
 * Branded type for stage identifiers.
 * Prevents accidentally mixing stage IDs with job or task IDs at compile time.
 *
 * @example
 * ```typescript
 * const stageId = 'stage-456' as StageId;
 * ```
 */
export type StageId = Brand<string, 'StageId'>;

/**
 * Branded type for task identifiers.
 * Prevents accidentally mixing task IDs with job or stage IDs at compile time.
 *
 * @example
 * ```typescript
 * const taskId = 'task-789' as TaskId;
 * ```
 */
export type TaskId = Brand<string, 'TaskId'>;
