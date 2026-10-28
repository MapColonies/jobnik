/* eslint-disable @typescript-eslint/naming-convention */
import { describe, beforeEach, afterEach, it, expect, beforeAll, vi } from 'vitest';
import type { DependencyContainer } from 'tsyringe';
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
import { openapiFilePath, type paths, type operations, type StageId, type TaskId } from 'jobnik-openapi';
import { and, DrizzleQueryError, eq, sql } from 'drizzle-orm';
import type { Drizzle } from '@src/db/drizzle';
import { taskTable } from '@src/db/entities';
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
import { StageRepository } from '@src/stages/DAL/stageRepository';
import { TaskRepository } from '@src/tasks/DAL/taskRepository';
import { illegalStatusTransitionErrorMessage } from '@src/common/errors';
import { JobOperationStatus, Priority, StageOperationStatus, TaskOperationStatus } from '@src/db/persistenceModel';
import { createJobRequestBody } from '../jobs/helpers';
import { addJobRecord, addStageRecord, createStageBody } from '../stages/helpers';
import { createJobnikTree, endDatabasePool, truncateAllTables } from '../common/utils';
import { createTaskBody, createTaskRecords, waitForBlockedTaskUpdates } from './helpers';

const expectResponseStatus: ExpectResponseStatus = expectResponseStatusFactory(expect);

describe('task', function () {
  let requestSender: RequestSender<paths, operations>;
  let drizzle: Drizzle;
  let container: DependencyContainer;

  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  const provider = new NodeTracerProvider({ spanProcessors: [spanProcessor] });
  provider.register();

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

    requestSender = await createRequestSender<paths, operations>(openapiFilePath, app);
    drizzle = container.resolve<Drizzle>(SERVICES.DRIZZLE);
    await truncateAllTables(drizzle);
  });

  afterEach(async function () {
    vi.restoreAllMocks();
    await endDatabasePool(container);
    memoryExporter.reset();
  });

  describe('#getTasks', function () {
    describe('Happy Path', function () {
      it('should return 200 with the matching task', async function () {
        const { stage, tasks } = await createJobnikTree(drizzle);

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const response = await requestSender.getTasksByCriteriaV1({ queryParams: { stage_id: stageId } });

        expect(response).toMatchObject({
          status: StatusCodes.OK,
          body: { total: 1, items: [{ id: taskId, stageId }] },
        });
      });

      it('should return 200 with only the tasks whose stage matches the stage_type filter', async function () {
        const { tasks } = await createJobnikTree(drizzle, {}, { type: 'SOME_TEST_TYPE_FILTER_A' }, [{}]);
        await createJobnikTree(drizzle, {}, { type: 'SOME_TEST_TYPE_FILTER_B' }, [{}]);

        const response = await requestSender.getTasksByCriteriaV1({ queryParams: { stage_type: 'SOME_TEST_TYPE_FILTER_A' } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.OK,
          body: { total: 1, items: [{ id: tasks[0]!.id }] },
        });
        expect(response.body).toHaveProperty('items.length', 1);
      });

      it('should return 200 with only the tasks created within the from_date and end_date range', async function () {
        const now = Date.now();
        const { tasks } = await createJobnikTree(drizzle, {}, { type: 'SOME_TEST_TYPE_DATE_RANGE' }, [
          { creationTime: new Date(now - 3 * 60 * 60 * 1000) },
          { creationTime: new Date(now - 60 * 60 * 1000) },
          { creationTime: new Date(now + 60 * 60 * 1000) },
        ]);

        const response = await requestSender.getTasksByCriteriaV1({
          queryParams: {
            stage_type: 'SOME_TEST_TYPE_DATE_RANGE',
            from_date: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
            end_date: new Date(now).toISOString(),
          },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.OK,
          body: { total: 1, items: [{ id: tasks[1]!.id }] },
        });
        expect(response.body).toHaveProperty('items.length', 1);
      });

      it('should return 200 with empty array', async function () {
        const someRandomUuid = faker.string.uuid();
        const response = await requestSender.getTasksByCriteriaV1({ queryParams: { stage_id: someRandomUuid as StageId } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.OK,
          body: { total: 0, items: [] },
        });
      });

      it('should return 200 with all tasks when no query params defined', async function () {
        await createJobnikTree(drizzle, {}, {}, [{}, {}]);

        const response = await requestSender.getTasksByCriteriaV1();

        expectResponseStatus(response, 200);

        expect(response).toSatisfyApiSpec();
        expect(response).toHaveProperty('status', StatusCodes.OK);

        const allTasksBody = response.body;

        expect(allTasksBody.items).toBeArray();
        expect(allTasksBody.items).not.toHaveLength(0);
      });

      it('should return 200 with total and items when paginating', async function () {
        await createJobnikTree(drizzle, {}, {}, [{}, {}, {}]);

        const response = await requestSender.getTasksByCriteriaV1({ queryParams: { page: 1, page_size: 2 } });

        expectResponseStatus(response, 200);

        expect(response).toSatisfyApiSpec();

        const pagedTasksBody = response.body;

        expect(pagedTasksBody.total).toBeGreaterThanOrEqual(3);
        expect(pagedTasksBody.items).toHaveLength(2);
      });

      it('should return 200 with empty items array when page is beyond total', async function () {
        await createJobnikTree(drizzle, {}, {}, [{}]);

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
      it('should return 500 when the database is unavailable', async function () {
        await endDatabasePool(container);

        const response = await requestSender.getTasksByCriteriaV1({});

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({ status: StatusCodes.INTERNAL_SERVER_ERROR, body: { code: 'DATABASE_RELATED_ERROR' } });
      });
    });
  });

  describe('#getTaskById', function () {
    describe('Happy Path', function () {
      it('should return 200 with the task', async function () {
        const { tasks } = await createJobnikTree(drizzle);
        const taskId = tasks[0]!.id;

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({ status: StatusCodes.OK, body: { status: TaskOperationStatus.CREATED } });
      });
    });

    describe('Bad Path', function () {
      it('should return 404 when task does not exist', async function () {
        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: faker.string.uuid() as TaskId } });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: tasksErrorMessages.taskNotFound, code: 'TASK_NOT_FOUND' },
        });
      });

      it('should return 400 when supplying bad uuid', async function () {
        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: 'badUuid' as TaskId } });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/params\/taskId must match format "uuid"/) as string, code: 'VALIDATION_ERROR' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 when the database is unavailable', async function () {
        await endDatabasePool(container);

        const response = await requestSender.getTaskByIdV1({ pathParams: { taskId: faker.string.uuid() as TaskId } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({ status: StatusCodes.INTERNAL_SERVER_ERROR, body: { code: 'DATABASE_RELATED_ERROR' } });
      });
    });
  });

  describe('#getTaskByStageId', function () {
    describe('Happy Path', function () {
      it('should return 200 with the tasks', async function () {
        const { stage } = await createJobnikTree(drizzle, {}, {}, [{}, {}]);
        const stageId = stage.id;

        const getTasksResponse = await requestSender.getTasksByStageIdV1({ pathParams: { stageId: stageId } });

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
        const { stage } = await createJobnikTree(drizzle, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const getTaskResponse = await requestSender.getTasksByStageIdV1({ pathParams: { stageId: stageId } });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({
          status: StatusCodes.OK,
          body: { total: 0, items: [] },
        });
      });

      it('should return 200 with total and items when paginating', async function () {
        const { stage } = await createJobnikTree(drizzle, {}, {}, [{}, {}, {}]);
        const stageId = stage.id;

        const response = await requestSender.getTasksByStageIdV1({
          pathParams: { stageId: stageId },
          queryParams: { page: 1, page_size: 2 },
        });

        expect(response).toSatisfyApiSpec();

        const paginatedTasks = response.body as TasksPaginatedResponse;

        expect(paginatedTasks.total).toBe(3);
        expect(paginatedTasks.items).toHaveLength(2);
      });

      it('should return 200 with empty items array when page is beyond total', async function () {
        const { stage } = await createJobnikTree(drizzle, {}, {}, [{}]);
        const stageId = stage.id;

        const response = await requestSender.getTasksByStageIdV1({
          pathParams: { stageId: stageId },
          queryParams: { page: 9999, page_size: 10 },
        });

        expect(response).toSatisfyApiSpec();

        const beyondPageTasks = response.body as TasksPaginatedResponse;

        expect(beyondPageTasks.total).toBe(1);
        expect(beyondPageTasks.items).toHaveLength(0);
      });
    });

    describe('Bad Path', function () {
      it('should return 400 when supplying bad uuid', async function () {
        const getTaskResponse = await requestSender.getTasksByStageIdV1({ pathParams: { stageId: 'someInvalidStageId' as StageId } });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/params\/stageId must match format "uuid"/) as string, code: 'VALIDATION_ERROR' },
        });
      });

      it('should return 404 when stage does not exist', async function () {
        const getTaskResponse = await requestSender.getTasksByStageIdV1({ pathParams: { stageId: faker.string.uuid() as StageId } });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: stagesErrorMessages.stageNotFound, code: 'STAGE_NOT_FOUND' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 when the database is unavailable', async function () {
        await endDatabasePool(container);

        const response = await requestSender.getTasksByStageIdV1({ pathParams: { stageId: faker.string.uuid() as StageId } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({ status: StatusCodes.INTERNAL_SERVER_ERROR, body: { code: 'DATABASE_RELATED_ERROR' } });
      });
    });
  });

  describe('#updateUserMetadata', function () {
    describe('Happy Path', function () {
      it("should return 201 and modify task's userMetadata", async function () {
        const userMetadataInput = { someTestKey: 'someTestData' };
        const { tasks } = await createJobnikTree(drizzle, {}, {}, [{}]);
        const taskId = tasks[0]!.id;

        const updateUserMetadataResponse = await requestSender.updateTaskUserMetadataV1({
          pathParams: { taskId: taskId },
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
          pathParams: { taskId: faker.string.uuid() as TaskId },
          requestBody: { avi: 'avi' },
        });

        expect(getTaskResponse).toSatisfyApiSpec();
        expect(getTaskResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: tasksErrorMessages.taskNotFound, code: 'TASK_NOT_FOUND' },
        });
      });

      it('should return 400 when request body is invalid', async function () {
        const { tasks } = await createJobnikTree(drizzle, {}, {}, [{}]);
        const taskId = tasks[0]!.id;

        const response = await requestSender.updateTaskUserMetadataV1({
          pathParams: { taskId: taskId },
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
      it('should return 500 when the database is unavailable', async function () {
        await endDatabasePool(container);

        const response = await requestSender.updateTaskUserMetadataV1({ pathParams: { taskId: faker.string.uuid() as TaskId }, requestBody: {} });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({ status: StatusCodes.INTERNAL_SERVER_ERROR, body: { code: 'DATABASE_RELATED_ERROR' } });
      });
    });
  });

  describe('#addTasks', function () {
    describe('Happy Path', function () {
      it('should return 200 and create tasks for stage', async function () {
        const { stage } = await createJobnikTree(drizzle, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const createTasksPayload = {
          data: {},
          userMetadata: {},
        } satisfies TaskCreateModel;

        const response = await requestSender.addTasksV1({
          requestBody: [createTasksPayload],
          pathParams: { stageId: stageId },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.CREATED,
          body: [createTasksPayload],
        });
      });

      it('should count the added tasks as PENDING in the stage summary', async function () {
        const { stage } = await createJobnikTree(drizzle, {}, { summary: defaultStatusCounts }, [], { createStage: true, createTasks: false });

        const response = await requestSender.addTasksV1({
          requestBody: [
            { data: {}, userMetadata: {} },
            { data: {}, userMetadata: {} },
          ],
          pathParams: { stageId: stage.id },
        });

        expect(response).toHaveProperty('status', StatusCodes.CREATED);

        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stage.id } });

        expect(getStageResponse.body).toHaveProperty('summary', { ...defaultStatusCounts, pending: 2, total: 2 });
      });

      it('should return 200 and create new tasks for stage with existing tasks', async function () {
        const { stage } = await createJobnikTree(drizzle, {}, {}, [
          { status: TaskOperationStatus.COMPLETED, xstate: completedStageXstatePersistentSnapshot },
        ]);

        const stageId = stage.id;

        const createTasksPayload = {
          data: {},
          userMetadata: {},
        } satisfies TaskCreateModel;

        const response = await requestSender.addTasksV1({
          requestBody: [createTasksPayload],
          pathParams: { stageId: stageId },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.CREATED,
          body: [createTasksPayload],
        });
      });

      it('should return 201 and create tasks with generated traceparent from active span', async function () {
        const { stage } = await createJobnikTree(drizzle, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const createTasksPayload = {
          data: {},
          userMetadata: {},
        } satisfies TaskCreateModel;

        const createTaskResponse = await requestSender.addTasksV1({
          requestBody: [createTasksPayload],
          pathParams: { stageId: stageId },
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
        const { stage } = await createJobnikTree(drizzle, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const createTasksPayload = {
          data: {},
          userMetadata: {},
          traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
          tracestate: 'foo=bar',
        } satisfies TaskCreateModel;

        const createTaskResponse = await requestSender.addTasksV1({
          requestBody: [createTasksPayload],
          pathParams: { stageId: stageId },
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
        const { stage } = await createJobnikTree(drizzle, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const createTasksPayload = {
          data: {},
          userMetadata: {},
          traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
        } satisfies TaskCreateModel;

        const createTaskResponse = await requestSender.addTasksV1({
          requestBody: [createTasksPayload],
          pathParams: { stageId: stageId },
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
        const addTasksResponse = await requestSender.addTasksV1({ requestBody: [], pathParams: { stageId: 'someInvalidStageId' as StageId } });

        expect(addTasksResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/params\/stageId must match format "uuid"/) as string, code: 'VALIDATION_ERROR' },
        });
      });

      it('should return 400 when request body is incorrect', async function () {
        const { stage } = await createJobnikTree(drizzle, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const addTasksResponse = await requestSender.addTasksV1({
          pathParams: { stageId: stageId },
          requestBody: {} as unknown as [],
        });

        expect(addTasksResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/body must be array/) as string, code: 'VALIDATION_ERROR' },
        });
      });

      it('should return 400 when attempting to add tasks to a finalized stage', async function () {
        const { stage } = await createJobnikTree(
          drizzle,
          {},
          { status: StageOperationStatus.ABORTED, xstate: abortedStageXstatePersistentSnapshot },
          [],
          { createStage: true, createTasks: false }
        );
        const stageId = stage.id;

        const addTasksResponse = await requestSender.addTasksV1({ requestBody: [], pathParams: { stageId: stageId } });

        expect(addTasksResponse).toSatisfyApiSpec();
        expect(addTasksResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: stagesErrorMessages.stageAlreadyFinishedTasksError, code: 'STAGE_IN_FINITE_STATE' },
        });
      });

      it('should return 400 when attempting to add tasks to a running stage', async function () {
        const { stage } = await createJobnikTree(
          drizzle,
          { xstate: inProgressStageXstatePersistentSnapshot, status: JobOperationStatus.IN_PROGRESS, traceparent: DEFAULT_TRACEPARENT },
          { xstate: inProgressStageXstatePersistentSnapshot, status: JobOperationStatus.IN_PROGRESS },
          [],
          { createStage: true, createTasks: false }
        );
        const stageId = stage.id;

        const addTasksResponse = await requestSender.addTasksV1({ requestBody: [], pathParams: { stageId: stageId } });

        expect(addTasksResponse).toSatisfyApiSpec();
        expect(addTasksResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: tasksErrorMessages.addTaskNotAllowed, code: 'NOT_ALLOWED_TO_ADD_TASKS_TO_IN_PROGRESS_STAGE' },
        });
      });

      it('should return 400 when traceparent format is invalid', async function () {
        const { stage } = await createJobnikTree(drizzle, {}, {}, [], { createStage: true, createTasks: false });
        const stageId = stage.id;

        const createTasksPayload = {
          data: {},
          userMetadata: {},
          traceparent: 'INVALID_TRACEPARENT',
        } satisfies TaskCreateModel;

        const createTaskResponse = await requestSender.addTasksV1({
          requestBody: [createTasksPayload],
          pathParams: { stageId: stageId },
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
          pathParams: { stageId: faker.string.uuid() as StageId },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: stagesErrorMessages.stageNotFound, code: 'STAGE_NOT_FOUND' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 when the database is unavailable', async function () {
        await endDatabasePool(container);

        const response = await requestSender.addTasksV1({
          requestBody: [],
          pathParams: { stageId: faker.string.uuid() as StageId },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({ status: StatusCodes.INTERNAL_SERVER_ERROR, body: { code: 'DATABASE_RELATED_ERROR' } });
      });

      it('should return 500 and roll back the created tasks when updating the stage summary fails', async function () {
        const { stage } = await createJobnikTree(drizzle, {}, {}, [], { createStage: true, createTasks: false });
        // the stage summary is updated after the tasks are inserted, so failing it proves the insert is rolled back
        const dbError = new DrizzleQueryError('update "job_manager"."stage"', [], new Error('stage summary update failed'));
        vi.spyOn(container.resolve(StageRepository), 'updateStageSummary').mockRejectedValueOnce(dbError);

        const response = await requestSender.addTasksV1({
          requestBody: [{ data: {}, userMetadata: {} }],
          pathParams: { stageId: stage.id },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { code: 'DATABASE_RELATED_ERROR' },
        });
        await expect(drizzle.$count(taskTable, eq(taskTable.stageId, stage.id))).resolves.toBe(0);
        await expect(drizzle.query.stage.findFirst({ where: { id: { eq: stage.id } } })).resolves.toHaveProperty('summary', stage.summary);
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
          drizzle,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary: initialSummary },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot }]
        );

        const taskId = tasks[0]!.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId: taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stage.id } });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(getTaskResponse.body).toMatchObject(updateStatusInput);
        expect(getStageResponse.body).toMatchObject({ summary: expectedSummary });
      });

      it('should update task to COMPLETED and add endTime', async function () {
        const updateStatusInput = { status: TaskOperationStatus.COMPLETED };

        const { tasks } = await createJobnikTree(
          drizzle,
          {},
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot }]
        );

        const taskId = tasks[0]!.id;
        const getTaskResponseBeforeUpdate = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId: taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(getTaskResponseBeforeUpdate.body).not.toHaveProperty('endTime');
        expect(getTaskResponse.body).toHaveProperty('endTime');
      });

      it('should update task to FAILED and add endTime', async function () {
        const updateStatusInput = { status: TaskOperationStatus.FAILED };

        const { tasks } = await createJobnikTree(
          drizzle,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            summary: { ...defaultStatusCounts, total: 1, inProgress: 1 },
          },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, maxAttempts: 1 }]
        );

        const taskId = tasks[0]!.id;
        const getTaskResponseBeforeUpdate = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId: taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });

        expect(updateStatusResponse).toSatisfyApiSpec();
        expect(getTaskResponseBeforeUpdate.body).not.toHaveProperty('endTime');
        expect(getTaskResponse.body).toHaveProperty('endTime');
      });

      it('should update task to COMPLETED without completing stage', async function () {
        const initialSummary = { ...defaultStatusCounts, total: 1000, completed: 998, inProgress: 1, pending: 1 };
        const expectedSummary = { ...defaultStatusCounts, total: 1000, completed: 999, inProgress: 0, pending: 1 };
        const updateStatusInput = { status: TaskOperationStatus.COMPLETED };

        const { stage, tasks } = await createJobnikTree(
          drizzle,
          {},
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary: initialSummary },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, maxAttempts: 1 }]
        );

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId: taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stageId } });

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
          drizzle,
          {},
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary: initialSummary },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, maxAttempts: 2, attempts: 0 }]
        );

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId: taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stageId } });

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
          drizzle,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary: initialSummary },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, maxAttempts: 2, attempts: 1 }]
        );

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId: taskId },
          requestBody: updateStatusInput,
        });
        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stageId } });

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
          drizzle,
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
          pathParams: { taskId: taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stageId } });

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
          drizzle,
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
          pathParams: { taskId: taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stageId } });
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
          drizzle,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary: initialSummary },
          [{ status: TaskOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot }]
        );

        const taskId = tasks[0]!.id;
        const stageId = stage.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId: taskId },
          requestBody: updateStatusInput,
        });

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stageId } });
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
          drizzle,
          {},
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          [{ status: TaskOperationStatus.CREATED }]
        );

        const taskId = tasks[0]!.id;

        const updateStatusResponse = await requestSender.updateTaskStatusV1({
          pathParams: { taskId: taskId },
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
          pathParams: { taskId: 'badUuid' as TaskId },
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
          pathParams: { taskId: faker.string.uuid() as TaskId },
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
      it('should return 500 when the database is unavailable', async function () {
        await endDatabasePool(container);

        const response = await requestSender.updateTaskStatusV1({
          pathParams: { taskId: faker.string.uuid() as TaskId },
          requestBody: { status: TaskOperationStatus.COMPLETED },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({ status: StatusCodes.INTERNAL_SERVER_ERROR, body: { code: 'DATABASE_RELATED_ERROR' } });
      });
    });
  });

  describe('#dequeue', function () {
    describe('Happy Path', function () {
      it('should return 200 with available task', async function () {
        const initialSummary = { ...defaultStatusCounts, pending: 1, total: 1 };

        const { stage, tasks } = await createJobnikTree(
          drizzle,
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

        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stageId } });

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
          drizzle,
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

        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stageId } });

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
          drizzle,
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

        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stageId } });
        const getJobResponse = await requestSender.getJobByIdV1({ pathParams: { jobId: jobId } });

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
          drizzle
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
          drizzle
        );
        const tasksLowPriority = await createTaskRecords(
          [{ ...createTaskBody, stageId: stageLowPriority.id, status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }],
          drizzle
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
          drizzle
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
          drizzle
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
          drizzle
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
          drizzle
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
          drizzle
        );
        const tasksHighPriority = await createTaskRecords(
          [{ ...createTaskBody, stageId: stageHighPriority.id, status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }],
          drizzle
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

      it('should return the highest-priority eligible task, skipping higher-priority tasks under a paused job or a waiting stage', async function () {
        const stageType = 'SOME_TEST_TYPE_DEQUEUE_ELIGIBLE_PRIORITY';
        const pendingTask = { status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot };
        const summary = { ...defaultStatusCounts, pending: 1, total: 1 };

        await createJobnikTree(
          drizzle,
          { status: JobOperationStatus.PAUSED, priority: Priority.VERY_HIGH },
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary, type: stageType },
          [pendingTask]
        );
        await createJobnikTree(
          drizzle,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, priority: Priority.VERY_HIGH },
          { status: StageOperationStatus.WAITING, summary, type: stageType },
          [pendingTask]
        );
        const { tasks: lowPriorityTasks } = await createJobnikTree(
          drizzle,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, priority: Priority.VERY_LOW },
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary, type: stageType },
          [pendingTask]
        );
        const { stage: highPriorityStage, tasks: highPriorityTasks } = await createJobnikTree(
          drizzle,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, priority: Priority.HIGH },
          { status: StageOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, summary, type: stageType },
          [pendingTask]
        );

        const firstResponse = await requestSender.dequeueTaskV1({ pathParams: { stageType } });
        const secondResponse = await requestSender.dequeueTaskV1({ pathParams: { stageType } });
        const thirdResponse = await requestSender.dequeueTaskV1({ pathParams: { stageType } });

        expect(firstResponse).toSatisfyApiSpec();
        expect(firstResponse).toMatchObject({
          status: StatusCodes.OK,
          body: { id: highPriorityTasks[0]!.id, stageId: highPriorityStage.id, status: TaskOperationStatus.IN_PROGRESS },
        });
        expect(secondResponse).toMatchObject({ status: StatusCodes.OK, body: { id: lowPriorityTasks[0]!.id } });
        expect(thirdResponse).toHaveProperty('status', StatusCodes.NOT_FOUND);
      });

      it('should add startTime when dequeuing task', async function () {
        const initialSummary = { ...defaultStatusCounts, pending: 1, total: 1 };

        const { stage, tasks } = await createJobnikTree(
          drizzle,
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
        const getTaskResponseBeforeDequeue = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });

        const dequeueResponse = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_STARTIME_CHECK' },
        });

        // Get task after dequeue to verify it has startTime
        const getTaskResponseAfterDequeue = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });

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
          drizzle,
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
        const getTaskResponseBeforeDequeue = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });
        const taskBeforeDequeue = getTaskResponseBeforeDequeue.body as TaskModel;
        const previousStartTime = taskBeforeDequeue.startTime;

        const dequeueResponse = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_TYPE_RETRIED_STARTIME' },
        });

        // Get task after dequeue to verify startTime was updated
        const getTaskResponseAfterDequeue = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });
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
        await drizzle.execute(sql`TRUNCATE TABLE "job_manager"."task" CASCADE;`);

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
        await drizzle.execute(sql`TRUNCATE TABLE "job_manager"."task" CASCADE;`);
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
        await drizzle.execute(sql`TRUNCATE TABLE "job_manager"."task" CASCADE;`);
        const initialSummary = { ...defaultStatusCounts, inProgress: 1, total: 1 };

        await createJobnikTree(
          drizzle,
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

      it.each([
        { stageStatus: StageOperationStatus.CREATED },
        { stageStatus: StageOperationStatus.WAITING },
        { stageStatus: StageOperationStatus.COMPLETED },
        { stageStatus: StageOperationStatus.FAILED },
        { stageStatus: StageOperationStatus.ABORTED },
      ])('should return 404 when the only PENDING task belongs to a $stageStatus stage', async function ({ stageStatus }) {
        await createJobnikTree(
          drizzle,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          { status: stageStatus, summary: { ...defaultStatusCounts, pending: 1, total: 1 }, type: 'SOME_TEST_TYPE_INELIGIBLE_STAGE' },
          [{ status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }]
        );

        const taskResponse = await requestSender.dequeueTaskV1({ pathParams: { stageType: 'SOME_TEST_TYPE_INELIGIBLE_STAGE' } });

        expect(taskResponse).toSatisfyApiSpec();
        expect(taskResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: tasksErrorMessages.taskNotFound, code: 'TASK_NOT_FOUND' },
        });
      });

      it.each([
        { jobStatus: JobOperationStatus.CREATED },
        { jobStatus: JobOperationStatus.PAUSED },
        { jobStatus: JobOperationStatus.COMPLETED },
        { jobStatus: JobOperationStatus.FAILED },
        { jobStatus: JobOperationStatus.ABORTED },
      ])('should return 404 when the only PENDING task belongs to a $jobStatus job', async function ({ jobStatus }) {
        await createJobnikTree(
          drizzle,
          { status: jobStatus },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            summary: { ...defaultStatusCounts, pending: 1, total: 1 },
            type: 'SOME_TEST_TYPE_INELIGIBLE_JOB',
          },
          [{ status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }]
        );

        const taskResponse = await requestSender.dequeueTaskV1({ pathParams: { stageType: 'SOME_TEST_TYPE_INELIGIBLE_JOB' } });

        expect(taskResponse).toSatisfyApiSpec();
        expect(taskResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: tasksErrorMessages.taskNotFound, code: 'TASK_NOT_FOUND' },
        });
      });

      it('should return 404 when the only task of the stage type is still CREATED', async function () {
        await createJobnikTree(
          drizzle,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            summary: { ...defaultStatusCounts, created: 1, total: 1 },
            type: 'SOME_TEST_TYPE_CREATED_TASK',
          },
          [{ status: TaskOperationStatus.CREATED }]
        );

        const taskResponse = await requestSender.dequeueTaskV1({ pathParams: { stageType: 'SOME_TEST_TYPE_CREATED_TASK' } });

        expect(taskResponse).toSatisfyApiSpec();
        expect(taskResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: tasksErrorMessages.taskNotFound, code: 'TASK_NOT_FOUND' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 when the database is unavailable', async function () {
        await endDatabasePool(container);

        const response = await requestSender.dequeueTaskV1({
          pathParams: { stageType: 'SOME_TEST_NAME' },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({ status: StatusCodes.INTERNAL_SERVER_ERROR, body: { code: 'DATABASE_RELATED_ERROR' } });
      });

      it('should return 500 when transaction fails', async function () {
        const initialSummary = { ...defaultStatusCounts, pending: 1, total: 1 };

        const { job, stage, tasks } = await createJobnikTree(
          drizzle,
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

        const getTaskResponse = await requestSender.getTaskByIdV1({ pathParams: { taskId: taskId } });
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stageId } });
        const getJobResponse = await requestSender.getJobByIdV1({ pathParams: { jobId: jobId } });

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
          drizzle,
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

      it('should never hand the same task to concurrent dequeue calls', async function () {
        const taskCount = 5;
        const concurrentDequeues = 8;
        const stageType = 'SOME_TEST_TYPE_CONCURRENT_DEQUEUE';

        const { stage, tasks } = await createJobnikTree(
          drizzle,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            summary: { ...defaultStatusCounts, pending: taskCount, total: taskCount },
            type: stageType,
          },
          Array.from({ length: taskCount }, () => ({ status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }))
        );

        const responses = await Promise.all(
          Array.from({ length: concurrentDequeues }, async () => requestSender.dequeueTaskV1({ pathParams: { stageType } }))
        );

        const okStatus: number = StatusCodes.OK;
        const notFoundStatus: number = StatusCodes.NOT_FOUND;
        const dequeuedIds = responses.filter((response) => response.status === okStatus).map((response) => (response.body as TaskModel).id);
        const otherStatuses = responses.filter((response) => response.status !== okStatus).map((response) => response.status);

        expect(dequeuedIds.length).toBeGreaterThan(0);
        expect(new Set(dequeuedIds).size).toBe(dequeuedIds.length);
        expect(tasks.map((task) => task.id)).toIncludeAllMembers(dequeuedIds);
        expect(otherStatuses).toSatisfyAll((status: number) => status === notFoundStatus);

        await expect(
          drizzle.$count(taskTable, and(eq(taskTable.stageId, stage.id), eq(taskTable.status, TaskOperationStatus.IN_PROGRESS)))
        ).resolves.toBe(dequeuedIds.length);
        await expect(drizzle.query.stage.findFirst({ where: { id: { eq: stage.id } } })).resolves.toHaveProperty('summary', {
          ...defaultStatusCounts,
          pending: taskCount - dequeuedIds.length,
          inProgress: dequeuedIds.length,
          total: taskCount,
        });
      });

      it('should return 409 CONFLICT when dequeue encounters race condition during task update', async function () {
        const initialSummary = { ...defaultStatusCounts, pending: 1, total: 1 };

        const { tasks } = await createJobnikTree(
          drizzle,
          { status: JobOperationStatus.IN_PROGRESS, xstate: inProgressStageXstatePersistentSnapshot, traceparent: DEFAULT_TRACEPARENT },
          {
            status: StageOperationStatus.IN_PROGRESS,
            xstate: inProgressStageXstatePersistentSnapshot,
            summary: initialSummary,
            type: 'SOME_TEST_TYPE_DEQUEUE_RACE_CONFLICT',
          },
          [{ status: TaskOperationStatus.PENDING, xstate: pendingStageXstatePersistentSnapshot }]
        );

        // Skip the task's update, as if the task was modified between lock and update - no rows are updated
        const updateTaskSpy = vi.spyOn(container.resolve(TaskRepository), 'updateTaskIfStatusUnchanged').mockResolvedValueOnce(undefined);

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
        expect(updateTaskSpy).toHaveBeenCalledWith(tasks[0]!.id, TaskOperationStatus.PENDING, expect.anything(), expect.anything());
      });

      it('should handle multiple concurrent updateStatus operations with race condition protection', async function () {
        expect.assertions(4);

        const initialSummary = { ...defaultStatusCounts, inProgress: 1, total: 1 };

        const { tasks } = await createJobnikTree(
          drizzle,
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

        // Hold the task's row lock, so both updates read the task and then block on their UPDATE
        let releaseLock!: () => void;
        const lockReleased = new Promise<void>((resolve) => {
          releaseLock = resolve;
        });
        let signalLockHeld!: () => void;
        const lockHeld = new Promise<void>((resolve) => {
          signalLockHeld = resolve;
        });
        const lockHolder = drizzle.transaction(async (tx) => {
          await tx.execute(sql`SELECT 1 FROM "job_manager"."task" WHERE id = ${taskId}::uuid FOR UPDATE`);
          signalLockHeld();
          await lockReleased;
        });
        await lockHeld;

        // Start both update operations concurrently (simulating 2 workers completing the same task)
        const updatePromises = [
          requestSender.updateTaskStatusV1({ pathParams: { taskId: taskId }, requestBody: { status: TaskOperationStatus.COMPLETED } }),
          requestSender.updateTaskStatusV1({ pathParams: { taskId: taskId }, requestBody: { status: TaskOperationStatus.COMPLETED } }),
        ];

        await waitForBlockedTaskUpdates(drizzle, updatePromises.length);
        releaseLock();
        await lockHolder;

        const responses = await Promise.all(updatePromises);
        const okStatus: number = StatusCodes.OK;
        const okResponse = responses.find((response) => response.status === okStatus);
        const conflictResponse = responses.find((response) => response.status !== okStatus);

        // One update succeeds - task transitioned from IN_PROGRESS to COMPLETED
        expect(okResponse).toSatisfyApiSpec();
        expect(okResponse).toMatchObject({
          status: StatusCodes.OK,
          body: {
            id: taskId,
            status: TaskOperationStatus.COMPLETED,
          },
        });

        // The other fails because the task is no longer IN_PROGRESS
        // The optimistic locking prevents duplicate completion
        expect(conflictResponse).toSatisfyApiSpec();
        expect(conflictResponse).toMatchObject({
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
