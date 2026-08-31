import { describe, it, expect, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { propagation } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { MockAgent, MockPool } from 'undici';
import { Registry } from 'prom-client';
import { createApiClient } from '../../src/api/index';
import { Producer } from '../../src/clients/producer';
import { NoopLogger } from '../../src/telemetry/noopLogger';
import { JobId, StageId } from '../../src/types/brands';
import { ProducerError, API_ERROR_CODES } from '../../src/errors';
import { Metrics } from '../../src/telemetry/metrics';

propagation.setGlobalPropagator(new W3CTraceContextPropagator());

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
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Agent: vi.fn().mockImplementation(function () {
      // We'll set this in the test
      return global.mockAgentForTest;
    }),
  };
});

describe('Producer', () => {
  let mockAgent: MockAgent;
  let mockPool: MockPool;
  let apiClient: ReturnType<typeof createApiClient>;
  let producer: Producer;
  let logger: NoopLogger;
  const metrics = new Metrics(new Registry());

  const baseUrl = 'http://localhost:8080';

  // Test types for testing generic type functionality
  interface TestJobTypes {
    'image-processing': {
      userMetadata: { userId: string; priority: number };
      data: { imageUrl: string; format: string };
    };
    'data-export': {
      userMetadata: { department: string };
      data: { query: string; format: 'csv' | 'json' };
    };
  }

  interface TestStageTypes {
    'image-resize': {
      userMetadata: { quality: number };
      data: { width: number; height: number };
      task: {
        userMetadata: { batchId: string };
        data: { sourceUrl: string; targetUrl: string };
      };
    };
    'data-transform': {
      userMetadata: { transformerId: string };
      data: { inputFormat: string; outputFormat: string };
      task: {
        userMetadata: { rowId: string };
        data: { inputData: Record<string, unknown>; transformRules: string[] };
      };
    };
  }

  beforeAll(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    global.mockAgentForTest = mockAgent;
    mockPool = mockAgent.get(baseUrl);

    apiClient = createApiClient(baseUrl, {
      retry: { maxRetries: 0 },
      agentOptions: { keepAliveTimeout: 1 },
    });

    logger = new NoopLogger();
    producer = new Producer(apiClient, logger, metrics);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await mockAgent.close();
    // @ts-expect-error its a global variable
    delete global.mockAgentForTest;
  });

  describe('createJob', () => {
    describe('successful job creation', () => {
      it('should create a job with minimal required data', async () => {
        const jobData = {
          name: 'test-job',
          userMetadata: { userId: '123' },
          data: { payload: 'test' },
        };

        const mockResponse = {
          id: 'job-123',
          name: 'test-job',
          userMetadata: { userId: '123' },
          data: { payload: 'test' },
          priority: 'MEDIUM',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockPool.intercept({ path: '/v1/jobs', method: 'POST' }).reply(201, JSON.stringify(mockResponse), {
          headers: { 'content-type': 'application/json' },
        });

        const result = await producer.createJob(jobData);

        expect(result).toEqual(mockResponse);
        expect(result.id).toBe('job-123');
        expect(result.name).toBe('test-job');
        expect(result.priority).toBe('MEDIUM');
      });

      it('should create a job with custom priority', async () => {
        const jobData = {
          name: 'urgent-job',
          userMetadata: { userId: '456' },
          data: { payload: 'urgent' },
          priority: 'HIGH' as const,
        };

        const mockResponse = {
          id: 'job-456',
          name: 'urgent-job',
          userMetadata: { userId: '456' },
          data: { payload: 'urgent' },
          priority: 'HIGH',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        mockPool.intercept({ path: '/v1/jobs', method: 'POST' }).reply(201, JSON.stringify(mockResponse), {
          headers: { 'content-type': 'application/json' },
        });

        const result = await producer.createJob(jobData);

        expect(result.priority).toBe('HIGH');
      });
    });

    describe('error handling', () => {
      it('should throw ProducerError when API returns 400', async () => {
        const jobData = {
          name: 'invalid-job',
          userMetadata: {},
          data: {},
        };

        const errorResponse = {
          message: 'Missing required fields',
          code: 'VALIDATION_ERROR',
        };

        mockPool.intercept({ path: '/v1/jobs', method: 'POST' }).reply(400, JSON.stringify(errorResponse), {
          headers: { 'content-type': 'application/json' },
        });

        const response = producer.createJob(jobData);

        await expect(response).rejects.toThrow(ProducerError);
        await expect(response).rejects.toThrow('Failed to create job invalid-job');
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.VALIDATION_ERROR);
      });

      it('should throw ProducerError when API returns 500', async () => {
        const jobData = {
          name: 'failing-job',
          userMetadata: {},
          data: {},
        };

        const errorResponse = {
          message: 'Internal server error occurred',
          code: 'UNKNOWN_ERROR',
        };

        mockPool.intercept({ path: '/v1/jobs', method: 'POST' }).reply(500, JSON.stringify(errorResponse), {
          headers: { 'content-type': 'application/json' },
        });

        const response = producer.createJob(jobData);

        await expect(response).rejects.toThrow(ProducerError);
        await expect(response).rejects.toThrow('Failed to create job failing-job');
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.UNKNOWN_ERROR);
      });
    });
  });

  describe('createStage', () => {
    const jobId = 'job-123' as JobId;

    describe('successful stage creation', () => {
      it('should create a stage successfully', async () => {
        const stageData = {
          type: 'processing',
          userMetadata: { stage: 'initial' },
          data: { config: 'test' },
        };

        // Mock GET /jobs/{jobId} for context extraction
        const mockJobResponse = {
          id: jobId,
          name: 'test-job',
          userMetadata: {},
          data: {},
          priority: 'MEDIUM',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          tracestate: 'vendor=test',
        };

        mockPool.intercept({ path: `/v1/jobs/${jobId}`, method: 'GET' }).reply(200, JSON.stringify(mockJobResponse), {
          headers: { 'content-type': 'application/json' },
        });

        // Mock POST /jobs/{jobId}/stage
        const mockStageResponse = {
          id: 'stage-456',
          jobId,
          type: 'processing',
          userMetadata: { stage: 'initial' },
          data: { config: 'test' },
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          tracestate: 'vendor=test',
        };

        mockPool.intercept({ path: `/v1/jobs/${jobId}/stage`, method: 'POST' }).reply(201, JSON.stringify(mockStageResponse), {
          headers: { 'content-type': 'application/json' },
        });

        const result = await producer.createStage(jobId, stageData);

        expect(result).toEqual(mockStageResponse);
        expect(result.id).toBe('stage-456');
        expect(result.type).toBe('processing');
        expect(result.jobId).toBe(jobId);
      });
    });

    describe('error handling', () => {
      it('should throw ProducerError when job retrieval fails', async () => {
        const stageData = {
          type: 'processing',
          userMetadata: {},
          data: {},
        };

        mockPool.intercept({ path: `/v1/jobs/${jobId}`, method: 'GET' }).reply(
          404,
          JSON.stringify({
            message: 'Job does not exist',
            code: 'JOB_NOT_FOUND',
          }),
          {
            headers: { 'content-type': 'application/json' },
          }
        );

        const response = producer.createStage(jobId, stageData);

        await expect(response).rejects.toThrow(ProducerError);
        await expect(response).rejects.toThrow(`Failed to retrieve job ${jobId}`);
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.JOB_NOT_FOUND);
      });

      it('should throw ProducerError when stage creation fails', async () => {
        const stageData = {
          type: 'processing',
          userMetadata: {},
          data: {},
        };

        // Mock successful job retrieval
        const mockJobResponse = {
          id: jobId,
          name: 'test-job',
          userMetadata: {},
          data: {},
          priority: 'MEDIUM',
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          // Add minimal trace context to pass extraction
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          tracestate: 'vendor=test',
        };

        mockPool.intercept({ path: `/v1/jobs/${jobId}`, method: 'GET' }).reply(200, JSON.stringify(mockJobResponse), {
          headers: { 'content-type': 'application/json' },
        });

        // Mock failed stage creation
        mockPool.intercept({ path: `/v1/jobs/${jobId}/stage`, method: 'POST' }).reply(
          400,
          JSON.stringify({
            message: 'Stage type not supported',
            code: 'VALIDATION_ERROR',
          }),
          {
            headers: { 'content-type': 'application/json' },
          }
        );

        const response = producer.createStage(jobId, stageData);

        await expect(response).rejects.toThrow(ProducerError);
        await expect(response).rejects.toThrow(`Failed to create stage for job ${jobId}`);
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.VALIDATION_ERROR);
      });
    });
  });

  describe('createTasks', () => {
    const stageId = 'stage-123' as StageId;
    const stageType = 'processing';

    describe('successful task creation', () => {
      it('should create tasks successfully', async () => {
        const taskData = [
          {
            userMetadata: { taskId: 'task-1' },
            data: { input: 'data1' },
          },
          {
            userMetadata: { taskId: 'task-2' },
            data: { input: 'data2' },
          },
        ];

        // Mock GET /v1/stages/{stageId}
        const mockStageResponse = {
          id: stageId,
          jobId: 'job-123' as JobId,
          type: stageType,
          userMetadata: {},
          data: {},
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          // Add minimal trace context
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          tracestate: 'vendor=test',
        };

        mockPool.intercept({ path: `/v1/stages/${stageId}`, method: 'GET' }).reply(200, JSON.stringify(mockStageResponse), {
          headers: { 'content-type': 'application/json' },
        });

        // Mock POST /v1/stages/{stageId}/tasks
        const mockTasksResponse = [
          {
            id: 'task-id-1',
            stageId,
            userMetadata: { taskId: 'task-1' },
            data: { input: 'data1' },
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'task-id-2',
            stageId,
            userMetadata: { taskId: 'task-2' },
            data: { input: 'data2' },
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];

        mockPool.intercept({ path: `/v1/stages/${stageId}/tasks`, method: 'POST' }).reply(201, JSON.stringify(mockTasksResponse), {
          headers: { 'content-type': 'application/json' },
        });

        const result = await producer.createTasks(stageId, stageType, taskData);

        expect(result).toEqual(mockTasksResponse);
        expect(result).toHaveLength(2);
        expect(result[0]!.id).toBe('task-id-1');
        expect(result[1]!.id).toBe('task-id-2');
      });

      it('should create typed tasks with custom generics', async () => {
        const typedProducer = new Producer<TestJobTypes, TestStageTypes>(apiClient, logger, metrics);

        const taskData = [
          {
            userMetadata: { batchId: 'batch-1' },
            data: { sourceUrl: 'https://example.com/image1.jpg', targetUrl: 'https://example.com/resized1.jpg' },
          },
        ];

        // Mock GET /stages/{stageId}
        const mockStageResponse = {
          id: stageId,
          jobId: 'job-123' as JobId,
          type: 'image-resize',
          userMetadata: {},
          data: {},
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          tracestate: 'vendor=test',
        };

        mockPool.intercept({ path: `/v1/stages/${stageId}`, method: 'GET' }).reply(200, JSON.stringify(mockStageResponse), {
          headers: { 'content-type': 'application/json' },
        });

        // Mock POST /v1/stages/{stageId}/tasks
        const mockTasksResponse = [
          {
            id: 'task-img-1',
            stageId,
            userMetadata: { batchId: 'batch-1' },
            data: { sourceUrl: 'https://example.com/image1.jpg', targetUrl: 'https://example.com/resized1.jpg' },
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];

        mockPool.intercept({ path: `/v1/stages/${stageId}/tasks`, method: 'POST' }).reply(201, JSON.stringify(mockTasksResponse), {
          headers: { 'content-type': 'application/json' },
        });

        const result = await typedProducer.createTasks(stageId, 'image-resize', taskData);

        expect(result).toEqual(mockTasksResponse);
        expect(result[0]!.data.sourceUrl).toBe('https://example.com/image1.jpg');
      });
    });

    describe('error handling', () => {
      it('should throw ProducerError for empty task data', async () => {
        const emptyTaskData: never[] = [];

        const response = producer.createTasks(stageId, stageType, emptyTaskData);

        await expect(response).rejects.toThrow(ProducerError);
        await expect(response).rejects.toThrow('Task data cannot be empty');
      });

      it('should throw ProducerError when stage retrieval fails', async () => {
        const taskData = [
          {
            userMetadata: { taskId: 'task-1' },
            data: { input: 'data1' },
          },
        ];

        mockPool.intercept({ path: `/v1/stages/${stageId}`, method: 'GET' }).reply(
          404,
          JSON.stringify({
            message: 'Stage does not exist',
            code: 'STAGE_NOT_FOUND',
          }),
          {
            headers: { 'content-type': 'application/json' },
          }
        );

        const response = producer.createTasks(stageId, stageType, taskData);

        await expect(response).rejects.toThrow(ProducerError);
        await expect(response).rejects.toThrow(`Failed to retrieve stage ${stageId}`);
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.STAGE_NOT_FOUND);
      });

      it('should throw ProducerError for stage type mismatch', async () => {
        const taskData = [
          {
            userMetadata: { taskId: 'task-1' },
            data: { input: 'data1' },
          },
        ];

        // Mock GET /v1/stages/{stageId} with different stage type
        const mockStageResponse = {
          id: stageId,
          jobId: 'job-123' as JobId,
          type: 'different-type', // Different from expected 'processing'
          userMetadata: {},
          data: {},
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        };

        mockPool.intercept({ path: `/v1/stages/${stageId}`, method: 'GET' }).reply(200, JSON.stringify(mockStageResponse), {
          headers: { 'content-type': 'application/json' },
        });

        const response = producer.createTasks(stageId, stageType, taskData);

        await expect(response).rejects.toThrow(ProducerError);
        await expect(response).rejects.toThrow(
          "Stage type mismatch for stage stage-123: server reports 'different-type', but client specified 'processing'"
        );
      });

      it('should throw ProducerError when task creation fails', async () => {
        const taskData = [
          {
            userMetadata: { taskId: 'task-1' },
            data: { input: 'data1' },
          },
        ];

        // Mock successful stage retrieval
        const mockStageResponse = {
          id: stageId,
          jobId: 'job-123' as JobId,
          type: stageType,
          userMetadata: {},
          data: {},
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        };

        mockPool.intercept({ path: `/v1/stages/${stageId}`, method: 'GET' }).reply(200, JSON.stringify(mockStageResponse), {
          headers: { 'content-type': 'application/json' },
        });

        // Mock failed task creation
        mockPool.intercept({ path: `/v1/stages/${stageId}/tasks`, method: 'POST' }).reply(
          400,
          JSON.stringify({
            message: 'Task validation failed',
            code: 'VALIDATION_ERROR',
          }),
          {
            headers: { 'content-type': 'application/json' },
          }
        );

        const response = producer.createTasks(stageId, stageType, taskData);

        await expect(response).rejects.toThrow(ProducerError);
        await expect(response).rejects.toThrow(`Failed to create task for stage ${stageId}`);
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.VALIDATION_ERROR);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle a complete workflow: job -> stage -> tasks', async () => {
      const typedProducer = new Producer<TestJobTypes, TestStageTypes>(apiClient, logger, metrics);

      // Step 1: Create Job
      const jobData = {
        name: 'image-processing' as const,
        userMetadata: { userId: 'user-123', priority: 1 },
        data: { imageUrl: 'https://example.com/image.jpg', format: 'png' },
      };

      const mockJobResponse = {
        id: 'job-workflow-123',
        name: 'image-processing',
        userMetadata: { userId: 'user-123', priority: 1 },
        data: { imageUrl: 'https://example.com/image.jpg', format: 'png' },
        priority: 'MEDIUM',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockPool.intercept({ path: '/v1/jobs', method: 'POST' }).reply(201, JSON.stringify(mockJobResponse), {
        headers: { 'content-type': 'application/json' },
      });

      const job = await typedProducer.createJob(jobData);
      const jobId = job.id;

      // Step 2: Create Stage
      const stageData = {
        type: 'image-resize' as const,
        userMetadata: { quality: 95 },
        data: { width: 800, height: 600 },
      };

      // Mock job retrieval for stage creation
      const mockJobForStage = {
        ...mockJobResponse,
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      };

      mockPool.intercept({ path: `/v1/jobs/${jobId}`, method: 'GET' }).reply(200, JSON.stringify(mockJobForStage), {
        headers: { 'content-type': 'application/json' },
      });

      const mockStageResponse = {
        id: 'stage-workflow-456',
        jobId,
        type: 'image-resize',
        userMetadata: { quality: 95 },
        data: { width: 800, height: 600 },
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockPool.intercept({ path: `/v1/jobs/${jobId}/stage`, method: 'POST' }).reply(201, JSON.stringify(mockStageResponse), {
        headers: { 'content-type': 'application/json' },
      });

      const stage = await typedProducer.createStage(jobId, stageData);
      const stageId = stage.id;

      // Step 3: Create Tasks
      const taskData = [
        {
          userMetadata: { batchId: 'batch-1' },
          data: { sourceUrl: 'https://example.com/image1.jpg', targetUrl: 'https://example.com/resized1.jpg' },
        },
        {
          userMetadata: { batchId: 'batch-1' },
          data: { sourceUrl: 'https://example.com/image2.jpg', targetUrl: 'https://example.com/resized2.jpg' },
        },
      ];

      // Mock stage retrieval for task creation
      const mockStageForTasks = {
        ...mockStageResponse,
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      };

      mockPool.intercept({ path: `/v1/stages/${stageId}`, method: 'GET' }).reply(200, JSON.stringify(mockStageForTasks), {
        headers: { 'content-type': 'application/json' },
      });

      const mockTasksResponse = [
        {
          id: 'task-workflow-1',
          stageId,
          userMetadata: { batchId: 'batch-1' },
          data: { sourceUrl: 'https://example.com/image1.jpg', targetUrl: 'https://example.com/resized1.jpg' },
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'task-workflow-2',
          stageId,
          userMetadata: { batchId: 'batch-1' },
          data: { sourceUrl: 'https://example.com/image2.jpg', targetUrl: 'https://example.com/resized2.jpg' },
          status: 'PENDING',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      mockPool.intercept({ path: `/v1/stages/${stageId}/tasks`, method: 'POST' }).reply(201, JSON.stringify(mockTasksResponse), {
        headers: { 'content-type': 'application/json' },
      });

      const tasks = await typedProducer.createTasks(stageId, 'image-resize', taskData);

      // Verify the complete workflow
      expect(job.name).toBe('image-processing');
      expect(stage.type).toBe('image-resize');
      expect(stage.jobId).toBe(jobId);
      expect(tasks).toHaveLength(2);
      expect(tasks[0]!.stageId).toBe(stageId);
      expect(tasks[1]!.stageId).toBe(stageId);
    });
  });
});
