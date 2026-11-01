import { describe, beforeEach, afterEach, it, expect, beforeAll } from 'vitest';
import type { DependencyContainer } from 'tsyringe';
import httpStatusCodes from 'http-status-codes';
import { initConfig } from '@src/common/config';
import { setupIntegrationApp, teardownIntegrationApp } from '../common/utils';
import { DocsRequestSender } from './helpers/docsRequestSender';

describe('docs', function () {
  let requestSender: DocsRequestSender;
  let container: DependencyContainer;

  beforeAll(async function () {
    await initConfig(true);
  });

  beforeEach(async function () {
    const integrationApp = await setupIntegrationApp();
    container = integrationApp.container;
    requestSender = new DocsRequestSender(integrationApp.app);
  });

  afterEach(async function () {
    await teardownIntegrationApp(container);
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
