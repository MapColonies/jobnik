/**
 * Configuration options for the exponential backoff strategy.
 */
export interface BackoffOptions {
  /**
   * The initial delay (in milliseconds) for the first retry.
   */
  initialBaseRetryDelayMs: number;

  /**
   * The multiplier for each subsequent retry. (e.g., 2 for 1s, 2s, 4s, 8s...).
   */
  backoffFactor: number;

  /**
   * The maximum delay (in milliseconds) to cap the backoff at.
   */
  maxDelayMs: number;

  /**
   * If true, disables jitter, making delays exact (not recommended in production).
   * @default false
   */
  disableJitter?: boolean;

  /**
   * The percentage (as a decimal) to randomize the delay.
   * e.g., 0.25 means the delay will be randomized to +/- 25% of its calculated value.
   * @default 0.25
   */
  maxJitterFactor?: number;
}
