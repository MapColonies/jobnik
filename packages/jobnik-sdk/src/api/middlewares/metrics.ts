import type { Middleware } from 'openapi-fetch';
import type { JobnikMetrics } from '../../telemetry/metrics';
import { normalizeStatusCode } from '../../telemetry/metrics-utils';
import { MILLISECOND_IN_SECOND } from '../../common/constants';

interface RequestTiming {
  startTime: number;
}

/**
 * Creates a middleware that collects HTTP metrics for all requests.
 * Tracks request duration and request sizes.
 *
 * Note: Retry metrics are tracked in the HTTP client's retry callback, not here.
 *
 * @param metrics - The metrics instance to record to
 * @returns An openapi-fetch middleware
 */
export function createMetricsMiddleware(metrics: JobnikMetrics): { onRequest: Middleware['onRequest']; onResponse: Middleware['onResponse'] } {
  // Use Map to store timing data keyed by request
  // This allows us to correlate onRequest and onResponse calls
  const requestTimings = new Map<string, RequestTiming>();

  return {
    onRequest({ request }): void {
      const requestKey = `${request.method}:${request.url}:${Date.now()}`;
      const startTime = performance.now();

      requestTimings.set(requestKey, { startTime });

      // Store the request key in a header so we can retrieve it in onResponse
      // This is a workaround since openapi-fetch doesn't pass context between middleware calls
      request.headers.set('X-Jobnik-Request-Key', requestKey);

      return undefined;
    },

    onResponse({ response, request }): void {
      const requestKey = request.headers.get('X-Jobnik-Request-Key');

      if (requestKey !== null) {
        const timing = requestTimings.get(requestKey);

        if (timing) {
          // Manual timing is kept here due to the Map-based storage pattern
          const duration = (performance.now() - timing.startTime) / MILLISECOND_IN_SECOND;
          const method = request.method.toUpperCase();
          const statusCode = normalizeStatusCode(response.status);

          // Track request duration
          // Note: We don't track 'retried' here as retries are tracked in the retry callback
          metrics.httpRequestDuration.labels(method, statusCode.toString(), 'false').observe(duration);

          // Clean up timing data
          requestTimings.delete(requestKey);

          // Remove the internal header
          request.headers.delete('X-Jobnik-Request-Key');
        }
      }

      return undefined;
    },
  };
}
