/* eslint-disable @typescript-eslint/naming-convention */
import { describe, beforeEach, afterEach, it, expect, beforeAll, vi } from 'vitest';
import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { StatusCodes } from 'http-status-codes';
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import {
  createRequestSender,
  expectResponseStatusFactory,
  type ExpectResponseStatus,
  type RequestSender,
} from '@map-colonies/openapi-helpers/requestSender';
import { faker } from '@faker-js/faker';
import { openapiFilePath, type paths, type operations } from 'jobnik-openapi';
import { JobOperationStatus, Priority, Prisma, StageOperationStatus, TaskOperationStatus, type PrismaClient } from '@prismaClient';
import type { PrismaTransaction } from '@src/db/types';
import { getApp } from '@src/app';
import { SERVICES } from '@common/constants';
import { initConfig } from '@src/common/config';
import { errorMessages as tasksErrorMessages } from '@src/tasks/models/errors';
import { errorMessages as stagesErrorMessages } from '@src/stages/models/errors';
import type { TaskCreateModel, TaskModel, TasksPaginatedResponse } from '@src/tasks/models/models';
import { defaultStatusCounts } from '@src/stages/models/helper';
import {
  abortedStageXstatePersistentSnapshot,
  completedStageXstatePersistentSnapshot,
  inProgressStageXstatePersistentSnapshot,
  pendingStageXstatePersistentSnapshot,
  retryTaskXstatePersistentSnapshot,
} from '@tests/unit/data';
import { DEFAULT_TRACEPARENT } from '@src/common/utils/tracingHelpers';
import { illegalStatusTransitionErrorMessage } from '@src/common/errors';
import { createProxyMock } from '@tests/configurations/mockPrisma';
import { createJobRequestBody } from '../jobs/helpers';
import { addJobRecord, addStageRecord, createStageBody } from '../stages/helpers';
import { createJobnikTree, createMockPrismaError, createMockUnknownDbError, truncateAllTables } from '../common/utils';
import { createTaskBody, createTaskRecords } from './helpers';

const expectResponseStatus: ExpectResponseStatus = expectResponseStatusFactory(expect);

describe('task', function () {
  let requestSender: RequestSender<paths, operations>;
  let prisma: PrismaClient;

  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  const provider = new NodeTracerProvider({ spanProcessors: [spanProcessor] });
  provider.register();

  beforeAll(async function () {
    await initConfig(true);
  });

  beforeEach(async function () {
    const [app, container] = await getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
      ],
      useChild: true,
    });

    requestSender = await createRequestSender<paths, operations>(openapiFilePath, app);
    prisma = container.resolve<PrismaClient>(SERVICES.PRISMA);
    await truncateAllTables(prisma);

    // Ensure Prisma methods exist before they can be spied on (Vitest 4.0 requirement)
  });

  afterEach(async function () {
    await prisma.$disconnect();
    memoryExporter.reset();
  });

  describe('#getTasks', function () {
    describe('Happy Path', function () {
      it('should return 200 with the matching task', async function () {
        const { stage, tasks } = await createJobnikTree(prisma);

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const response = await requestSender.getTasksByCriteriaV1({ queryParams: { stage_id: stageId } });

        expect(response).toMatchObject({
          status: StatusCodes.OK,
          body: { total: 1, items: [{ id: taskId, stageId }] },
        });
      });

      it('should return 200 with empty array', async function () {
        const someRandomUuid = faker.string.uuid();
        const response = await requestSender.getTasksByCriteriaV1({ queryParams: { stage_id: someRandomUuid } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.OK,
          body: { total: 0, items: [] },
        });
      });

      it('should return 200 with all tasks when no query params defined', async function () {
        await createJobnikTree(prisma, {}, {}, [{}, {}]);

        const response = await requestSender.getTasksByCriteriaV1();

        expectResponseStatus(response, 200);

        expect(response).toSatisfyApiSpec();
        expect(response).toHaveProperty('status', StatusCodes.OK);

        const allTasksBody = response.body;

        expect(allTasksBody.items).toBeArray();
        expect(allTasksBody.items).not.toHaveLength(0);
      });

      it('should return 200 with total and items when paginating', async function () {
        await createJobnikTree(prisma, {}, {}, [{}, {}, {}]);

        const response = await requestSender.getTasksByCriteriaV1({ queryParams: { page: 1, page_size: 2 } });

        expectResponseStatus(response, 200);

        expect(response).toSatisfyApiSpec();

        const pagedTasksBody = response.body;

        expect(pagedTasksBody.total).toBeGreaterThanOrEqual(3);
        expect(pagedTasksBody.items).toHaveLength(2);
      });

      it('should return 200 with empty items array when page is beyond total', async function () {
        await createJobnikTree(prisma, {}, {}, [{}]);

        const response = await requestSender.getTasksByCriteriaV1({ queryParams: { page: 9999, page_size: 10 } });

        expectResponseStatus(response, 200);

        expect(response).toSatisfyApiSpec();

        const beyondPageTasksBody = response.body;

        expect(beyondPageTasksBody.items).toHaveLength(0);
      });
    });

    describe('Bad Path', function () {
      it('should return 400 when stage type exceeds 50 characters', async function () {
        const longStageType = faker.string.alpha(51);
        const response = await requestSender.getTasksByCriteriaV1({ queryParams: { stage_type: longStageType } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: {
            message: expect.stringMatching(/request\/query\/stage_type must NOT have more than 50 characters/) as string,
            code: 'VALIDATION_ERROR',
          },
        });
      });

      it('should return 400 when adding unknown query parameters', async function () {
        const response = await requestSender.getTasksByCriteriaV1({ queryParams: { someExtraParam: 'FOO' } as unknown as Record<string, unknown> });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/Unknown query parameter/) as string, code: 'VALIDATION_ERROR' },
        });
      });

      it('should return 400 when status param is incorrect', async function () {
        const response = await requestSender.getTasksByCriteriaV1({ queryParams: { status: 'BAD_STATUS' as TaskOperationStatus } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: {
            message: expect.stringMatching(/request\/query\/status must be equal to one of the allowed values/) as string,
            code: 'VALIDATION_ERROR',
          },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 when database driver throws an error', async function () {
        const error = createMockPrismaError();
        const findManySpy = createProxyMock(prisma.task, 'findMany');
        findManySpy.mockRejectedValueOnce(error);

        const response = await requestSender.getTasksByCriteriaV1({});

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 when database driver throws unexpected error', async function () {
        const error = createMockUnknownDbError();
        const findManySpy = createProxyMock(prisma.task, 'findMany');
        findManySpy.mockRejectedValueOnce(error);

        const response = await requestSender.getTasksByCriteriaV1({});

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'UNKNOWN_ERROR' },
        });
      });
    });
  });

  describe('#getTaskById', function () {
    describe('Happy Path', function () {
      it('should return 200 with the task', async function () {
        const { tasks } = await createJobnikTree(prisma);
        const taskId = tasks[0]!.id;

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId } });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({ status: StatusCodes.OK, body: { status: TaskOperationStatus.CREATED } });
      });
    });

    describe('Bad Path', function () {
      it('should return 404 when task does not exist', async function () {
        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: faker.string.uuid() } });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: tasksErrorMessages.taskNotFound, code: 'TASK_NOT_FOUND' },
        });
      });

      it('should return 400 when supplying bad uuid', async function () {
        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: 'badUuid' } });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/params\/taskId must match format "uuid"/) as string, code: 'VALIDATION_ERROR' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 when database driver throws an error', async function () {
        const error = createMockPrismaError();
        const findUniqueSpy = createProxyMock(prisma.task, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.getTaskByIdV1({ pathParams: { taskId: faker.string.uuid() } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 when database driver throws unexpected error', async function () {
        const error = createMockUnknownDbError();
        const findUniqueSpy = createProxyMock(prisma.task, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.getTaskByIdV1({ pathParams: { taskId: faker.string.uuid() } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'UNKNOWN_ERROR' },
        });
      });
    });
  });

  describe('#getTaskByStageId', function () {
    describe('Happy Path', function () {
      it('should return 200 with the tasks', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [{}, {}]);
        const stageId = stage.id;

        const getTasksResponse = await requestSender.getTasksByStageIdV1({ pathParams: { stageId } });

        expect(getTasksResponse).toSatisfyApiSpec();

        const tasksBody = getTasksResponse.body as TasksPaginatedResponse;

        expect(tasksBody.total).toBe(2);
        expect(getTasksResponse).toMatchObject({
          status: StatusCodes.OK,
          body: {
            total: 2,
            items: [
              { status: TaskOperationStatus.CREATED, stageId },
              { status: TaskOperationStatus.CREATED, stageId },
            ],
          },
        });
      });

      it('should return 200 with empty array when no tasks exist for stage', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const getTaskResponse = await requestSender.getTasksByStageIdV1({ pathParams: { stageId } });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({
          status: StatusCodes.OK,
          body: { total: 0, items: [] },
        });
      });

      it('should return 200 with total and items when paginating', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [{}, {}, {}]);
        const stageId = stage.id;

        const response = await requestSender.getTasksByStageIdV1({ pathParams: { stageId }, queryParams: { page: 1, page_size: 2 } });

        expect(response).toSatisfyApiSpec();

        const paginatedTasks = response.body as TasksPaginatedResponse;

        expect(paginatedTasks.total).toBe(3);
        expect(paginatedTasks.items).toHaveLength(2);
      });

      it('should return 200 with empty items array when page is beyond total', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [{}]);
        const stageId = stage.id;

        const response = await requestSender.getTasksByStageIdV1({ pathParams: { stageId }, queryParams: { page: 9999, page_size: 10 } });

        expect(response).toSatisfyApiSpec();

        const beyondPageTasks = response.body as TasksPaginatedResponse;

        expect(beyondPageTasks.total).toBe(1);
        expect(beyondPageTasks.items).toHaveLength(0);
      });
    });

    describe('Bad Path', function () {
      it('should return 400 when supplying bad uuid', async function () {
        const getTaskResponse = await requestSender.getTasksByStageIdV1({ pathParams: { stageId: 'someInvalidStageId' } });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/params\/stageId must match format "uuid"/) as string, code: 'VALIDATION_ERROR' },
        });
      });

      it('should return 404 when stage does not exist', async function () {
        const getTaskResponse = await requestSender.getTasksByStageIdV1({ pathParams: { stageId: faker.string.uuid() } });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: stagesErrorMessages.stageNotFound, code: 'STAGE_NOT_FOUND' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 when database driver throws an error', async function () {
        const error = createMockPrismaError();
        const findUniqueSpy = createProxyMock(prisma.stage, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.getTasksByStageIdV1({ pathParams: { stageId: faker.string.uuid() } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 when database driver throws unexpected error', async function () {
        const error = createMockUnknownDbError();
        const findUniqueSpy = createProxyMock(prisma.stage, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.getTasksByStageIdV1({ pathParams: { stageId: faker.string.uuid() } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'UNKNOWN_ERROR' },
        });
      });
    });
  });

  describe('#updateUserMetadata', function () {
    describe('Happy Path', function () {
      it("should return 201 and modify task's userMetadata", async function () {
        const userMetadataInput = { someTestKey: 'someTestData' };
        const { tasks } = await createJobnikTree(prisma, {}, {}, [{}]);
        const taskId = tasks[0]!.id;

        const updateUserMetadataResponse = await requestSender.updateTaskUserMetadataV1({
          pathParams: { taskId },
          requestBody: userMetadataInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: tasks[0]!.id } });

        expect(updateUserMetadataResponse).toSatisfyApiSpec();
        expect(getTaskResponse.body).toMatchObject({ userMetadata: userMetadataInput });
      });
    });

    describe('Bad Path', function () {
      it('should return 404 when task not found', async function () {
        const getTaskResponse = await requestSender.updateTaskUserMetadataV1({
          pathParams: { taskId: faker.string.uuid() },
          requestBody: { avi: 'avi' },
        });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: tasksErrorMessages.taskNotFound, code: 'TASK_NOT_FOUND' },
        });
      });

      it('should return 400 when request body is invalid', async function () {
        const { tasks } = await createJobnikTree(prisma, {}, {}, [{}]);
        const taskId = tasks[0]!.id;

        const response = await requestSender.updateTaskUserMetadataV1({
          pathParams: { taskId },
          requestBody: 'badInputString' as unknown as { [key: string]: string },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching('is not valid JSON') as string, code: 'VALIDATION_ERROR' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 when database driver throws an error', async function () {
        const error = createMockPrismaError();
        const updateSpy = createProxyMock(prisma.task, 'update');
        updateSpy.mockRejectedValueOnce(error);

        const response = await requestSender.updateTaskUserMetadataV1({ pathParams: { taskId: faker.string.uuid() }, requestBody: {} });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 when database driver throws unexpected error', async function () {
        const error = createMockUnknownDbError();
        const updateSpy = createProxyMock(prisma.task, 'update');
        updateSpy.mockRejectedValueOnce(error);

        const response = await requestSender.updateTaskUserMetadataV1({ pathParams: { taskId: faker.string.uuid() }, requestBody: {} });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'UNKNOWN_ERROR' },
        });
      });
    });
  });

  describe('#addTasks', function () {
    describe('Happy Path', function () {
      it('should return 200 and create tasks for stage', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const createTasksPayload = {
          data: {},
          userMetadata: {},
        } satisfies TaskCreateModel;

        const response = await requestSender.addTasksV1({
          requestBody: [createTasksPayload],
          pathParams: { stageId },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.CREATED,
          body: [createTasksPayload],
        });
      });

      it('should return 200 and create new tasks for stage with existing tasks', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [
          { status: TaskOperationStatus.COMPLETED, xstate: completedStageXstatePersistentSnapshot },
        ]);

        const stageId = stage.id;

        const createTasksPayload = {
          data: {},
          userMetadata: {},
        } satisfies TaskCreateModel;

        const response = await requestSender.addTasksV1({
          requestBody: [createTasksPayload],
          pathParams: { stageId },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.CREATED,
          body: [createTasksPayload],
        });
      });

      it('should return 201 and create tasks with generated traceparent from active span', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const createTasksPayload = {
          data: {},
          userMetadata: {},
        } satisfies TaskCreateModel;

        const createTaskResponse = await requestSender.addTasksV1({
          requestBody: [createTasksPayload],
          pathParams: { stageId },
        });

        await memoryExporter.forceFlush();
        const createTaskSpan = memoryExporter.getFinishedSpans().find((span) => span.name === 'addTasks');
        const finishedSpanContext = createTaskSpan?.spanContext();

        expect(createTaskResponse).toSatisfyApiSpec();
        expect(createTaskResponse).toMatchObject({
          body: [{ traceparent: `00-${finishedSpanContext?.traceId}-${finishedSpanContext?.spanId}-0${finishedSpanContext?.traceFlags}` }],
        });
      });

      it('should return 201 and create tasks with provided traceparent and tracestate', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const createTasksPayload = {
          data: {},
          userMetadata: {},
          traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
          tracestate: 'foo=bar',
        } satisfies TaskCreateModel;

        const createTaskResponse = await requestSender.addTasksV1({
          requestBody: [createTasksPayload],
          pathParams: { stageId },
        });

        expect(createTaskResponse).toSatisfyApiSpec();
        expect(createTaskResponse).toMatchObject({
          body: [
            {
              traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
              tracestate: 'foo=bar',
            },
          ],
        });
      });

      it('should return 201 and create tasks with provided traceparent without tracestate', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const createTasksPayload = {
          data: {},
          userMetadata: {},
          traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
        } satisfies TaskCreateModel;

        const createTaskResponse = await requestSender.addTasksV1({
          requestBody: [createTasksPayload],
          pathParams: { stageId },
        });

        if (!Array.isArray(createTaskResponse.body)) {
          throw new Error('Expected response body to be an array');
        }

        expect(createTaskResponse).toSatisfyApiSpec();
        expect(createTaskResponse).toMatchObject({
          body: [
            {
              status: TaskOperationStatus.PENDING,
              traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
            },
          ],
        });

        expect(createTaskResponse.body[0]).not.toHaveProperty('tracestate');
      });
    });

    describe('Bad Path', function () {
      it('should return 400 when supplying bad uuid', async function () {
        const addTasksResponse = await requestSender.addTasksV1({ requestBody: [], pathParams: { stageId: 'someInvalidStageId' } });

        expect(addTasksResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/params\/stageId must match format "uuid"/) as string, code: 'VALIDATION_ERROR' },
        });
      });

      it('should return 400 when request body is incorrect', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const addTasksResponse = await requestSender.addTasksV1({
          pathParams: { stageId },
          requestBody: {} as unknown as [],
        });

        expect(addTasksResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/body must be array/) as string, code: 'VALIDATION_ERROR' },
        });
      });

      it('should return 400 when attempting to add tasks to a finalized stage', async function () {
        const { stage } = await createJobnikTree(
          prisma,
          {},
          { status: StageOperationStatus.ABORTED, xstate: abortedStageXstatePersistentSnapshot },
          [],
          { createStage: true, createTasks: false }
        );
        const stageId = stage.id;

        const addTasksResponse = await requestSender.addTasksV1({ requestBody: [], pathParams: { stageId } });

        expect(addTasksResponse).toSatisfyApiSpec();
        expect(addTasksResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: stagesErrorMessages.stageAlreadyFinishedTasksError, code: 'STAGE_IN_FINITE_STATE' },
        });
      });

      it('should return 400 when attempting to add tasks to a running stage', async function () {
        const { stage } = await createJobnikTree(
          prisma,
          { xstate: inProgressStageXstatePersistentSnapshot, status: JobOperationStatus.IN_PROGRESS, traceparent: DEFAULT_TRACEPARENT },
          { xstate: inProgressStageXstatePersistentSnapshot, status: JobOperationStatus.IN_PROGRESS },
          [],
          { createStage: true, createTasks: false }
        );
        const stageId = stage.id;

        const addTasksResponse = await requestSender.addTasksV1({ requestBody: [], pathParams: { stageId } });

        expect(addTasksResponse).toSatisfyApiSpec();
        expect(addTasksResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: tasksErrorMessages.addTaskNotAllowed, code: 'NOT_ALLOWED_TO_ADD_TASKS_TO_IN_PROGRESS_STAGE' },
        });
      });

      it('should return 400 when traceparent format is invalid', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const createTasksPayload = {
          data: {},
          userMetadata: {},
          traceparent: 'INVALID_TRACEPARENT',
        } satisfies TaskCreateModel;

        const createTaskResponse = await requestSender.addTasksV1({
          requestBody: [createTasksPayload],
          pathParams: { stageId },
        });

        expect(createTaskResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/body\/0\/traceparent must match pattern/) as string, code: 'VALIDATION_ERROR' },
        });
      });

      it('should return 404 when stage does not exist', async function () {
        const createTaskPayload = {
          data: {},
          userMetadata: {},
        } satisfies TaskCreateModel;

        const response = await requestSender.addTasksV1({
          requestBody: [createTaskPayload],
          pathParams: { stageId: faker.string.uuid() },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: stagesErrorMessages.stageNotFound, code: 'STAGE_NOT_FOUND' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 when database driver throws an error', async function () {
        const error = createMockPrismaError();
        const findUniqueSpy = createProxyMock(prisma.stage, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.addTasksV1({
          requestBody: [],
          pathParams: { stageId: faker.string.uuid() },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 when database driver throws unexpected error', async function () {
        const error = createMockUnknownDbError();
        const findUniqueSpy = createProxyMock(prisma.stage, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.addTasksV1({
          requestBody: [],
          pathParams: { stageId: faker.string.uuid() },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'UNKNOWN_ERROR' },
        });
      });
    });
  });

  describe('#updateStatus', function () {
    describe('Happy Path', function () {
      it('should update task to COMPLETED and update stage summary', async function () {
        const initialSummary = { ...defaultStatusCounts, inProgress: 1, total: 1 };
        const expectedSummary = { ...defaultStatusCounts, completed: 1, inProgress: 0, total: 1 };
        const updateStatusInput = { status: TaskOperationStatus.COMPLETED };

        const { stage, tasks } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary: initialSummary },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot }]
        );

        const taskId = tasks[0]!.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stage.id } });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(getTaskResponse.body).toMatchObject(updateStatusInput);
        expect(getStageResponse.body).toMatchObject({ summary: expectedSummary });
      });

      it('should update task to COMPLETED and add endTime', async function () {
        const updateStatusInput = { status: TaskOperationStatus.COMPLETED };

        const { tasks } = await createJobnikTree(
          prisma,
          {},
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot }]
        );

        const taskId = tasks[0]!.id;
        const getTaskResponseBeforeUpdate = await requestSender.getTaskByIdV1({ pathParams: { taskId } });

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId } });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(getTaskResponseBeforeUpdate.body).not.toHaveProperty('endTime');
        expect(getTaskResponse.body).toHaveProperty('endTime');
      });

      it('should update task to FAILED and add endTime', async function () {
        const updateStatusInput = { status: TaskOperationStatus.FAILED };

        const { tasks } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            summary: { ...defaultStatusCounts, total: 1, inProgress: 1 },
          },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, maxAttempts: 1 }]
        );

        const taskId = tasks[0]!.id;
        const getTaskResponseBeforeUpdate = await requestSender.getTaskByIdV1({ pathParams: { taskId } });

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId } });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(getTaskResponseBeforeUpdate.body).not.toHaveProperty('endTime');
        expect(getTaskResponse.body).toHaveProperty('endTime');
      });

      it('should update task to COMPLETED without completing stage', async function () {
        const initialSummary = { ...defaultStatusCounts, total: 1000, completed: 998, inProgress: 1, pending: 1 };
        const expectedSummary = { ...defaultStatusCounts, total: 1000, completed: 999, inProgress: 0, pending: 1 };
        const updateStatusInput = { status: TaskOperationStatus.COMPLETED };

        const { stage, tasks } = await createJobnikTree(
          prisma,
          {},
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary: initialSummary },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, maxAttempts: 1 }]
        );

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId } });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(getTaskResponse.body).toMatchObject(updateStatusInput);
        expect(getStageResponse.body).toMatchObject({ summary: expectedSummary, status: StageOperationStatus.IN_PROGRESS, percentage: 99 });
      });

      it('should update task to RETRIED and increase attempts', async function () {
        const initialSummary = { ...defaultStatusCounts, inProgress: 1, total: 1 };
        const updateStatusInput = { status: TaskOperationStatus.FAILED };
        const expectedSummary = { ...defaultStatusCounts, retried: 1, inProgress: 0, failed: 0, total: 1 };
        const expectedStatus = { status: TaskOperationStatus.RETRIED, attempts: 1 };

        const { stage, tasks } = await createJobnikTree(
          prisma,
          {},
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary: initialSummary },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, maxAttempts: 2, attempts: 0 }]
        );

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId } });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(getTaskResponse.body).toMatchObject(expectedStatus);
        expect(getStageResponse.body).toMatchObject({ summary: expectedSummary });
      });

      it('should update task to FAILED', async function () {
        const initialSummary = { ...defaultStatusCounts, inProgress: 1, total: 1 };
        const updateStatusInput = { status: TaskOperationStatus.FAILED };
        const expectedSummary = { ...defaultStatusCounts, retried: 0, inProgress: 0, failed: 1, total: 1 };
        const expectedStatus = { status: TaskOperationStatus.FAILED, attempts: 2 };

        const { stage, tasks } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary: initialSummary },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, maxAttempts: 2, attempts: 1 }]
        );

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId },
          requestBody: updateStatusInput,
        });
        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId } });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(getTaskResponse.body).toMatchObject(expectedStatus);
        expect(getStageResponse.body).toMatchObject({ summary: expectedSummary });
      });

      it('should update task to COMPLETED', async function () {
        const initialSummary = { ...defaultStatusCounts, inProgress: 2, total: 2 };
        const updateStatusInput = { status: TaskOperationStatus.COMPLETED };
        const expectedSummary = { ...defaultStatusCounts, inProgress: 1, completed: 1, total: 2 };
        const expectedTaskStatus = { status: TaskOperationStatus.COMPLETED };
        const expectedStageStatus = { status: TaskOperationStatus.IN_PROGRESS, percentage: 50, summary: expectedSummary };

        const { stage, tasks } = await createJobnikTree(
          prisma,
          {},
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary: initialSummary },
          [
            { status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
            { status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          ]
        );

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId } });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(getTaskResponse.body).toMatchObject(expectedTaskStatus);
        expect(getStageResponse.body).toMatchObject(expectedStageStatus);
      });

      it('should complete task and stage when job has multiple stages', async function () {
        const initialSummary = { ...defaultStatusCounts, inProgress: 1, total: 1 };
        const updateStatusInput = { status: TaskOperationStatus.COMPLETED };
        const expectedSummary = { ...defaultStatusCounts, inProgress: 0, completed: 1, total: 1 };
        const expectedTaskStatus = { status: TaskOperationStatus.COMPLETED };
        const expectedStageStatus = { status: StageOperationStatus.COMPLETED, percentage: 100, summary: expectedSummary };

        const { stage, tasks } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary: initialSummary },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot }]
        );

        const secondStage = await requestSender.addStageV1({
          pathParams: { jobId: stage.jobId },
          requestBody: {
            type: 'Second Stage',
            data: {},
            userMetadata: {},
          },
        });

        expectResponseStatus(secondStage, 201);

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId } });
        const getSecondStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: secondStage.body.id } });
        const getJobResponse = await requestSender.getJobByIdV1({ pathParams: { jobId: stage.jobId } });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(getTaskResponse.body).toMatchObject(expectedTaskStatus);
        expect(getStageResponse.body).toMatchObject(expectedStageStatus);
        expect(getSecondStageResponse.body).toMatchObject({ status: StageOperationStatus.PENDING });
        expect(getJobResponse.body).toMatchObject({ status: JobOperationStatus.IN_PROGRESS, percentage: 50 });
      });

      it('should complete task, stage, and job when all finished', async function () {
        const initialSummary = { ...defaultStatusCounts, inProgress: 1, total: 1 };
        const updateStatusInput = { status: TaskOperationStatus.COMPLETED };
        const expectedSummary = { ...defaultStatusCounts, inProgress: 0, completed: 1, total: 1 };
        const expectedTaskStatus = { status: TaskOperationStatus.COMPLETED };
        const expectedStageStatus = { status: StageOperationStatus.COMPLETED, percentage: 100, summary: expectedSummary };

        const { stage, tasks } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary: initialSummary },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot }]
        );

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId } });
        const getJobResponse = await requestSender.getJobByIdV1({ pathParams: { jobId: stage.jobId } });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(getTaskResponse.body).toMatchObject(expectedTaskStatus);
        expect(getStageResponse.body).toMatchObject(expectedStageStatus);
        expect(getJobResponse.body).toMatchObject({ status: JobOperationStatus.COMPLETED });
      });
    });

    describe('Bad Path', function () {
      it('should return 400 with detailed error for invalid status transition', async function () {
        const { tasks } = await createJobnikTree(
          prisma,
          {},
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          [{ status: TaskOperationStatus.CREATED }]
        );

        const taskId = tasks[0]!.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId },
          requestBody: { status: TaskOperationStatus.COMPLETED },
        });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(updateStatusResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: {
            message: illegalStatusTransitionErrorMessage(tasks[0]!.status, TaskOperationStatus.COMPLETED),
            code: 'ILLEGAL_TASK_STATUS_TRANSITION',
          },
        });
      });

      it('should return 400 when supplying bad uuid', async function () {
        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId: 'badUuid' },
          requestBody: { status: TaskOperationStatus.COMPLETED },
        });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(updateStatusResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/params\/taskId must match format "uuid"/) as string, code: 'VALIDATION_ERROR' },
        });
      });

      it('should return 404 when task not found', async function () {
        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId: faker.string.uuid() },
          requestBody: { status: TaskOperationStatus.COMPLETED },
        });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(updateStatusResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: tasksErrorMessages.taskNotFound, code: 'TASK_NOT_FOUND' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 when database driver throws an error', async function () {
        const error = createMockPrismaError();

        const transactionSpy = createProxyMock(prisma, '$transaction');
        transactionSpy.mockImplementationOnce(async <T>(callback: (tx: PrismaTransaction) => Promise<T>): Promise<void> => {
          const mockTx = {
            task: {
              findUnique: vi.fn().mockRejectedValueOnce(error),
            },
          } as unknown as PrismaTransaction;

          await callback(mockTx);
        });

        const response = await requestSender.updateTaskStatusV1({
          pathParams: { taskId: faker.string.uuid() },
          requestBody: { status: TaskOperationStatus.COMPLETED },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 when database driver throws unexpected error', async function () {
        const error = createMockUnknownDbError();

        const transactionSpy = createProxyMock(prisma, '$transaction');
        transactionSpy.mockImplementationOnce(async <T>(callback: (tx: PrismaTransaction) => Promise<T>): Promise<void> => {
          const mockTx = {
            task: {
              findUnique: vi.fn().mockRejectedValueOnce(error),
            },
          } as unknown as PrismaTransaction;

          await callback(mockTx);
        });

        const response = await requestSender.updateTaskStatusV1({
          pathParams: { taskId: faker.string.uuid() },
          requestBody: { status: TaskOperationStatus.COMPLETED },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'UNKNOWN_ERROR' },
        });
      });
    });
  });

  describe('#dequeue', function () {
    describe('Happy Path', function () {
      it('should return 200 with available task', async function () {
        const initialSummary = { ...defaultStatusCounts, pending: 1, total: 1 };

        const { stage, tasks } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, traceparent: DEFAULT_TRACEPARENT },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            summary: initialSummary,
            type: 'SOME_TEST_TYPE_1',
          },
          [{ status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }]
        );

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const dequeueResponse = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_1' },
        });

        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId } });

        expect(dequeueResponse).toSatisfyApiSpec();
        expect(dequeueResponse).toMatchObject({
          status: StatusCodes.OK,
          body: {
            id: taskId,
            status: TaskOperationStatus.IN_PROGRESS,
            stageId,
          },
        });
        //validate summary was updated
        expect(getStageResponse.body).toHaveProperty('summary', { ...initialSummary, pending: 0, inProgress: 1, total: 1 });
      });

      it('should return 200 with available task and move stage to in progress', async function () {
        const initialSummary = { ...defaultStatusCounts, pending: 1, total: 1 };

        const { stage, tasks } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, traceparent: DEFAULT_TRACEPARENT },
          {
            status: StageOperationStatus.PENDING,
            xstate: pendingStageXstatePersistentSnapshot,
            summary: initialSummary,
            type: 'SOME_TEST_TYPE_2',
          },
          [{ status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }]
        );

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const dequeueResponse = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_2' },
        });

        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId } });

        expect(dequeueResponse).toSatisfyApiSpec();
        expect(dequeueResponse).toMatchObject({
          status: StatusCodes.OK,
          body: {
            id: taskId,
            status: TaskOperationStatus.IN_PROGRESS,
            stageId,
          },
        });
        expect(getStageResponse.body).toHaveProperty('status', StageOperationStatus.IN_PROGRESS);
      });

      it('should return 200 with available task and move stage and job to in progress', async function () {
        const initialSummary = { ...defaultStatusCounts, pending: 1, total: 1 };

        const { job, stage, tasks } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot, traceparent: DEFAULT_TRACEPARENT },
          {
            status: StageOperationStatus.PENDING,
            xstate: pendingStageXstatePersistentSnapshot,
            summary: initialSummary,
            type: 'SOME_TEST_TYPE_3',
          },
          [{ status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }]
        );

        const jobId = job.id;
        const stageId = stage.id;
        const taskId = tasks[0]!.id;

        const dequeueResponse = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_3' },
        });

        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId } });
        const getJobResponse = await requestSender.getJobByIdV1({ pathParams: { jobId } });

        expect(dequeueResponse).toSatisfyApiSpec();
        expect(dequeueResponse).toMatchObject({
          status: StatusCodes.OK,
          body: {
            id: taskId,
            status: TaskOperationStatus.IN_PROGRESS,
            stageId,
          },
        });
        expect(getStageResponse.body).toHaveProperty('status', StageOperationStatus.IN_PROGRESS);
        expect(getJobResponse.body).toHaveProperty('status', JobOperationStatus.IN_PROGRESS);
      });

      it('should return 200 with most prioritized task', async function () {
        const initialSummary = { ...defaultStatusCounts, pending: 3, total: 3 };
        const jobLowPriority = await addJobRecord(
          {
            ...createJobRequestBody,
            id: faker.string.uuid(),
            priority: Priority.LOW,
            xstate: inProgressStageXstatePersistentSnapshot,
            status: JobOperationStatus.IN_PROGRESS,
            traceparent: DEFAULT_TRACEPARENT,
          },
          prisma
        );
        const stageLowPriority = await addStageRecord(
          {
            ...createStageBody,
            summary: initialSummary,
            jobId: jobLowPriority.id,
            status: StageOperationStatus.IN_PROGRESS,
            type: 'SOME_TEST_TYPE_DEQUEUE_BY_PRIORITY',
            xstate: inProgressStageXstatePersistentSnapshot,
          },
          prisma
        );
        const tasksLowPriority = await createTaskRecords(
          [{ ...createTaskBody, stageId: stageLowPriority.id, status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }],
          prisma
        );
        const jobMediumPriority = await addJobRecord(
          {
            ...createJobRequestBody,
            id: faker.string.uuid(),
            priority: Priority.MEDIUM,
            xstate: inProgressStageXstatePersistentSnapshot,
            status: JobOperationStatus.IN_PROGRESS,
            traceparent: DEFAULT_TRACEPARENT,
          },
          prisma
        );
        const stageMediumPriority = await addStageRecord(
          {
            ...createStageBody,
            summary: initialSummary,
            jobId: jobMediumPriority.id,
            status: StageOperationStatus.IN_PROGRESS,
            type: 'SOME_TEST_TYPE_DEQUEUE_BY_PRIORITY',
            xstate: inProgressStageXstatePersistentSnapshot,
          },
          prisma
        );
        const tasksMediumPriority = await createTaskRecords(
          [
            {
              ...createTaskBody,
              stageId: stageMediumPriority.id,
              status: TaskOperationStatus.PENDING,
              xstate: pendingStageXstatePersistentSnapshot,
            },
          ],
          prisma
        );
        const jobHighPriority = await addJobRecord(
          {
            ...createJobRequestBody,
            id: faker.string.uuid(),
            priority: Priority.HIGH,
            xstate: inProgressStageXstatePersistentSnapshot,
            status: JobOperationStatus.IN_PROGRESS,
            traceparent: DEFAULT_TRACEPARENT,
          },
          prisma
        );
        const stageHighPriority = await addStageRecord(
          {
            ...createStageBody,
            summary: initialSummary,
            jobId: jobHighPriority.id,
            status: StageOperationStatus.IN_PROGRESS,
            type: 'SOME_TEST_TYPE_DEQUEUE_BY_PRIORITY',
            xstate: inProgressStageXstatePersistentSnapshot,
          },
          prisma
        );
        const tasksHighPriority = await createTaskRecords(
          [{ ...createTaskBody, stageId: stageHighPriority.id, status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }],
          prisma
        );
        // Dequeue tasks, should return the task with high priority first
        const dequeueResponseHigh = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_DEQUEUE_BY_PRIORITY' },
        });
        // Dequeue tasks with medium and low priority, should return the next available task
        const dequeueResponseMedium = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_DEQUEUE_BY_PRIORITY' },
        });
        // Dequeue tasks with low priority, should return the next available task
        const dequeueResponseLow = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_DEQUEUE_BY_PRIORITY' },
        });

        expect(dequeueResponseHigh).toSatisfyApiSpec();
        expect(dequeueResponseHigh).toMatchObject({
          status: StatusCodes.OK,
          body: {
            id: tasksHighPriority[0]!.id,
            status: TaskOperationStatus.IN_PROGRESS,
            stageId: stageHighPriority.id,
          },
        });
        expect(dequeueResponseMedium).toMatchObject({
          status: StatusCodes.OK,
          body: {
            id: tasksMediumPriority[0]!.id,
            status: TaskOperationStatus.IN_PROGRESS,
            stageId: stageMediumPriority.id,
          },
        });
        expect(dequeueResponseLow).toMatchObject({
          status: StatusCodes.OK,
          body: {
            id: tasksLowPriority[0]!.id,
            status: TaskOperationStatus.IN_PROGRESS,
            stageId: stageLowPriority.id,
          },
        });
      });

      it('should add startTime when dequeuing task', async function () {
        const initialSummary = { ...defaultStatusCounts, pending: 1, total: 1 };

        const { stage, tasks } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, traceparent: DEFAULT_TRACEPARENT },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            summary: initialSummary,
            type: 'SOME_TEST_TYPE_STARTIME_CHECK',
          },
          [{ status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }]
        );

        const taskId = tasks[0]!.id;

        // Get task before dequeue to verify it doesn't have startTime
        const getTaskResponseBeforeDequeue = await requestSender.getTaskByIdV1({ pathParams: { taskId } });

        const dequeueResponse = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_STARTIME_CHECK' },
        });

        // Get task after dequeue to verify it has startTime
        const getTaskResponseAfterDequeue = await requestSender.getTaskByIdV1({ pathParams: { taskId } });

        expect(dequeueResponse).toSatisfyApiSpec();
        expect(dequeueResponse).toMatchObject({
          status: StatusCodes.OK,
          body: {
            id: taskId,
            status: TaskOperationStatus.IN_PROGRESS,
            stageId: stage.id,
          },
        });
        expect(getTaskResponseBeforeDequeue.body).not.toHaveProperty('startTime');
        expect(getTaskResponseAfterDequeue.body).toHaveProperty('startTime');
      });

      it('should update startTime when dequeuing RETRIED task', async function () {
        const initialSummary = { ...defaultStatusCounts, retried: 1, total: 1 };

        const { stage, tasks } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, traceparent: DEFAULT_TRACEPARENT },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            summary: initialSummary,
            type: 'SOME_TEST_TYPE_RETRIED_STARTIME',
          },
          [{ status: TaskOperationStatus.RETRIED, xstate: retryTaskXstatePersistentSnapshot, startTime: new Date() }]
        );

        const taskId = tasks[0]!.id;

        // Get task before dequeue to capture previous startTime
        const getTaskResponseBeforeDequeue = await requestSender.getTaskByIdV1({ pathParams: { taskId } });
        const taskBeforeDequeue = getTaskResponseBeforeDequeue.body as TaskModel;
        const previousStartTime = taskBeforeDequeue.startTime;

        const dequeueResponse = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_RETRIED_STARTIME' },
        });

        // Get task after dequeue to verify startTime was updated
        const getTaskResponseAfterDequeue = await requestSender.getTaskByIdV1({ pathParams: { taskId } });
        const taskAfterDequeue = getTaskResponseAfterDequeue.body as TaskModel;

        expect(dequeueResponse).toSatisfyApiSpec();
        expect(dequeueResponse).toMatchObject({
          status: StatusCodes.OK,
          body: {
            id: taskId,
            status: TaskOperationStatus.IN_PROGRESS,
            stageId: stage.id,
          },
        });
        expect(new Date(taskAfterDequeue.startTime!)).toBeAfter(new Date(previousStartTime!));
      });
    });

    describe('Bad Path', function () {
      it('should return 400 when stage type exceeds 50 characters', async function () {
        const longStageType = faker.string.alpha(51);
        await prisma.$queryRaw(Prisma.sql`TRUNCATE TABLE "job_manager"."task" CASCADE;`);

        const taskResponse = await requestSender.dequeueTaskV1({
          pathParams: { stageType: longStageType },
        });

        expect(taskResponse).toSatisfyApiSpec();
        expect(taskResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: {
            message: expect.stringMatching(/request\/params\/stageType must NOT have more than 50 characters/) as string,
            code: 'VALIDATION_ERROR',
          },
        });
      });

      it('should return 404 when no available task exists', async function () {
        await prisma.$queryRaw(Prisma.sql`TRUNCATE TABLE "job_manager"."task" CASCADE;`);
        const taskResponse = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_NON_EXIST_STAGE_TYPE' },
        });

        expect(taskResponse).toSatisfyApiSpec();
        expect(taskResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: tasksErrorMessages.taskNotFound, code: 'TASK_NOT_FOUND' },
        });
      });

      it('should return 404 when no PENDING task available', async function () {
        await prisma.$queryRaw(Prisma.sql`TRUNCATE TABLE "job_manager"."task" CASCADE;`);
        const initialSummary = { ...defaultStatusCounts, inProgress: 1, total: 1 };

        await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, traceparent: DEFAULT_TRACEPARENT },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            summary: initialSummary,
            type: 'SOME_TEST_TYPE_NO_PENDING_TASK',
          },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot }]
        );

        const taskResponse = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_NO_PENDING_TASK' },
        });

        expect(taskResponse).toSatisfyApiSpec();
        expect(taskResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: tasksErrorMessages.taskNotFound, code: 'TASK_NOT_FOUND' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 when database driver throws an error', async function () {
        const error = createMockPrismaError();

        const transactionSpy = createProxyMock(prisma, '$transaction');
        transactionSpy.mockImplementationOnce(async <T>(callback: (tx: PrismaTransaction) => Promise<T>): Promise<void> => {
          const mockTx = {
            $queryRawTyped: vi.fn().mockRejectedValueOnce(error),
          } as unknown as PrismaTransaction;

          await callback(mockTx);
        });

        const response = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_NAME' },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 when database driver throws unexpected error', async function () {
        const error = createMockUnknownDbError();

        const transactionSpy = createProxyMock(prisma, '$transaction');
        transactionSpy.mockImplementationOnce(async <T>(callback: (tx: PrismaTransaction) => Promise<T>): Promise<void> => {
          const mockTx = {
            $queryRawTyped: vi.fn().mockRejectedValueOnce(error),
          } as unknown as PrismaTransaction;

          await callback(mockTx);
        });

        const response = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_NAME' },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'UNKNOWN_ERROR' },
        });
      });

      it('should return 500 when transaction fails', async function () {
        const initialSummary = { ...defaultStatusCounts, pending: 1, total: 1 };

        const { job, stage, tasks } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.PENDING, xstate: inProgressStageXstatePersistentSnapshot, traceparent: DEFAULT_TRACEPARENT },
          {
            status: StageOperationStatus.PENDING,
            xstate: pendingStageXstatePersistentSnapshot,
            summary: initialSummary,
            type: 'SOME_TEST_TYPE_FAILED_TRANSACTION',
          },
          [{ status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }]
        );

        const jobId = job.id;
        const stageId = stage.id;
        const taskId = tasks[0]!.id;

        const dequeueResponse = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_FAILED_TRANSACTION' },
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId } });
        const getJobResponse = await requestSender.getJobByIdV1({ pathParams: { jobId } });

        expect(dequeueResponse).toSatisfyApiSpec();
        expect(dequeueResponse).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: illegalStatusTransitionErrorMessage(job.status, JobOperationStatus.IN_PROGRESS), code: 'ILLEGAL_JOB_STATUS_TRANSITION' },
        });
        expect(getTaskResponse.body).toHaveProperty('status', TaskOperationStatus.PENDING);
        expect(getStageResponse.body).toHaveProperty('status', StageOperationStatus.PENDING);
        expect(getJobResponse.body).toHaveProperty('status', JobOperationStatus.PENDING);
      });

      it('should prevent multiple dequeue of the same task using database-level locking', async function () {
        expect.assertions(4);

        const initialSummary = { ...defaultStatusCounts, pending: 1, total: 1 };

        const { stage, tasks } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, traceparent: DEFAULT_TRACEPARENT },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            summary: initialSummary,
            type: 'SOME_TEST_TYPE_PREVENT_MULTIPLE_DEQUEUE',
          },
          [{ status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }]
        );

        const stageId = stage.id;
        const taskId = tasks[0]!.id;

        // With FOR UPDATE SKIP LOCKED, concurrent dequeues are handled at database level
        // The first transaction locks the row, second transaction skips it and finds no tasks
        const dequeueFirstPromise = requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_PREVENT_MULTIPLE_DEQUEUE' },
        });
        const dequeueSecondPromise = requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_PREVENT_MULTIPLE_DEQUEUE' },
        });

        const [firstResponse, secondResponse] = await Promise.all([dequeueFirstPromise, dequeueSecondPromise]);

        // First call will success and pull task
        expect(firstResponse).toSatisfyApiSpec();
        expect(firstResponse).toMatchObject({
          status: StatusCodes.OK,
          body: {
            id: taskId,
            status: TaskOperationStatus.IN_PROGRESS,
            stageId: stageId,
          },
        });

        // Second call will fail with 404 status code because task was locked by first transaction
        expect(secondResponse).toSatisfyApiSpec();
        expect(secondResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: {
            message: tasksErrorMessages.taskNotFound,
            code: 'TASK_NOT_FOUND',
          },
        });
      });

      it('should return 409 CONFLICT when dequeue encounters race condition during task update', async function () {
        const initialSummary = { ...defaultStatusCounts, pending: 1, total: 1 };

        await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, traceparent: DEFAULT_TRACEPARENT },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            summary: initialSummary,
            type: 'SOME_TEST_TYPE_DEQUEUE_RACE_CONFLICT',
          },
          [{ status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }]
        );

        // Mock updateManyAndReturn to simulate race condition where task was modified between lock and update
        const transactionSpy = createProxyMock(prisma, '$transaction');
        transactionSpy.mockImplementationOnce(async <T>(callback: (tx: PrismaTransaction) => Promise<T>): Promise<T> => {
          const mockTx = {
            ...prisma,
            $queryRawTyped: prisma.$queryRawTyped.bind(prisma),
            task: {
              ...prisma.task,
              findUnique: prisma.task.findUnique.bind(prisma.task),
              updateManyAndReturn: vi.fn().mockResolvedValue([]), // Simulate race condition - no rows updated
            },
          } as unknown as PrismaTransaction;

          return callback(mockTx);
        });

        const response = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_DEQUEUE_RACE_CONFLICT' },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.CONFLICT,
          body: {
            message: tasksErrorMessages.taskStatusUpdateFailed,
            code: 'TASK_STATUS_UPDATE_FAILED',
          },
        });
      });

      it('should handle multiple concurrent updateStatus operations with race condition protection', async function () {
        expect.assertions(4);

        const initialSummary = { ...defaultStatusCounts, inProgress: 1, total: 1 };

        const { tasks } = await createJobnikTree(
          prisma,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, traceparent: DEFAULT_TRACEPARENT },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            summary: initialSummary,
            type: 'SOME_TEST_TYPE_MULTIPLE_UPDATE_RACE',
          },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot }]
        );

        const taskId = tasks[0]!.id;
        let continueFirstUpdate: (value?: unknown) => void;
        let continueSecondUpdate: (value?: unknown) => void;
        const firstUpdateHolder = new Promise((resolve) => {
          continueFirstUpdate = resolve;
        });
        const secondUpdateHolder = new Promise((resolve) => {
          continueSecondUpdate = resolve;
        });

        // Mock task.findUnique for both update calls
        const originalFindUnique = prisma.task.findUnique.bind(prisma.task);
        const findUniqueSpy = createProxyMock(prisma.task, 'findUnique');

        // First update call - pause before updating
        findUniqueSpy.mockImplementationOnce(async (...args: Parameters<typeof originalFindUnique>) => {
          const res = await originalFindUnique(...args);
          await firstUpdateHolder; // Pause first update
          return res;
        });

        // Second update call - pause before updating
        findUniqueSpy.mockImplementationOnce(async (...args: Parameters<typeof originalFindUnique>) => {
          const res = await originalFindUnique(...args);
          continueFirstUpdate(); // Allow first update to proceed
          await secondUpdateHolder; // Pause second update
          return res;
        });

        // Start both update operations concurrently (simulating 2 workers completing the same task)
        const firstUpdatePromise = requestSender.updateTaskStatusV1({
          pathParams: { taskId },
          requestBody: { status: TaskOperationStatus.COMPLETED },
        });
        const secondUpdatePromise = requestSender.updateTaskStatusV1({
          pathParams: { taskId },
          requestBody: { status: TaskOperationStatus.COMPLETED },
        });

        // Wait for first update to complete
        const firstResponse = await firstUpdatePromise;

        // Allow second update to proceed
        // @ts-expect-error not recognized initialization
        continueSecondUpdate();
        const secondResponse = await secondUpdatePromise;

        // First update should succeed - task transitioned from IN_PROGRESS to COMPLETED
        expect(firstResponse).toSatisfyApiSpec();
        expect(firstResponse).toMatchObject({
          status: StatusCodes.OK,
          body: {
            id: taskId,
            status: TaskOperationStatus.COMPLETED,
          },
        });

        // Second update should fail because task is no longer IN_PROGRESS
        // The optimistic locking prevents duplicate completion
        expect(secondResponse).toSatisfyApiSpec();
        expect(secondResponse).toMatchObject({
          status: StatusCodes.CONFLICT,
          body: {
            message: tasksErrorMessages.taskStatusUpdateFailed,
            code: 'TASK_STATUS_UPDATE_FAILED',
          },
        });
      });
    });
  });
});
