import { describe, it, expect, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { propagation } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { MockAgent, type MockPool } from 'undici';
import { Registry } from 'prom-client';
import { createApiClient } from '../../src/api/index';
import { Consumer } from '../../src/clients/consumer';
import { NoopLogger } from '../../src/telemetry/noopLogger';
import type { StageId, TaskId } from '../../src/types/brands';
import { ConsumerError, API_ERROR_CODES } from '../../src/errors';
import type { Task } from '../../src/types/task';
import { Metrics } from '../../src/telemetry/metrics';

propagation.setGlobalPropagator(new W3CTraceContextPropagator());

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

function createMockTaskResponse(override: Partial<Task> = {}): Task {
  const defaultTask: Task = {
    id: 'task-123' as TaskId,
    stageId: 'stage-456' as StageId,
    userMetadata: { batchId: 'batch-1' },
    data: { sourceUrl: 'https://example.com/image.jpg', targetUrl: 'https://example.com/resized.jpg' },
    status: 'IN_PROGRESS',
    attempts: 1,
    maxAttempts: 5,
    creationTime: new Date().toISOString(),
    updateTime: new Date().toISOString(),
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    tracestate: 'vendor=test',
  };

  return {
    ...defaultTask,
    ...override,
    // Ensure userMetadata is always defined unless explicitly overridden with undefined
    userMetadata: override.userMetadata !== undefined ? override.userMetadata : defaultTask.userMetadata,
  };
}

describe('Consumer', () => {
  let mockAgent: MockAgent;
  let mockPool: MockPool;
  let apiClient: ReturnType<typeof createApiClient>;
  let consumer: Consumer;
  let logger: NoopLogger;
  const metrics = new Metrics(new Registry());

  const baseUrl = 'http://localhost:8080';

  // Test types for testing generic type functionality
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
    consumer = new Consumer(apiClient, logger, metrics);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await mockAgent.close();
    // @ts-expect-error its a global variable
    delete global.mockAgentForTest;
  });

  describe('dequeueTask', () => {
    const stageType = 'image-resize';

    describe('successful task dequeue', () => {
      it('should dequeue a task successfully', async () => {
        const mockTaskResponse = createMockTaskResponse();

        mockPool
          .intercept({
            path: `/v1/stages/${stageType}/tasks/dequeue`,
            method: 'PATCH',
          })
          .reply(200, JSON.stringify(mockTaskResponse), {
            headers: { 'content-type': 'application/json' },
          });

        const result = await consumer.dequeueTask(stageType);

        expect(result).toEqual(mockTaskResponse);
      });

      it('should return null when no tasks are available', async () => {
        mockPool
          .intercept({
            path: `/v1/stages/${stageType}/tasks/dequeue`,
            method: 'PATCH',
          })
          .reply(
            404,
            JSON.stringify({
              message: 'No tasks available',
              code: 'TASK_NOT_FOUND',
            }),
            {
              headers: { 'content-type': 'application/json' },
            }
          );

        const result = await consumer.dequeueTask(stageType);

        expect(result).toBeNull();
      });

      it('should dequeue typed tasks with custom generics', async () => {
        const typedConsumer = new Consumer<TestStageTypes>(apiClient, logger, metrics);

        const mockTaskResponse = createMockTaskResponse({
          id: 'task-typed-123' as TaskId,
        });

        mockPool
          .intercept({
            path: `/v1/stages/image-resize/tasks/dequeue`,
            method: 'PATCH',
          })
          .reply(200, JSON.stringify(mockTaskResponse), {
            headers: { 'content-type': 'application/json' },
          });

        const result = await typedConsumer.dequeueTask('image-resize');

        expect(result).toEqual(mockTaskResponse);
      });
    });

    describe('error handling', () => {
      it('should throw ConsumerError when API returns 500', async () => {
        const errorResponse = {
          message: 'Internal server error occurred',
          code: 'UNKNOWN_ERROR',
        };

        mockPool
          .intercept({
            path: `/v1/stages/${stageType}/tasks/dequeue`,
            method: 'PATCH',
          })
          .reply(500, JSON.stringify(errorResponse), {
            headers: { 'content-type': 'application/json' },
          });

        const response = consumer.dequeueTask(stageType);

        await expect(response).rejects.toThrow(ConsumerError);
        await expect(response).rejects.toThrow(`Failed to dequeue task for stage type ${stageType}`);
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.UNKNOWN_ERROR);
      });

      it('should throw ConsumerError when API returns 400', async () => {
        const errorResponse = {
          message: 'Invalid stage type',
          code: 'VALIDATION_ERROR',
        };

        mockPool
          .intercept({
            path: `/v1/stages/${stageType}/tasks/dequeue`,
            method: 'PATCH',
          })
          .reply(400, JSON.stringify(errorResponse), {
            headers: { 'content-type': 'application/json' },
          });

        const response = consumer.dequeueTask(stageType);

        await expect(response).rejects.toThrow(ConsumerError);
        await expect(response).rejects.toThrow(`Failed to dequeue task for stage type ${stageType}`);
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.VALIDATION_ERROR);
      });
    });
  });

  describe('markTaskCompleted', () => {
    const taskId = 'task-123' as TaskId;

    describe('successful task completion', () => {
      it('should mark a task as completed successfully', async () => {
        // Mock GET /tasks/{taskId} for task retrieval
        const mockTaskResponse = createMockTaskResponse({
          id: taskId,
        });

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}`,
            method: 'GET',
          })
          .reply(200, JSON.stringify(mockTaskResponse), {
            headers: { 'content-type': 'application/json' },
          });

        // Mock PUT /tasks/{taskId}/status for status update
        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}/status`,
            method: 'PUT',
          })
          .reply(200, JSON.stringify({}), {
            headers: { 'content-type': 'application/json' },
          });

        await expect(consumer.markTaskCompleted(taskId)).resolves.toBeUndefined();
      });
    });

    describe('error handling', () => {
      it('should throw ConsumerError when task retrieval fails', async () => {
        const errorResponse = {
          message: 'Task does not exist',
          code: 'TASK_NOT_FOUND',
        };

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}`,
            method: 'GET',
          })
          .reply(404, JSON.stringify(errorResponse), {
            headers: { 'content-type': 'application/json' },
          });

        const response = consumer.markTaskCompleted(taskId);

        await expect(response).rejects.toThrow(ConsumerError);
        await expect(response).rejects.toThrow(`Failed to retrieve task ${taskId} for status update`);
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.TASK_NOT_FOUND);
      });

      it('should throw ConsumerError when task is not in IN_PROGRESS state', async () => {
        // Mock GET /tasks/{taskId} with wrong status
        const mockTaskResponse = createMockTaskResponse({
          id: taskId,
          status: 'COMPLETED', // Wrong status for completion
        });

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}`,
            method: 'GET',
          })
          .reply(200, JSON.stringify(mockTaskResponse), {
            headers: { 'content-type': 'application/json' },
          });

        const response = consumer.markTaskCompleted(taskId);

        await expect(response).rejects.toThrow(ConsumerError);
        await expect(response).rejects.toThrow(`Cannot mark task ${taskId} as COMPLETED: task is in COMPLETED state, expected IN_PROGRESS state`);
      });

      it('should throw ConsumerError when status update fails', async () => {
        // Mock successful task retrieval
        const mockTaskResponse = {
          id: taskId,
          stageId: 'stage-456',
          userMetadata: { batchId: 'batch-1' },
          data: { sourceUrl: 'https://example.com/image.jpg', targetUrl: 'https://example.com/resized.jpg' },
          status: 'IN_PROGRESS',
          attempts: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          tracestate: 'vendor=test',
        };

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}`,
            method: 'GET',
          })
          .reply(200, JSON.stringify(mockTaskResponse), {
            headers: { 'content-type': 'application/json' },
          });

        // Mock failed status update
        const errorResponse = {
          message: 'Task update failed',
          code: 'VALIDATION_ERROR',
        };

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}/status`,
            method: 'PUT',
          })
          .reply(400, JSON.stringify(errorResponse), {
            headers: { 'content-type': 'application/json' },
          });

        const response = consumer.markTaskCompleted(taskId);

        await expect(response).rejects.toThrow(ConsumerError);
        await expect(response).rejects.toThrow(`Failed to mark task ${taskId} as COMPLETED`);
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.VALIDATION_ERROR);
      });

      it('should throw ConsumerError when server rejects status update with ILLEGAL_TASK_STATUS_TRANSITION', async () => {
        // Mock successful task retrieval
        const mockTaskResponse = createMockTaskResponse({
          id: taskId,
        });

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}`,
            method: 'GET',
          })
          .reply(200, JSON.stringify(mockTaskResponse), {
            headers: { 'content-type': 'application/json' },
          });

        // Mock server rejection of status update
        const errorResponse = {
          message: 'Illegal task status transition attempted',
          code: 'ILLEGAL_TASK_STATUS_TRANSITION',
        };

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}/status`,
            method: 'PUT',
          })
          .reply(400, JSON.stringify(errorResponse), {
            headers: { 'content-type': 'application/json' },
          });

        const response = consumer.markTaskCompleted(taskId);

        await expect(response).rejects.toThrow(ConsumerError);
        await expect(response).rejects.toThrow(`Failed to mark task ${taskId} as COMPLETED`);
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.ILLEGAL_TASK_STATUS_TRANSITION);
      });
    });
  });

  describe('markTaskFailed', () => {
    const taskId = 'task-failed-123' as TaskId;

    describe('successful task failure marking', () => {
      it('should mark a task as failed successfully', async () => {
        // Mock GET /tasks/{taskId} for task retrieval
        const mockTaskResponse = createMockTaskResponse({
          id: taskId,
          attempts: 2,
        });

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}`,
            method: 'GET',
          })
          .reply(200, JSON.stringify(mockTaskResponse), {
            headers: { 'content-type': 'application/json' },
          });

        // Mock PUT /tasks/{taskId}/status for status update
        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}/status`,
            method: 'PUT',
          })
          .reply(200, JSON.stringify({}), {
            headers: { 'content-type': 'application/json' },
          });

        await expect(consumer.markTaskFailed(taskId)).resolves.toBeUndefined();
      });
    });

    describe('error handling', () => {
      it('should throw ConsumerError when task retrieval fails', async () => {
        const errorResponse = {
          message: 'Task does not exist',
          code: 'TASK_NOT_FOUND',
        };

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}`,
            method: 'GET',
          })
          .reply(404, JSON.stringify(errorResponse), {
            headers: { 'content-type': 'application/json' },
          });

        const response = consumer.markTaskFailed(taskId);

        await expect(response).rejects.toThrow(ConsumerError);
        await expect(response).rejects.toThrow(`Failed to retrieve task ${taskId} for status update`);
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.TASK_NOT_FOUND);
      });

      it('should throw ConsumerError when task is not in IN_PROGRESS state', async () => {
        // Mock GET /tasks/{taskId} with wrong status
        const mockTaskResponse = createMockTaskResponse({
          id: taskId,
          status: 'FAILED', // Wrong status for failure marking
        });

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}`,
            method: 'GET',
          })
          .reply(200, JSON.stringify(mockTaskResponse), {
            headers: { 'content-type': 'application/json' },
          });

        const response = consumer.markTaskFailed(taskId);

        await expect(response).rejects.toThrow(ConsumerError);
        await expect(response).rejects.toThrow(`Cannot mark task ${taskId} as FAILED: task is in FAILED state, expected IN_PROGRESS state`);
      });

      it('should throw ConsumerError when status update fails', async () => {
        // Mock successful task retrieval
        const mockTaskResponse = {
          id: taskId,
          stageId: 'stage-456',
          userMetadata: { batchId: 'batch-1' },
          data: { sourceUrl: 'https://example.com/image.jpg', targetUrl: 'https://example.com/resized.jpg' },
          status: 'IN_PROGRESS',
          attempts: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          tracestate: 'vendor=test',
        };

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}`,
            method: 'GET',
          })
          .reply(200, JSON.stringify(mockTaskResponse), {
            headers: { 'content-type': 'application/json' },
          });

        // Mock failed status update
        const errorResponse = {
          message: 'Task update failed',
          code: 'VALIDATION_ERROR',
        };

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}/status`,
            method: 'PUT',
          })
          .reply(500, JSON.stringify(errorResponse), {
            headers: { 'content-type': 'application/json' },
          });

        const response = consumer.markTaskFailed(taskId);

        await expect(response).rejects.toThrow(ConsumerError);
        await expect(response).rejects.toThrow(`Failed to mark task ${taskId} as FAILED`);
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.VALIDATION_ERROR);
      });

      it('should throw ConsumerError when server rejects status update with ILLEGAL_TASK_STATUS_TRANSITION', async () => {
        // Mock successful task retrieval
        const mockTaskResponse = createMockTaskResponse({
          id: taskId,
        });

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}`,
            method: 'GET',
          })
          .reply(200, JSON.stringify(mockTaskResponse), {
            headers: { 'content-type': 'application/json' },
          });

        // Mock server rejection of status update
        const errorResponse = {
          message: 'Illegal task status transition attempted',
          code: 'ILLEGAL_TASK_STATUS_TRANSITION',
        };

        mockPool
          .intercept({
            path: `/v1/tasks/${taskId}/status`,
            method: 'PUT',
          })
          .reply(400, JSON.stringify(errorResponse), {
            headers: { 'content-type': 'application/json' },
          });

        const response = consumer.markTaskFailed(taskId);

        await expect(response).rejects.toThrow(ConsumerError);
        await expect(response).rejects.toThrow(`Failed to mark task ${taskId} as FAILED`);
        await expect(response).rejects.toHaveCauseCode(API_ERROR_CODES.ILLEGAL_TASK_STATUS_TRANSITION);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle a complete task processing workflow: dequeue -> complete', async () => {
      const typedConsumer = new Consumer<TestStageTypes>(apiClient, logger, metrics);
      const stageType = 'image-resize';

      // Step 1: Dequeue Task
      const mockTaskResponse = createMockTaskResponse({
        id: 'task-workflow-123' as TaskId,
        stageId: 'stage-workflow-456' as StageId,
        userMetadata: { batchId: 'batch-workflow-1' },
        data: {
          sourceUrl: 'https://example.com/workflow-image.jpg',
          targetUrl: 'https://example.com/workflow-resized.jpg',
        },
      });

      mockPool
        .intercept({
          path: `/v1/stages/${stageType}/tasks/dequeue`,
          method: 'PATCH',
        })
        .reply(200, JSON.stringify(mockTaskResponse), {
          headers: { 'content-type': 'application/json' },
        });

      const task = await typedConsumer.dequeueTask(stageType);
      expect(task).toEqual(mockTaskResponse);
      expect(task).toHaveProperty('status', 'IN_PROGRESS');

      // Step 2: Mark Task as Completed
      const taskId = task!.id as TaskId;

      // Mock GET /tasks/{taskId} for task retrieval in completion
      mockPool
        .intercept({
          path: `/v1/tasks/${taskId}`,
          method: 'GET',
        })
        .reply(200, JSON.stringify(mockTaskResponse), {
          headers: { 'content-type': 'application/json' },
        });

      // Mock PUT /tasks/{taskId}/status for completion
      mockPool
        .intercept({
          path: `/v1/tasks/${taskId}/status`,
          method: 'PUT',
        })
        .reply(200, JSON.stringify({}), {
          headers: { 'content-type': 'application/json' },
        });

      await expect(typedConsumer.markTaskCompleted(taskId)).resolves.toBeUndefined();

      // Verify the workflow data integrity
      expect(task).toMatchObject({
        data: {
          sourceUrl: 'https://example.com/workflow-image.jpg',
          targetUrl: 'https://example.com/workflow-resized.jpg',
        },
        userMetadata: {
          batchId: 'batch-workflow-1',
        },
      });
    });

    it('should handle a complete task processing workflow: dequeue -> fail', async () => {
      const typedConsumer = new Consumer<TestStageTypes>(apiClient, logger, metrics);
      const stageType = 'data-transform';

      // Step 1: Dequeue Task
      const mockTaskResponse = createMockTaskResponse({
        id: 'task-fail-workflow-123' as TaskId,
        stageId: 'stage-fail-workflow-456' as StageId,
        userMetadata: { rowId: 'row-123' },
        data: {
          inputData: { name: 'John', age: 30 },
          transformRules: ['normalize', 'validate'],
        },
        attempts: 2,
      });

      mockPool
        .intercept({
          path: `/v1/stages/${stageType}/tasks/dequeue`,
          method: 'PATCH',
        })
        .reply(200, JSON.stringify(mockTaskResponse), {
          headers: { 'content-type': 'application/json' },
        });

      const task = await typedConsumer.dequeueTask(stageType);
      expect(task).toEqual(mockTaskResponse);

      // Step 2: Mark Task as Failed (simulating processing failure)
      const taskId = task!.id as TaskId;

      // Mock GET /tasks/{taskId} for task retrieval in failure marking
      mockPool
        .intercept({
          path: `/v1/tasks/${taskId}`,
          method: 'GET',
        })
        .reply(200, JSON.stringify(mockTaskResponse), {
          headers: { 'content-type': 'application/json' },
        });

      // Mock PUT /tasks/{taskId}/status for failure marking
      mockPool
        .intercept({
          path: `/v1/tasks/${taskId}/status`,
          method: 'PUT',
        })
        .reply(200, JSON.stringify({}), {
          headers: { 'content-type': 'application/json' },
        });

      await expect(typedConsumer.markTaskFailed(taskId)).resolves.toBeUndefined();

      // Verify the workflow data integrity
      expect(task).toMatchObject({
        data: {
          inputData: { name: 'John', age: 30 },
          transformRules: ['normalize', 'validate'],
        },
        userMetadata: {
          rowId: 'row-123',
        },
      });
    });

    it('should handle no tasks available gracefully in workflow', async () => {
      const stageType = 'image-resize';

      // Mock empty queue
      mockPool
        .intercept({
          path: `/v1/stages/${stageType}/tasks/dequeue`,
          method: 'PATCH',
        })
        .reply(
          404,
          JSON.stringify({
            message: 'No tasks available',
            code: 'TASK_NOT_FOUND',
          }),
          {
            headers: { 'content-type': 'application/json' },
          }
        );

      const task = await consumer.dequeueTask(stageType);
      expect(task).toBeNull();
    });

    it('should handle typed consumer with type safety', async () => {
      const typedConsumer = new Consumer<TestStageTypes>(apiClient, logger, metrics);

      const mockImageTask = createMockTaskResponse({
        id: 'task-typed-image' as TaskId,
        stageId: 'stage-typed' as StageId,
        userMetadata: { batchId: 'batch-typed' },
        data: { sourceUrl: 'https://example.com/typed.jpg', targetUrl: 'https://example.com/typed-resized.jpg' },
      });

      mockPool
        .intercept({
          path: '/v1/stages/image-resize/tasks/dequeue',
          method: 'PATCH',
        })
        .reply(200, JSON.stringify(mockImageTask), {
          headers: { 'content-type': 'application/json' },
        });

      const result = await typedConsumer.dequeueTask('image-resize');

      expect(result).toMatchObject({
        data: {
          sourceUrl: 'https://example.com/typed.jpg',
          targetUrl: 'https://example.com/typed-resized.jpg',
        },
        userMetadata: {
          batchId: 'batch-typed',
        },
      });
    });
  });
});
