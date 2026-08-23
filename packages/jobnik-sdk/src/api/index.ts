import createClient, { type Client } from 'openapi-fetch';
import type { paths } from '../types';
import { createRetryAgent, HttpClientOptions } from '../network/httpClient';
import type { JobnikMetrics } from '../telemetry/metrics';
import { wrapClient } from './wrapper';
import { createErrorHandlingMiddleware } from './middlewares/error';
import { createResponseMiddleware } from './middlewares/response';
import { createMetricsMiddleware } from './middlewares/metrics';

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type ApiClient = Prettify<Client<paths>>;
export type ScopedApiClient = Prettify<Client<Omit<paths, '/stages/{stageType}/tasks/dequeue' | '/tasks/{taskId}/status'>>>;

export function createApiClient(baseUrl: string, httpClientOptions: HttpClientOptions = {}, metrics?: JobnikMetrics): ApiClient {
  const client = createClient<paths>({
    baseUrl,

    headers: {
      'Content-Type': 'application/json',
    },
    dispatcher: createRetryAgent(httpClientOptions, undefined, metrics),
  });

  const middleware = {
    onError: createErrorHandlingMiddleware(),
    onResponse: createResponseMiddleware(),
    async onRequest(): Promise<void> {
      // Request handling logic can be added here if needed
    },
  };

  // Add metrics middleware if metrics are provided
  if (metrics) {
    const metricsMiddleware = createMetricsMiddleware(metrics);
    Object.assign(middleware, {
      onRequest: metricsMiddleware.onRequest,
      onResponse: async (params: Parameters<NonNullable<typeof middleware.onResponse>>[0]) => {
        // Call both response middlewares in sequence
        await metricsMiddleware.onResponse?.(params);
        await createResponseMiddleware()(params);
      },
    });
  }

  client.use(middleware);

  return wrapClient(client);
}
