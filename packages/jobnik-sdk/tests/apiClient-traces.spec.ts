import * as api from '@opentelemetry/api';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { MockAgent, MockPool } from 'undici';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { createApiClient } from '../src/api/index';

const contextManager = new AsyncHooksContextManager();
contextManager.enable();
api.context.setGlobalContextManager(contextManager);

/* eslint-disable */
// Add type declaration for global mockAgent
declare global {
  var mockAgentForTest: MockAgent;
}

// Mock the Agent constructor from undici to use our MockAgent instance
vi.mock('undici', async () => {
  // Store the actual implementation
  const originalModule = await vi.importActual('undici');

  return {
    ...originalModule,
    // Mock agent constructor to return our mockAgent
    Agent: vi.fn().mockImplementation(function () {
      // We'll set this in the test
      return global.mockAgentForTest;
    }),
  };
});
/* eslint-enable */

describe('apiClient tracing', () => {
  let mockAgent: MockAgent;
  let mockPool: MockPool;
  let apiClient: ReturnType<typeof createApiClient>;
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  const provider = new BasicTracerProvider({ spanProcessors: [spanProcessor] });

  api.trace.setGlobalTracerProvider(provider);

  const tracer = provider.getTracer('my-test-tracer');

  const baseUrl = 'http://localhost:8080';

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    // Store the mockAgent in a global variable so our mocked Agent constructor can access it
    global.mockAgentForTest = mockAgent;
    mockPool = mockAgent.get(baseUrl);

    apiClient = createApiClient(baseUrl, {
      retry: { maxRetries: 0 },
      agentOptions: { keepAliveTimeout: 1 },
    });
  });

  afterEach(async () => {
    await mockAgent.close();
    // Optional property can be deleted
    // @ts-expect-error its a global variable
    delete global.mockAgentForTest;

    memoryExporter.reset();
  });

  it('should create a span for the API call', async () => {
    expect.assertions(1);
    mockPool.intercept({ path: '/v1/jobs', method: 'GET' }).reply(200, []);
    await tracer.startActiveSpan('Test Span', async (span) => {
      await apiClient.GET('/v1/jobs');
      span.end();
    });

    const spans = memoryExporter.getFinishedSpans();

    expect(spans[0]).toHaveProperty('name', 'API Request: GET /v1/jobs');
  });

  it('should set the operation Id as attribute on the span', async () => {
    expect.assertions(1);
    mockPool.intercept({ path: '/v1/jobs', method: 'GET' }).reply(200, []);
    await tracer.startActiveSpan('Test Span', async (span) => {
      await apiClient.GET('/v1/jobs');
      span.end();
    });
    const spans = memoryExporter.getFinishedSpans();

    expect(spans[0]).toHaveProperty(['attributes', 'api.operation_id'], 'findJobsV1');
  });

  it('should create a span for the API call when using the request method', async () => {
    expect.assertions(1);
    mockPool.intercept({ path: '/v1/jobs', method: 'GET' }).reply(200, []);
    await tracer.startActiveSpan('Test Span', async (span) => {
      await apiClient.request('get', '/v1/jobs');
      span.end();
    });
    const spans = memoryExporter.getFinishedSpans();
    expect(spans[0]).toHaveProperty('name', 'API Request: GET /v1/jobs');
  });

  it.for([
    { method: 'GET' as const, path: '/jobs', expectedName: 'API Request: GET /jobs' },
    { method: 'POST' as const, path: '/jobs', expectedName: 'API Request: POST /jobs' },
    { method: 'PUT' as const, path: '/jobs/123', expectedName: 'API Request: PUT /jobs/123' },
    { method: 'PATCH' as const, path: '/jobs/123', expectedName: 'API Request: PATCH /jobs/123' },
    { method: 'DELETE' as const, path: '/jobs/123', expectedName: 'API Request: DELETE /jobs/123' },
    { method: 'HEAD' as const, path: '/jobs/123', expectedName: 'API Request: HEAD /jobs/123' },
    { method: 'OPTIONS' as const, path: '/jobs/123', expectedName: 'API Request: OPTIONS /jobs/123' },
  ])('should create a span for $method requests with 400 response', async ({ method, path, expectedName }) => {
    expect.assertions(2);

    mockPool.intercept({ path, method }).reply(400, 'Bad Request');

    await tracer.startActiveSpan('Test Span', async (span) => {
      const shouldIncludeBody = !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method);
      // @ts-expect-error we loop over all the methods, but typescript doesnt understand the keys
      await apiClient[method](path, shouldIncludeBody ? { body: {} } : undefined);
      span.end();
    });

    const spans = memoryExporter.getFinishedSpans();
    expect(spans[0]).toHaveProperty('name', expectedName);
    expect(spans[0]).toHaveProperty('status.code', api.SpanStatusCode.ERROR);
  });

  it('should set the span status to ERROR on 4xx response', async () => {
    expect.assertions(1);
    mockPool.intercept({ path: '/v1/jobs', method: 'GET' }).reply(400, 'BadRequest');
    await tracer.startActiveSpan('Test Span', async (span) => {
      try {
        await apiClient.GET('/v1/jobs');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err) {
        // Catch the error to prevent it from failing the test
      }
      span.end();
    });

    const spans = memoryExporter.getFinishedSpans();
    expect(spans[0]).toHaveProperty('status', {
      code: api.SpanStatusCode.ERROR,
    });
  });

  it('should set the span status to ERROR on 5xx response', async () => {
    expect.assertions(1);
    mockPool.intercept({ path: '/v1/jobs', method: 'GET' }).reply(500, 'Internal Server Error');
    await tracer.startActiveSpan('Test Span', async (span) => {
      try {
        await apiClient.GET('/v1/jobs');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err) {
        // Catch the error to prevent it from failing the test
      }
      span.end();
    });

    const spans = memoryExporter.getFinishedSpans();
    expect(spans[0]).toHaveProperty('status', {
      code: api.SpanStatusCode.ERROR,
    });
  });
});
