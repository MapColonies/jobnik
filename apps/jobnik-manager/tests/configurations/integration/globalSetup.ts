/* eslint-disable no-console */
import path from 'node:path';
import { upAll, downAll } from 'docker-compose';
import { getPort, checkPort } from 'get-port-please';
import isCI from 'is-ci';
import { initConnection } from '@map-colonies/drizzle-utils';
import { initConfig, getConfig } from '../../../src/common/config';
import { createDrizzle, runMigrations } from '../../../src/db/drizzle';
import { JOB_MANAGER_SCHEMA } from '../../../src/db/entities';
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
  // Same runner as the deploy-time migration command (src/db/runMigrations.ts).
  const pool = await initConnection(getConfig().get('db'));
  try {
    await runMigrations(createDrizzle(pool));
  } finally {
    await pool.end();
  }
}

export async function teardown(): Promise<void> {
  const pool = await initConnection(getConfig().get('db'));
  try {
    await pool.query(`DROP SCHEMA IF EXISTS ${JOB_MANAGER_SCHEMA} CASCADE`);
  } finally {
    await pool.end();
  }

  if (isCI) {
    console.log('Running in CI environment, downing postgres');
    const port = getLocalTestConfig().db!.port!;

    // eslint-disable-next-line @typescript-eslint/naming-convention
    await downAll({ cwd: path.join(__dirname), log: true, env: { POSTGRES_PORT: port.toString() } });
  }
}
