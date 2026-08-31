/* eslint-disable no-console */
import path from 'node:path';
import { upAll, downAll } from 'docker-compose';
import { $ } from 'zx';
import { getPort, checkPort } from 'get-port-please';
import isCI from 'is-ci';
import { initConfig, getConfig } from '../../../src/common/config';
import { createDbConnectUrl } from '../../../src/db/helpers';
import { createConnectionOptions, createPrismaClient } from '../../../src/db/createConnection';
import type { Config } from './utils';
import { getLocalTestConfig, updateLocalTestConfig } from './utils';

async function getSelectedPort(config: Config): Promise<number> {
  if (config.db?.port !== undefined) {
    console.log(`Found custom port in local-test.json. Using port: ${config.db.port}`);
    return config.db.port;
  }

  // If a port was not defined in the config file, find an available one and write it to local-test.json
  const port = await getPort({ port: 5433 });
  console.log(`No custom port defined. Using available port: ${port}`);

  updateLocalTestConfig(config, port);

  return port;
}

export async function setup(): Promise<void> {
  const config = getLocalTestConfig();
  const port = await getSelectedPort(config);

  if ((await checkPort(port)) !== false) {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    await upAll({ cwd: path.join(__dirname), log: true, env: { POSTGRES_PORT: port.toString() } });
  }

  await initConfig(true);
  const configInstance = getConfig();
  const dbConfig = configInstance.get('db');
  const connectionDbUrl = createDbConnectUrl(dbConfig);

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const $$ = $({ env: { ...process.env, DATABASE_URL: connectionDbUrl } });
  await $$`node_modules/.bin/prisma migrate deploy --schema ./src/db/prisma/schema.prisma`;
}

export async function teardown(): Promise<void> {
  const configInstance = getConfig();
  const dbConfig = configInstance.get('db');
  const pgPoolConfig = createConnectionOptions(dbConfig);
  const prisma = createPrismaClient(pgPoolConfig, dbConfig.schema);
  await prisma.$queryRaw`DROP SCHEMA IF EXISTS job_manager CASCADE`;
  await prisma.$disconnect();

  if (isCI) {
    console.log('Running in CI environment, downing postgres');
    const port = getLocalTestConfig().db!.port!;

    // eslint-disable-next-line @typescript-eslint/naming-convention
    await downAll({ cwd: path.join(__dirname), log: true, env: { POSTGRES_PORT: port.toString() } });
  }
}
