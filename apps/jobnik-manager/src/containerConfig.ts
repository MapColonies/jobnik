import { getOtelMixin } from '@map-colonies/tracing-utils';
import { trace } from '@opentelemetry/api';
import { Registry } from 'prom-client';
import type { DependencyContainer } from 'tsyringe/dist/typings/types';
import { jsLogger } from '@map-colonies/js-logger';
import { instanceCachingFactory, instancePerContainerCachingFactory } from 'tsyringe';
import type { HealthCheck } from '@godaddy/terminus';
import type { PrismaClient } from '@prismaClient';
import { type InjectionObject, registerDependencies } from '@common/dependencyRegistration';
import { DB_CONNECTION_TIMEOUT, ROUTERS, SERVICES, SERVICE_NAME } from '@common/constants';
import { getTracing } from '@common/tracing';
import { getConfig } from './common/config';
import { createConnectionOptions, createPrismaClient } from './db/createConnection';
import { promiseTimeout } from './common/utils/promiseTimeout';
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

  const prismaClientConfig = createConnectionOptions(dbConfig);

  /* v8 ignore next 7 -- @preserve */
  const healthCheck = (prisma: PrismaClient): HealthCheck => {
    return async (): Promise<void> => {
      const check = prisma.$queryRaw`SELECT 1`.then(() => {
        return;
      });
      return promiseTimeout<void>(DB_CONNECTION_TIMEOUT, check);
    };
  };

  const dependencies: InjectionObject<unknown>[] = [
    { token: SERVICES.CONFIG, provider: { useValue: configInstance } },
    { token: SERVICES.LOGGER, provider: { useValue: logger } },
    { token: SERVICES.TRACER, provider: { useValue: tracer } },
    { token: SERVICES.METRICS, provider: { useValue: metricsRegistry } },
    { token: SERVICES.SERVICE_METRICS, provider: { useValue: serviceMetricsRegistry } },
    { token: SERVICE_METRICS_SYMBOL, provider: { useFactory: serviceMetricsFactory } },
    {
      token: SERVICES.PRISMA,
      provider: {
        useFactory: instancePerContainerCachingFactory(() => {
          return createPrismaClient(prismaClientConfig, dbConfig.schema);
        }),
      },
    },
    {
      token: SERVICES.HEALTHCHECK,
      provider: {
        /* v8 ignore next 4 -- @preserve */
        useFactory: instanceCachingFactory((container) => {
          const prisma = container.resolve<PrismaClient>(SERVICES.PRISMA);
          return healthCheck(prisma);
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
        useValue: {
          /* v8 ignore next 3 -- @preserve */
          useValue: async (): Promise<void> => {
            await Promise.all([getTracing().stop()]);
          },
        },
      },
    },
  ];

  return Promise.resolve(registerDependencies(dependencies, options?.override, options?.useChild));
};
