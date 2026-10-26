import { getOtelMixin } from '@map-colonies/tracing-utils';
import { trace } from '@opentelemetry/api';
import { Registry } from 'prom-client';
import type { DependencyContainer } from 'tsyringe/dist/typings/types';
import { jsLogger } from '@map-colonies/js-logger';
import { instanceCachingFactory, instancePerContainerCachingFactory } from 'tsyringe';
import type { HealthCheck } from '@godaddy/terminus';
import type { Pool } from 'pg';
import { healthCheck, initConnection } from '@map-colonies/drizzle-utils';
import { type InjectionObject, registerDependencies } from '@common/dependencyRegistration';
import { DB_CONNECTION_TIMEOUT, ROUTERS, SERVICES, SERVICE_NAME } from '@common/constants';
import { getTracing } from '@common/tracing';
import { getConfig } from './common/config';
import { createDrizzle } from './db/drizzle';
import { SERVICE_METRICS_SYMBOL, serviceMetricsFactory } from './common/serviceMetrics';
import { jobV1RouterFactory } from './api/v1/jobs/router';
import { stageV1RouterFactory } from './api/v1/stages/router';
import { taskV1RouterFactory } from './api/v1/tasks/router';
import { v1RouterFactory, V1_ROUTER_SYMBOL } from './api/v1';

export interface RegisterOptions {
  override?: InjectionObject<unknown>[];
  useChild?: boolean;
}

export const registerExternalValues = async (options?: RegisterOptions): Promise<DependencyContainer> => {
  const configInstance = getConfig();
  const dbConfig = configInstance.get('db');

  const loggerConfig = configInstance.get('telemetry.logger');
  const loggerRedactionSettings = { paths: ['data', 'response.data'], remove: true };
  const logger = jsLogger({ ...loggerConfig, prettyPrint: loggerConfig.prettyPrint, mixin: getOtelMixin(), redact: loggerRedactionSettings });

  const tracer = trace.getTracer(SERVICE_NAME);
  const metricsRegistry = new Registry();
  const serviceMetricsRegistry = new Registry();

  configInstance.initializeMetrics(metricsRegistry);

  let pool: Pool;
  try {
    pool = await initConnection(dbConfig);
  } catch (error) {
    throw new Error('Failed to connect to the database', { cause: error });
  }

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: configInstance } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    { token: SERVICES.TRACER, provider: { useValue: tracer } },
    { token: SERVICES.METRICS, provider: { useValue: metricsRegistry } },
    { token: SERVICES.SERVICE_METRICS, provider: { useValue: serviceMetricsRegistry } },
    { token: SERVICE_METRICS_SYMBOL, provider: { useFactory: serviceMetricsFactory } },
    { token: SERVICES.PG_POOL, provider: { useValue: pool } },
    {
      token: SERVICES.DRIZZLE,
      provider: {
        useFactory: instancePerContainerCachingFactory((container) => {
          return createDrizzle(container.resolve<Pool>(SERVICES.PG_POOL));
        }),
      },
    },
    {
      token: SERVICES.HEALTHCHECK,
      provider: {
        /* v8 ignore next 3 -- @preserve */
        useFactory: instanceCachingFactory((container): HealthCheck => {
          return healthCheck(container.resolve<Pool>(SERVICES.PG_POOL), DB_CONNECTION_TIMEOUT);
        }),
      },
    },

    { token: ROUTERS.JOBS_V1, provider: { useFactory: jobV1RouterFactory } },
    { token: ROUTERS.STAGES_V1, provider: { useFactory: stageV1RouterFactory } },
    { token: ROUTERS.TASKS_V1, provider: { useFactory: taskV1RouterFactory } },
    { token: V1_ROUTER_SYMBOL, provider: { useFactory: v1RouterFactory } },

    {
      token: 'onSignal',
      provider: {
        /* v8 ignore next 3 -- @preserve */
        useValue: async (): Promise<void> => {
          await Promise.all([getTracing().stop(), pool.end()]);
        },
      },
    },
  ];

  return registerDependencies(dependencies, options?.override, options?.useChild);
};
