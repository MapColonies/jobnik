import { describe, beforeAll, beforeEach, afterEach, afterAll, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { StatusCodes } from 'http-status-codes';
import { initConnection } from '@map-colonies/drizzle-utils';
import { createRequestSender, type RequestSender } from '@map-colonies/openapi-helpers/requestSender';
import { openapiFilePath, type paths, type operations } from 'jobnik-openapi';
import { SERVICES } from '@common/constants';
import { getConfig, initConfig } from '@src/common/config';
import { setupIntegrationApp, teardownIntegrationApp, type IntegrationApp } from '../common/utils';

describe('database connection loss', () => {
  let integrationApp: IntegrationApp;
  let requestSender: RequestSender<paths, operations>;
  let appPool: Pool;
  let adminPool: Pool;

  beforeAll(async function () {
    await initConfig(true);
    adminPool = await initConnection(getConfig().get('db'));
  });

  beforeEach(async function () {
    integrationApp = await setupIntegrationApp();
    requestSender = await createRequestSender<paths, operations>(openapiFilePath, integrationApp.app);
    appPool = integrationApp.container.resolve<Pool>(SERVICES.PG_POOL);
  });

  afterEach(async function () {
    await teardownIntegrationApp(integrationApp.container);
  });

  afterAll(async function () {
    await adminPool.end();
  });

  it('should keep serving requests after the database terminates the idle connections of the app', async function () {
    const client = await appPool.connect();
    const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    client.release();

    await adminPool.query('SELECT pg_terminate_backend($1)', [rows[0]!.pid]);
    await vi.waitFor(() => expect(appPool.totalCount).toBe(0));

    const response = await requestSender.findJobsV1({ queryParams: {} });

    expect(response).toSatisfyApiSpec();
    expect(response.status).toBe(StatusCodes.OK);
  });

  it('should keep serving requests after the database terminates a connection the app has checked out', async function () {
    const client = await appPool.connect();
    const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');

    const ended = new Promise((resolve) => client.once('end', resolve));
    await adminPool.query('SELECT pg_terminate_backend($1)', [rows[0]!.pid]);
    await ended;

    await expect(client.query('SELECT 1')).rejects.toThrow();

    client.release(true);

    const response = await requestSender.findJobsV1({ queryParams: {} });

    expect(response).toSatisfyApiSpec();
    expect(response.status).toBe(StatusCodes.OK);
  });
});
