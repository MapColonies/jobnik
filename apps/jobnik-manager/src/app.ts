import type { Application } from 'express';
import type { DependencyContainer } from 'tsyringe';
import { schedule, validate } from 'node-cron';
import type { PrismaClient } from '@prismaClient';
import type { ConfigType } from '@common/config';
import { registerExternalValues, type RegisterOptions } from './containerConfig';
import { ServerBuilder } from './serverBuilder';
import { SERVICES } from './common/constants';
import { verifyDbSetup } from './db/createConnection';
import { TaskManager } from './tasks/models/manager';
import { SERVICE_METRICS_SYMBOL } from './common/serviceMetrics';

async function getApp(registerOptions?: RegisterOptions): Promise<[Application, DependencyContainer]> {
  const container = await registerExternalValues(registerOptions);
  const prisma = container.resolve<PrismaClient>(SERVICES.PRISMA);
  const config = container.resolve<ConfigType>(SERVICES.CONFIG);
  const dbConfig = config.get('db');
  const cronConfig = config.get('staleTasksSweeperCron');

  await verifyDbSetup(prisma, dbConfig.schema);

  container.resolve(SERVICE_METRICS_SYMBOL); // Initialize service metrics

  const app = container.resolve(ServerBuilder).build();

  // Schedule cron job to clean stale tasks
  /* v8 ignore next 7 -- @preserve */
  if (cronConfig.enabled) {
    const taskManager = container.resolve(TaskManager);
    if (!validate(cronConfig.schedule)) {
      throw new Error(`Invalid cron schedule: ${cronConfig.schedule}`);
    }

    schedule(cronConfig.schedule, async () => {
      await taskManager.cleanStaleTasks();
    });
  }

  return [app, container];
}

export { getApp };
