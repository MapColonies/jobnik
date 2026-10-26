import { describe, beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { initConnection } from '@map-colonies/drizzle-utils';
import { getApp } from '@src/app';
import { SERVICES } from '@common/constants';
import { getConfig, initConfig } from '@src/common/config';

const RENAMED_SUFFIX = '_renamed_by_test';

describe('startup database verification', () => {
  let pool: Pool;
  let restore: string | undefined;

  const startApp = async (): Promise<unknown> =>
    getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
      ],
      useChild: true,
    });

  beforeAll(async function () {
    await initConfig(true);
    pool = await initConnection(getConfig().get('db'));
  });

  afterEach(async function () {
    if (restore !== undefined) {
      await pool.query(restore);
      restore = undefined;
    }
  });

  afterAll(async function () {
    await pool.end();
  });

  it('should fail to start when the job_manager schema is missing', async function () {
    await pool.query(`ALTER SCHEMA job_manager RENAME TO job_manager${RENAMED_SUFFIX}`);
    restore = `ALTER SCHEMA job_manager${RENAMED_SUFFIX} RENAME TO job_manager`;

    await expect(startApp()).rejects.toThrow("Schema: job_manager doesn't exist");
  });

  it.each(['job', 'stage', 'task'])('should fail to start when the %s table is missing', async function (table) {
    await pool.query(`ALTER TABLE job_manager.${table} RENAME TO ${table}${RENAMED_SUFFIX}`);
    restore = `ALTER TABLE job_manager.${table}${RENAMED_SUFFIX} RENAME TO ${table}`;

    await expect(startApp()).rejects.toThrow(`Missing tables in schema job_manager: ${table}`);
  });
});
