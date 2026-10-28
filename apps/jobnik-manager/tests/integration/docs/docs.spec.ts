import { describe, beforeEach, afterEach, it, expect, beforeAll } from 'vitest';
import type { DependencyContainer } from 'tsyringe';
import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import httpStatusCodes from 'http-status-codes';
import type { Drizzle } from '@src/db/drizzle';
import { getApp } from '@src/app';
import { SERVICES } from '@src/common/constants';
import { initConfig } from '@src/common/config';
import { endDatabasePool, truncateAllTables } from '../common/utils';
import { DocsRequestSender } from './helpers/docsRequestSender';

describe('docs', function () {
  let requestSender: DocsRequestSender;
  let drizzle: Drizzle;
  let container: DependencyContainer;

  beforeAll(async function () {
    await initConfig(true);
  });

  beforeEach(async function () {
    let app;
    [app, container] = await getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
      ],
      useChild: true,
    });

    requestSender = new DocsRequestSender(app);
    drizzle = container.resolve<Drizzle>(SERVICES.DRIZZLE);
    await truncateAllTables(drizzle);
  });

  afterEach(async function () {
    await endDatabasePool(container);
  });

  describe('Happy Path', function () {
    it('should return 200 status code and the resource', async function () {
      const response = await requestSender.getDocs();

      expect(response.status).toBe(httpStatusCodes.OK);
      expect(response.type).toBe('text/html');
    });

    it('should return 200 status code and the json spec', async function () {
      const response = await requestSender.getDocsJson();

      expect(response.status).toBe(httpStatusCodes.OK);

      expect(response.type).toBe('application/json');
      expect(response.body).toHaveProperty('openapi');
    });
  });
});
