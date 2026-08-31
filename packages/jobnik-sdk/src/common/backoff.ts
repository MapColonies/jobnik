import type { BackoffOptions } from '../types/backoff';

/**
 * Manages exponential backoff state and delay calculation for endless retries.
 */
export class ExponentialBackoff {
  private readonly options: Required<BackoffOptions>;
  private currentAttempt = 1;

  public constructor(options: BackoffOptions) {
    this.options = {
      disableJitter: false,
      maxJitterFactor: 0.25,
      ...options,
    };
  }

  /**
   * Gets the next calculated delay in milliseconds and increments the internal attempt counter.
   * @returns The delay duration (in ms) to wait before the next attempt.
   */
  public getNextDelay(): number {
    const { initialBaseRetryDelayMs, backoffFactor, maxDelayMs, disableJitter, maxJitterFactor } = this.options;

    const baseDelay = initialBaseRetryDelayMs * Math.pow(backoffFactor, this.currentAttempt - 1);

    const cappedDelay = Math.min(baseDelay, maxDelayMs);

    this.currentAttempt++;

    if (disableJitter) {
      return Math.floor(cappedDelay);
    }

    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    const randomFactor = (Math.random() * 2 - 1) * maxJitterFactor;

    const finalDelay = cappedDelay * (1 + randomFactor);

    return Math.floor(finalDelay);
  }

  /**
   * Resets the attempt counter back to 1.
   * Call this after a successful operation.
   */
  public reset(): void {
    this.currentAttempt = 1;
  }
}
