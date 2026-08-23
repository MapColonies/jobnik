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
import { JobOperationStatus, StageOperationStatus, TaskOperationStatus, type PrismaClient } from '@prismaClient';
import type { PrismaTransaction } from '@src/db/types';
import { getApp } from '@src/app';
import { SERVICES } from '@common/constants';
import { initConfig } from '@src/common/config';
import { errorMessages as jobsErrorMessages } from '@src/jobs/models/errors';
import type { StageCreateModel, StageModel, StagesPaginatedResponse } from '@src/stages/models/models';
import { errorMessages as stagesErrorMessages } from '@src/stages/models/errors';
import { defaultStatusCounts } from '@src/stages/models/helper';
import {
  abortedStageXstatePersistentSnapshot,
  abortedXstatePersistentSnapshot,
  completedStageXstatePersistentSnapshot,
  failedStageXstatePersistentSnapshot,
  inProgressStageXstatePersistentSnapshot,
  pendingStageXstatePersistentSnapshot,
} from '@tests/unit/data';
import { DEFAULT_TRACEPARENT } from '@src/common/utils/tracingHelpers';
import { illegalStatusTransitionErrorMessage } from '@src/common/errors';
import { createProxyMock } from '@tests/configurations/mockPrisma';
import { createJobRecord, createJobRequestBody, testJobId, testStageId } from '../jobs/helpers';
import { createJobnikTree, createMockPrismaError, createMockUnknownDbError, truncateAllTables } from '../common/utils';

const expectResponseStatus: ExpectResponseStatus = expectResponseStatusFactory(expect);

describe('stage', function () {
  let requestSender: RequestSender<paths, operations>;
  let prisma: PrismaClient;

  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  const provider = new NodeTracerProvider({ spanProcessors: [spanProcessor] });
  provider.register();

  const dumpUuid = faker.string.uuid();

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

  describe('#getStages', function () {
    describe('Happy Path', function () {
      it('should return 200 status code and the matching stage', async function () {
        const { job } = await createJobnikTree(prisma, {}, { type: 'SOME_STAGE_TYPE', data: { avi: 'is the best' } }, [], {
          createStage: true,
          createTasks: false,
        });
        const jobId = job.id;

        const response = await requestSender.getStagesV1({ queryParams: { job_id: jobId } });

        expect(response).toMatchObject({
          status: StatusCodes.OK,
          body: {
            total: 1,
            items: [
              {
                jobId,
                status: StageOperationStatus.CREATED,
                type: 'SOME_STAGE_TYPE',
                data: { avi: 'is the best' },
                order: 1,
              },
            ],
          },
        });
      });

      it('should return 200 status code and empty array', async function () {
        const response = await requestSender.getStagesV1({ queryParams: { job_id: faker.string.uuid() } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.OK,
          body: { total: 0, items: [] },
        });
      });

      it('should return 200 status code and all the stages if no query params were defined', async function () {
        await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });

        const response = await requestSender.getStagesV1();

        expect(response).toSatisfyApiSpec();
        expect(response).toHaveProperty('status', StatusCodes.OK);

        const stagesBody = response.body as StagesPaginatedResponse;

        expect(stagesBody.items).toBeArray();
        expect(stagesBody.items).not.toHaveLength(0);
      });

      it('should return 200 with total and items when paginating', async function () {
        await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });
        await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });

        const response = await requestSender.getStagesV1({ queryParams: { page: 1, page_size: 1 } });

        expectResponseStatus(response, 200);

        expect(response).toSatisfyApiSpec();

        const paginatedBody = response.body;

        expect(paginatedBody.total).toBeGreaterThanOrEqual(2);
        expect(paginatedBody.items).toHaveLength(1);
      });

      it('should return 200 with empty items array when page is beyond total', async function () {
        await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });

        const response = await requestSender.getStagesV1({ queryParams: { page: 9999, page_size: 10 } });

        expectResponseStatus(response, 200);

        expect(response).toSatisfyApiSpec();

        const beyondPageBody = response.body;

        expect(beyondPageBody.items).toHaveLength(0);
      });

      it('should return 200 status code and the matching stage with related tasks', async function () {
        const { job, stage, tasks } = await createJobnikTree(
          prisma,
          { xstate: pendingStageXstatePersistentSnapshot, status: JobOperationStatus.PENDING, traceparent: DEFAULT_TRACEPARENT },
          {
            status: StageOperationStatus.PENDING,
            xstate: pendingStageXstatePersistentSnapshot,
            summary: { ...defaultStatusCounts, total: 1, pending: 1 },
          },
          [{ status: TaskOperationStatus.COMPLETED, xstate: completedStageXstatePersistentSnapshot }]
        );

        const jobId = job.id;

        const response = await requestSender.getStagesV1({ queryParams: { job_id: jobId, should_return_tasks: true } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.OK,
          body: {
            total: 1,
            items: [{ jobId: job.id, status: StageOperationStatus.PENDING, type: stage.type, data: stage.data, userMetadata: stage.userMetadata }],
          },
        });

        const stagesBodyWithTasks = response.body as StagesPaginatedResponse;

        expect(stagesBodyWithTasks.items).toMatchObject([{ tasks: [{ data: tasks[0]!.data, userMetadata: tasks[0]!.userMetadata }] }]);
      });

      it('should return 200 status code and the matching stage without related tasks', async function () {
        const { job, stage } = await createJobnikTree(
          prisma,
          {},
          {
            status: StageOperationStatus.PENDING,
            xstate: pendingStageXstatePersistentSnapshot,
            summary: { ...defaultStatusCounts, total: 1, pending: 1 },
          },
          [{}]
        );

        const response = await requestSender.getStagesV1({ queryParams: { job_id: job.id, should_return_tasks: false } });

        expectResponseStatus(response, 200);

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.OK,
          body: {
            total: 1,
            items: [{ jobId: job.id, status: StageOperationStatus.PENDING, type: stage.type, data: stage.data, userMetadata: stage.userMetadata }],
          },
        });

        const stagesBodyNoTasks = response.body;

        expect(stagesBodyNoTasks.items[0]).not.toHaveProperty('tasks');
      });
    });

    describe('Bad Path', function () {
      it('should return 400 status code and a relevant validation error message when the stage type is larger than 50 characters', async function () {
        const longStageType = faker.string.alpha(51);
        const response = await requestSender.getStagesV1({ queryParams: { stage_type: longStageType } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: {
            message: expect.stringMatching(/request\/query\/stage_type must NOT have more than 50 characters/) as string,
            code: 'VALIDATION_ERROR',
          },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 status code when the database driver throws an error', async function () {
        const error = createMockPrismaError();
        const findManySpy = createProxyMock(prisma.stage, 'findMany');
        findManySpy.mockRejectedValueOnce(error);

        const response = await requestSender.getStagesV1({});

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 status code when the database driver throws an unexpected error', async function () {
        const error = createMockUnknownDbError();
        const findManySpy = createProxyMock(prisma.stage, 'findMany');
        findManySpy.mockRejectedValueOnce(error);

        const response = await requestSender.getStagesV1({});

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'UNKNOWN_ERROR' },
        });
      });
    });
  });

  describe('#getStageById', function () {
    describe('Happy Path', function () {
      it('should return 200 status code and return the stage', async function () {
        const { stage } = await createJobnikTree(
          prisma,
          {},
          {
            type: 'SOME_HAPPY_PATH_STAGE_TYPE',
          },
          [{}]
        );

        const getStageResponse = await requestSender.getStageByIdV1({
          pathParams: { stageId: stage.id },
          queryParams: { should_return_tasks: undefined },
        });

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({
          status: StatusCodes.OK,
          body: { status: StageOperationStatus.CREATED, type: 'SOME_HAPPY_PATH_STAGE_TYPE' },
        });
        expect(getStageResponse.body).not.toHaveProperty('tasks');
      });

      it('should return 200 status code and return the stage with related tasks', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [
          { status: TaskOperationStatus.COMPLETED, xstate: completedStageXstatePersistentSnapshot, userMetadata: { some: 'metadata' } },
        ]);

        const getStageResponse = await requestSender.getStageByIdV1({
          pathParams: { stageId: stage.id },
          queryParams: { should_return_tasks: true },
        });

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({ status: StatusCodes.OK, body: { status: StageOperationStatus.CREATED, id: stage.id } });
        expect(getStageResponse.body).toHaveProperty('tasks');
        expect(getStageResponse.body).toMatchObject({ tasks: [{ data: {}, userMetadata: { some: 'metadata' } }] });
      });

      it('should return 200 status code and return the stage without related tasks', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [
          { status: TaskOperationStatus.COMPLETED, xstate: completedStageXstatePersistentSnapshot, userMetadata: { some: 'metadata' } },
        ]);

        const getStageResponse = await requestSender.getStageByIdV1({
          pathParams: { stageId: stage.id },
          queryParams: { should_return_tasks: false },
        });

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({ status: StatusCodes.OK, body: { status: StageOperationStatus.CREATED, id: stage.id } });
        expect(getStageResponse.body).not.toHaveProperty('tasks');
      });
    });

    describe('Bad Path', function () {
      it('should return a 404 status code with a validation error message if the requested stage does not exist', async function () {
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: faker.string.uuid() } });

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: stagesErrorMessages.stageNotFound, code: 'STAGE_NOT_FOUND' },
        });
      });

      it('should return status code 400 when supplying bad uuid as part of the request', async function () {
        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: 'someInvalidJobId' } });

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/params\/stageId must match format "uuid"/) as string, code: 'VALIDATION_ERROR' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 status code when the database driver throws an error', async function () {
        const error = createMockPrismaError();
        const findUniqueSpy = createProxyMock(prisma.stage, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.getStageByIdV1({ pathParams: { stageId: dumpUuid } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 status code when the database driver throws an unexpected error', async function () {
        const error = createMockUnknownDbError();
        const findUniqueSpy = createProxyMock(prisma.stage, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.getStageByIdV1({ pathParams: { stageId: dumpUuid } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'UNKNOWN_ERROR' },
        });
      });
    });
  });

  describe('#getStagesByJobId', function () {
    describe('Happy Path', function () {
      it('should return 200 status code and return the stages', async function () {
        const { stage, job } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });

        const getStageResponse = await requestSender.getStagesByJobIdV1({ pathParams: { jobId: job.id } });

        expectResponseStatus(getStageResponse, 200);

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({ status: StatusCodes.OK, body: [{ status: StageOperationStatus.CREATED, id: stage.id }] });
        expect(getStageResponse.body[0]).not.toHaveProperty('tasks');
      });

      it('should return 200 status code and return the stages with related tasks', async function () {
        const { stage, job } = await createJobnikTree(prisma, {}, {}, [
          { status: TaskOperationStatus.COMPLETED, xstate: completedStageXstatePersistentSnapshot },
        ]);

        const getStageResponse = await requestSender.getStagesByJobIdV1({
          pathParams: { jobId: job.id },
          queryParams: { should_return_tasks: true },
        });

        expectResponseStatus(getStageResponse, 200);

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({ status: StatusCodes.OK, body: [{ status: StageOperationStatus.CREATED, id: stage.id }] });
        expect(getStageResponse.body[0]).toHaveProperty('tasks');
        expect(getStageResponse.body[0]).toMatchObject({ tasks: [{ data: {}, userMetadata: {} }] });
      });

      it('should return 200 status code and return the stages without related tasks', async function () {
        const { stage, job } = await createJobnikTree(prisma, {}, {}, [
          { status: TaskOperationStatus.COMPLETED, xstate: completedStageXstatePersistentSnapshot },
        ]);

        const getStageResponse = await requestSender.getStagesByJobIdV1({
          pathParams: { jobId: job.id },
          queryParams: { should_return_tasks: false },
        });

        expectResponseStatus(getStageResponse, 200);

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({ status: StatusCodes.OK, body: [{ status: StageOperationStatus.CREATED, id: stage.id }] });
        expect(getStageResponse.body[0]).not.toHaveProperty('tasks');
      });

      it('should return a 200 status code with empty array object if no stages exists for the requested job', async function () {
        const { job } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        const getStageResponse = await requestSender.getStagesByJobIdV1({ pathParams: { jobId: job.id } });

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({
          status: StatusCodes.OK,
          body: [],
        });
      });

      it('should return stages ordered by the order field', async function () {
        const job = await createJobRecord(createJobRequestBody, prisma);
        const createdJobId = job.id;

        // Create multiple stages for the same job using API endpoints to ensure proper order assignment
        await requestSender.addStageV1({
          pathParams: { jobId: createdJobId },
          requestBody: {
            type: 'FIRST_STAGE',
            data: {},
            userMetadata: {},
          },
        });

        await requestSender.addStageV1({
          pathParams: { jobId: createdJobId },
          requestBody: {
            type: 'SECOND_STAGE',
            data: {},
            userMetadata: {},
          },
        });

        await requestSender.addStageV1({
          pathParams: { jobId: createdJobId },
          requestBody: {
            type: 'THIRD_STAGE',
            data: {},
            userMetadata: {},
          },
        });

        const getStageResponse = await requestSender.getStagesByJobIdV1({ pathParams: { jobId: createdJobId } });

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({
          status: StatusCodes.OK,
          body: [
            { type: 'FIRST_STAGE', order: 1 },
            { type: 'SECOND_STAGE', order: 2 },
            { type: 'THIRD_STAGE', order: 3 },
          ],
        });
      });
    });

    describe('Bad Path', function () {
      it('should return status code 400 when supplying bad uuid', async function () {
        const getStageResponse = await requestSender.getStagesByJobIdV1({ pathParams: { jobId: 'someInvalidJobId' } });

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/params\/jobId must match format "uuid"/) as string, code: 'VALIDATION_ERROR' },
        });
      });

      it('should return status code 404 when a job with the given uuid does not exists', async function () {
        const getStageResponse = await requestSender.getStagesByJobIdV1({ pathParams: { jobId: faker.string.uuid() } });

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: jobsErrorMessages.jobNotFound, code: 'JOB_NOT_FOUND' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 status code when the database driver throws an error', async function () {
        const error = createMockPrismaError();
        const findUniqueSpy = createProxyMock(prisma.job, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.getStagesByJobIdV1({ pathParams: { jobId: faker.string.uuid() } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 status code when the database driver throws an unexpected error', async function () {
        const error = createMockUnknownDbError();
        const findUniqueSpy = createProxyMock(prisma.job, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.getStagesByJobIdV1({ pathParams: { jobId: faker.string.uuid() } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'UNKNOWN_ERROR' },
        });
      });
    });
  });

  describe('#getSummary', function () {
    describe('Happy Path', function () {
      it("should return 200 status code and return the stage's summary", async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });

        const getStageResponse = await requestSender.getStageSummaryV1({ pathParams: { stageId: stage.id } });

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({ status: StatusCodes.OK, body: defaultStatusCounts });
      });
    });

    describe('Bad Path', function () {
      it("should return a 404 status code and a validation error indicating the stage's non-existence should be returned", async function () {
        const getStageResponse = await requestSender.getStageSummaryV1({ pathParams: { stageId: dumpUuid } });

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: stagesErrorMessages.stageNotFound, code: 'STAGE_NOT_FOUND' },
        });
      });

      it('should return status code 400 when supplying bad uuid as part of the request', async function () {
        const getStageResponse = await requestSender.getStageSummaryV1({ pathParams: { stageId: 'someInvalidJobId' } });

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/params\/stageId must match format "uuid"/) as string, code: 'VALIDATION_ERROR' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 status code when the database driver throws an error', async function () {
        const error = createMockPrismaError();
        const findUniqueSpy = createProxyMock(prisma.stage, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.getStageSummaryV1({ pathParams: { stageId: dumpUuid } });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 status code when the database driver throws an unexpected error', async function () {
        const error = createMockUnknownDbError();
        const findUniqueSpy = createProxyMock(prisma.stage, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.getStageSummaryV1({ pathParams: { stageId: dumpUuid } });

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
      it("should return 201 status code and modify stages's userMetadata object", async function () {
        const userMetadataInput = { someTestKey: 'someTestData' };

        const { stage } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });

        const updateUserMetadataResponse = await requestSender.updateStageUserMetadataV1({
          pathParams: { stageId: stage.id },
          requestBody: userMetadataInput,
        });

        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stage.id } });

        expect(updateUserMetadataResponse).toSatisfyApiSpec();
        expect(getStageResponse.body).toMatchObject({ userMetadata: userMetadataInput });
      });
    });

    describe('Bad Path', function () {
      it('should return a 404 status code along with a message that specifies that a stage with the given id was not found', async function () {
        const getStageResponse = await requestSender.updateStageUserMetadataV1({ pathParams: { stageId: dumpUuid }, requestBody: { avi: 'avi' } });

        expect(getStageResponse).toSatisfyApiSpec();
        expect(getStageResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: stagesErrorMessages.stageNotFound, code: 'STAGE_NOT_FOUND' },
        });
      });

      it('should return a 400 status code and a message indicating the request body has an invalid structure', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });

        const response = await requestSender.updateStageUserMetadataV1({
          pathParams: { stageId: stage.id },
          requestBody: 'badInputString' as unknown as { [key: string]: string },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/is not valid JSON/) as string, code: 'VALIDATION_ERROR' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 status code when the database driver throws an error', async function () {
        const error = createMockPrismaError();
        const updateSpy = createProxyMock(prisma.stage, 'update');
        updateSpy.mockRejectedValueOnce(error);

        const response = await requestSender.updateStageUserMetadataV1({ pathParams: { stageId: faker.string.uuid() }, requestBody: {} });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 status code when the database driver throws an unexpected error', async function () {
        const error = createMockUnknownDbError();
        const updateSpy = createProxyMock(prisma.stage, 'update');
        updateSpy.mockRejectedValueOnce(error);

        const response = await requestSender.updateStageUserMetadataV1({ pathParams: { stageId: faker.string.uuid() }, requestBody: {} });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'UNKNOWN_ERROR' },
        });
      });
    });
  });

  describe('#addStage', function () {
    describe('Happy Path', function () {
      it('should return 200 status code and create the related stage for current job', async function () {
        const { job } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        const createStagesPayload = {
          data: {},
          type: 'SOME_ADD_STAGE_TEST_NAME',
          userMetadata: {},
        } satisfies StageCreateModel;

        const addStageResponse = await requestSender.addStageV1({
          requestBody: createStagesPayload,
          pathParams: { jobId: job.id },
        });

        expect(addStageResponse).toSatisfyApiSpec();
        expect(addStageResponse).toMatchObject({
          status: StatusCodes.CREATED,
          body: { ...createStagesPayload, status: StageOperationStatus.PENDING, order: 1 },
        });
      });

      it('should create a stage with WAITING status when startAsWaiting flag is true', async function () {
        const { job } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        const createStagesPayload = {
          data: {},
          type: 'SOME_ADD_STAGE_WAITING_TEST_NAME',
          userMetadata: {},
          startAsWaiting: true,
        } satisfies StageCreateModel;

        const addStageResponse = await requestSender.addStageV1({
          requestBody: createStagesPayload,
          pathParams: { jobId: job.id },
        });

        expect(addStageResponse).toSatisfyApiSpec();
        expect(addStageResponse).toMatchObject({
          status: StatusCodes.CREATED,
          body: { status: StageOperationStatus.WAITING },
        });
      });

      it('should create a stage with PENDING status when startAsWaiting flag is false', async function () {
        const { job } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        const createStagesPayload = {
          data: {},
          type: 'SOME_ADD_STAGE_PENDING_TEST_NAME',
          userMetadata: {},
          startAsWaiting: false,
        } satisfies StageCreateModel;

        const addStageResponse = await requestSender.addStageV1({
          requestBody: createStagesPayload,
          pathParams: { jobId: job.id },
        });

        expect(addStageResponse).toSatisfyApiSpec();
        expect(addStageResponse).toMatchObject({
          status: StatusCodes.CREATED,
          body: { status: StageOperationStatus.PENDING },
        });
      });

      it('should create a stage with CREATED status when not the first stage', async function () {
        const { job } = await createJobnikTree(prisma, {}, { type: 'SOME_STAGE_TYPE', data: { avi: 'is the best' } }, [], {
          createStage: true,
          createTasks: false,
        });

        const createStagesPayload = {
          data: {},
          type: 'SOME_ADD_STAGE_CREATED_TEST_NAME',
          userMetadata: {},
          startAsWaiting: false,
        } satisfies StageCreateModel;

        const addStageResponse = await requestSender.addStageV1({
          requestBody: createStagesPayload,
          pathParams: { jobId: job.id },
        });

        expect(addStageResponse).toSatisfyApiSpec();
        expect(addStageResponse).toMatchObject({
          status: StatusCodes.CREATED,
          body: { status: StageOperationStatus.CREATED, order: 2 },
        });
      });

      it('should create the first stage successfully', async function () {
        const { job } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        const createStagePayload = {
          data: { testData: 'first stage' },
          type: 'FIRST_STAGE_ORDER_TEST',
          userMetadata: { order: 'first' },
        } satisfies StageCreateModel;

        const addStageResponse = await requestSender.addStageV1({
          requestBody: createStagePayload,
          pathParams: { jobId: job.id },
        });

        expect(addStageResponse).toSatisfyApiSpec();
        expect(addStageResponse).toMatchObject({
          status: StatusCodes.CREATED,
          body: {
            ...createStagePayload,
            status: StageOperationStatus.PENDING,
            order: 1,
          },
        });
      });

      it('should create multiple stages successfully for the same job', async function () {
        const { job } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        // Create first stage
        const stage1Payload = {
          data: { testData: 'stage 1' },
          type: 'STAGE_ORDER_TEST_1',
          userMetadata: { sequence: 'first' },
        } satisfies StageCreateModel;

        const stage1Response = await requestSender.addStageV1({
          requestBody: stage1Payload,
          pathParams: { jobId: job.id },
        });

        expect(stage1Response).toMatchObject({
          status: StatusCodes.CREATED,
          body: {
            order: 1,
          },
        });

        // Create second stage
        const stage2Payload = {
          data: { testData: 'stage 2' },
          type: 'STAGE_ORDER_TEST_2',
          userMetadata: { sequence: 'second' },
        } satisfies StageCreateModel;

        const stage2Response = await requestSender.addStageV1({
          requestBody: stage2Payload,
          pathParams: { jobId: job.id },
        });

        expect(stage2Response).toMatchObject({
          status: StatusCodes.CREATED,
          body: {
            order: 2,
          },
        });

        // Create third stage
        const stage3Payload = {
          data: { testData: 'stage 3' },
          type: 'STAGE_ORDER_TEST_3',
          userMetadata: { sequence: 'third' },
        } satisfies StageCreateModel;

        const stage3Response = await requestSender.addStageV1({
          requestBody: stage3Payload,
          pathParams: { jobId: job.id },
        });

        expect(stage3Response).toMatchObject({
          status: StatusCodes.CREATED,
          body: {
            order: 3,
          },
        });
      });

      it('should create stages independently for different jobs', async function () {
        const { job: job1 } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });
        const { job: job2 } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        // Add two stages to job1
        const job1Stage1Payload = {
          data: { job: 'job1' },
          type: 'JOB1_STAGE_1',
          userMetadata: { jobOrder: 'job1-first' },
        } satisfies StageCreateModel;

        const job1Stage2Payload = {
          data: { job: 'job1' },
          type: 'JOB1_STAGE_2',
          userMetadata: { jobOrder: 'job1-second' },
        } satisfies StageCreateModel;

        // Add one stage to job2
        const job2Stage1Payload = {
          data: { job: 'job2' },
          type: 'JOB2_STAGE_1',
          userMetadata: { jobOrder: 'job2-first' },
        } satisfies StageCreateModel;

        // Create stages
        const job1Stage1Response = await requestSender.addStageV1({
          requestBody: job1Stage1Payload,
          pathParams: { jobId: job1.id },
        });

        const job1Stage2Response = await requestSender.addStageV1({
          requestBody: job1Stage2Payload,
          pathParams: { jobId: job1.id },
        });

        const job2Stage1Response = await requestSender.addStageV1({
          requestBody: job2Stage1Payload,
          pathParams: { jobId: job2.id },
        });

        expect(job1Stage1Response).toMatchObject({
          status: StatusCodes.CREATED,
          body: {
            order: 1,
          },
        });

        expect(job1Stage2Response).toMatchObject({
          status: StatusCodes.CREATED,
          body: {
            order: 2,
          },
        });

        expect(job2Stage1Response).toMatchObject({
          status: StatusCodes.CREATED,
          body: {
            order: 1,
          },
        });
      });

      it('should return stages in correct sequence when fetching by job id', async function () {
        const { job } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        // Create multiple stages
        const stages = [
          { type: 'FIRST_STAGE', data: { sequence: 1 } },
          { type: 'SECOND_STAGE', data: { sequence: 2 } },
          { type: 'THIRD_STAGE', data: { sequence: 3 } },
        ];

        for (const stageData of stages) {
          await requestSender.addStageV1({
            requestBody: {
              ...stageData,
              userMetadata: {},
            } satisfies StageCreateModel,
            pathParams: { jobId: job.id },
          });
        }

        // Fetch all stages for the job
        const getStagesResponse = await requestSender.getStagesByJobIdV1({
          pathParams: { jobId: job.id },
        });

        expect(getStagesResponse).toMatchObject({
          status: StatusCodes.OK,
          body: [{ order: 1 }, { order: 2 }, { order: 3 }],
        });
      });

      it('should return 201 status code and add the stage with generated traceparent from active span', async function () {
        const { job } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        const createStagesPayload = {
          data: {},
          type: 'SOME_STAGE_WITHOUT_TRACEPARENT',
          userMetadata: {},
        } satisfies StageCreateModel;

        const addStageResponse = await requestSender.addStageV1({
          requestBody: createStagesPayload,
          pathParams: { jobId: job.id },
        });

        await memoryExporter.forceFlush();
        const addStageSpan = memoryExporter.getFinishedSpans().find((span) => span.name === 'addStage');
        const finishedSpanContext = addStageSpan?.spanContext();

        expect(addStageResponse).toSatisfyApiSpec();
        expect(addStageResponse).toMatchObject({
          status: StatusCodes.CREATED,
          body: { traceparent: `00-${finishedSpanContext?.traceId}-${finishedSpanContext?.spanId}-0${finishedSpanContext?.traceFlags}` },
        });
      });

      it('should return 201 status code and add the stage with provided traceparent and tracestate', async function () {
        const { job } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        const createStagesPayload = {
          data: {},
          type: 'SOME_STAGE_WITH_TRACEPARENT_AND_TRACESTATE',
          userMetadata: {},
          traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
          tracestate: 'foo=bar',
        } satisfies StageCreateModel;

        const addStageResponse = await requestSender.addStageV1({
          requestBody: createStagesPayload,
          pathParams: { jobId: job.id },
        });

        expect(addStageResponse).toSatisfyApiSpec();

        expect(addStageResponse).toMatchObject({
          status: StatusCodes.CREATED,
          body: {
            traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
            tracestate: 'foo=bar',
          },
        });
      });

      it('should return 201 status code and add the stage with provided traceparent without tracestate', async function () {
        const { job } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        const createStagesPayload = {
          data: {},
          type: 'SOME_STAGE_WITH_TRACEPARENT_WITHOUT_TRACESTATE',
          userMetadata: {},
          traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
        } satisfies StageCreateModel;

        const addStageResponse = await requestSender.addStageV1({
          requestBody: createStagesPayload,
          pathParams: { jobId: job.id },
        });

        expect(addStageResponse).toSatisfyApiSpec();
        expect(addStageResponse).toMatchObject({
          status: StatusCodes.CREATED,
          body: {
            status: JobOperationStatus.PENDING,
            traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
          },
        });

        expect(addStageResponse.body).not.toHaveProperty('tracestate');
      });
    });

    describe('Bad Path', function () {
      it('should return status code 400 when supplying bad uuid as part of the request', async function () {
        await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        const addStageResponse = await requestSender.addStageV1({
          requestBody: {
            type: 'DEFAULT',
            data: {},
            userMetadata: {},
          } satisfies StageCreateModel,
          pathParams: { jobId: 'someInvalidJobId' },
        });

        expect(addStageResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/params\/jobId must match format "uuid"/) as string, code: 'VALIDATION_ERROR' },
        });
      });

      it('should return 400 when the request contains an incorrect body', async function () {
        const { job } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        const addStageResponse = await requestSender.addStageV1({
          pathParams: { jobId: job.id },
          requestBody: {} as unknown as StageCreateModel,
        });

        expect(addStageResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/body must have required property 'data'/) as string, code: 'VALIDATION_ERROR' },
        });
      });

      it('should return 400 when attempting to add stage to a finalized job', async function () {
        const { job } = await createJobnikTree(prisma, { xstate: abortedXstatePersistentSnapshot, status: JobOperationStatus.ABORTED }, {}, [], {
          createStage: false,
          createTasks: false,
        });

        const addStageResponse = await requestSender.addStageV1({
          requestBody: { data: {}, userMetadata: {}, type: 'SOME_STAGE_TYPE' } satisfies StageCreateModel,
          pathParams: { jobId: job.id },
        });

        expect(addStageResponse).toSatisfyApiSpec();
        expect(addStageResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: jobsErrorMessages.jobAlreadyFinishedStagesError, code: 'JOB_IN_FINITE_STATE' },
        });
      });

      it('should return 400 when the request contains an invalid traceparent format', async function () {
        const { job } = await createJobnikTree(prisma, {}, {}, [], { createStage: false, createTasks: false });

        const createStagesPayload = {
          data: {},
          type: 'SOME_STAGE_WITH_INVALID_TRACEPARENT',
          userMetadata: {},
          traceparent: 'INVALID_TRACEPARENT',
        } satisfies StageCreateModel;

        const addStageResponse = await requestSender.addStageV1({
          requestBody: createStagesPayload,
          pathParams: { jobId: job.id },
        });

        expect(addStageResponse).toSatisfyApiSpec();
        expect(addStageResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: { message: expect.stringMatching(/request\/body\/traceparent must match pattern/) as string, code: 'VALIDATION_ERROR' },
        });
      });

      it('should return 404 when attempting to update a non-existent job ID', async function () {
        const createStagesPayload = {
          data: {},
          type: 'SOME_STAGE_TYPE',
          userMetadata: {},
        } satisfies StageCreateModel;

        const response = await requestSender.addStageV1({
          requestBody: createStagesPayload,
          pathParams: { jobId: testJobId },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: jobsErrorMessages.jobNotFound, code: 'JOB_NOT_FOUND' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 status code when the database driver throws an error', async function () {
        const error = createMockPrismaError();
        const findUniqueSpy = createProxyMock(prisma.job, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.addStageV1({
          requestBody: { data: {}, type: 'SOME_STAGE_TYPE', userMetadata: {} },
          pathParams: { jobId: testJobId },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 status code when the database driver throws an unexpected error', async function () {
        const error = createMockUnknownDbError();
        const findUniqueSpy = createProxyMock(prisma.job, 'findUnique');
        findUniqueSpy.mockRejectedValueOnce(error);

        const response = await requestSender.addStageV1({
          requestBody: { data: {}, type: 'SOME_STAGE_TYPE', userMetadata: {} },
          pathParams: { jobId: testJobId },
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
      it("should return 200 status code and modify stages's status", async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });

        const setStatusResponse = await requestSender.updateStageStatusV1({
          pathParams: { stageId: stage.id },
          requestBody: { status: StageOperationStatus.PENDING },
        });

        expect(setStatusResponse).toSatisfyApiSpec();
        expect(setStatusResponse).toHaveProperty('status', StatusCodes.OK);

        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stage.id } });

        expect(getStageResponse).toHaveProperty('body.status', StageOperationStatus.PENDING);
      });

      it("should return 201 status code and modify stages's status by order (stage is first ordered before other)", async function () {
        const { stage: stage1 } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });
        const secondStageResponse = await requestSender.addStageV1({
          pathParams: { jobId: stage1.jobId },
          requestBody: { type: 'SECOND_STAGE', data: {}, userMetadata: {} },
        });

        const stage2 = secondStageResponse.body;

        // Sanity check to ensure stage1 has order 1 and stage2 has order 2
        expect(stage1).toHaveProperty('order', 1);
        expect(stage2).toHaveProperty('order', 2);

        const setStatusResponse = await requestSender.updateStageStatusV1({
          pathParams: { stageId: stage1.id },
          requestBody: { status: StageOperationStatus.PENDING },
        });

        expect(setStatusResponse).toSatisfyApiSpec();
        expect(setStatusResponse).toHaveProperty('status', StatusCodes.OK);

        const getStageResponse = await requestSender.getStageByIdV1({ pathParams: { stageId: stage1.id } });

        expect(getStageResponse).toHaveProperty('body.status', StageOperationStatus.PENDING);
      });
    });

    describe('Bad Path', function () {
      it.each([
        {
          fromStatus: StageOperationStatus.COMPLETED,
          fromXstate: completedStageXstatePersistentSnapshot,
        },
        {
          fromStatus: StageOperationStatus.FAILED,
          fromXstate: failedStageXstatePersistentSnapshot,
        },
        {
          fromStatus: StageOperationStatus.ABORTED,
          fromXstate: abortedStageXstatePersistentSnapshot,
        },
        {
          fromStatus: StageOperationStatus.IN_PROGRESS,
          fromXstate: inProgressStageXstatePersistentSnapshot,
        },
      ])('should return 400 with detailed error for invalid status transition ($fromStatus -> PENDING)', async function ({ fromStatus, fromXstate }) {
        const { stage } = await createJobnikTree(prisma, {}, { status: fromStatus, xstate: fromXstate }, [], {
          createStage: true,
          createTasks: false,
        });

        const stageId = stage.id;

        const updateStageResponse = await requestSender.updateStageStatusV1({
          pathParams: { stageId },
          requestBody: { status: StageOperationStatus.PENDING },
        });

        expect(updateStageResponse).toSatisfyApiSpec();
        expect(updateStageResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: {
            message: illegalStatusTransitionErrorMessage(fromStatus, StageOperationStatus.PENDING),
            code: 'ILLEGAL_STAGE_STATUS_TRANSITION',
          },
        });
      });

      it('should return 400 with detailed error for invalid status', async function () {
        const { stage } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });

        const stageId = stage.id;

        const updateStageResponse = await requestSender.updateStageStatusV1({
          pathParams: { stageId },
          requestBody: { status: StageOperationStatus.COMPLETED as unknown as 'PENDING' },
        });

        expect(updateStageResponse).toSatisfyApiSpec();
        expect(updateStageResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: {
            message: expect.stringMatching(/request\/body\/status must be equal to one of the allowed values/) as string,
            code: 'VALIDATION_ERROR',
          },
        });
      });

      it('should return 400 with detailed error for invalid status transition (not ordered stage - CREATED -> PENDING)', async function () {
        const { stage: stage1 } = await createJobnikTree(prisma, {}, {}, [], { createStage: true, createTasks: false });

        const secondStageResponse = await requestSender.addStageV1({
          pathParams: { jobId: stage1.jobId },
          requestBody: { type: 'SECOND_STAGE', data: {}, userMetadata: {} },
        });

        const stage2 = secondStageResponse.body as StageModel;

        const updateStageResponse = await requestSender.updateStageStatusV1({
          pathParams: { stageId: stage2.id },
          requestBody: { status: StageOperationStatus.PENDING },
        });

        expect(updateStageResponse).toSatisfyApiSpec();
        expect(updateStageResponse).toMatchObject({
          status: StatusCodes.BAD_REQUEST,
          body: {
            message: 'Previous stage is not COMPLETED',
            code: 'ILLEGAL_STAGE_STATUS_TRANSITION',
          },
        });
      });

      it('should return 404 with specific error message for non-existent stage', async function () {
        const updateStageResponse = await requestSender.updateStageStatusV1({
          pathParams: { stageId: testStageId },
          requestBody: { status: StageOperationStatus.PENDING },
        });

        expect(updateStageResponse).toSatisfyApiSpec();
        expect(updateStageResponse).toMatchObject({
          status: StatusCodes.NOT_FOUND,
          body: { message: stagesErrorMessages.stageNotFound, code: 'STAGE_NOT_FOUND' },
        });
      });
    });

    describe('Sad Path', function () {
      it('should return 500 status code when the database driver throws an error', async function () {
        const error = createMockPrismaError();
        const transactionSpy = createProxyMock(prisma, '$transaction');
        transactionSpy.mockImplementationOnce(<T>(callback: (tx: PrismaTransaction) => T): T => {
          const mockTx = {
            stage: {
              findUnique: vi.fn().mockRejectedValueOnce(error),
            },
          } as unknown as PrismaTransaction;
          return callback(mockTx);
        });

        const response = await requestSender.updateStageStatusV1({
          pathParams: { stageId: testStageId },
          requestBody: { status: StageOperationStatus.PENDING },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'DATABASE_RELATED_ERROR' },
        });
      });

      it('should return 500 status code when the database driver throws an unexpected error', async function () {
        const error = createMockUnknownDbError();

        const transactionSpy = createProxyMock(prisma, '$transaction');

        transactionSpy.mockImplementation(async <T>(callback: (tx: PrismaTransaction) => Promise<T>): Promise<void> => {
          const mockTx = {
            stage: {
              findUnique: vi.fn().mockRejectedValueOnce(error),
            },
          } as unknown as PrismaTransaction;
          await callback(mockTx);
        });

        const response = await requestSender.updateStageStatusV1({
          pathParams: { stageId: testStageId },
          requestBody: { status: StageOperationStatus.PENDING },
        });

        expect(response).toSatisfyApiSpec();
        expect(response).toMatchObject({
          status: StatusCodes.INTERNAL_SERVER_ERROR,
          body: { message: 'Database error', code: 'UNKNOWN_ERROR' },
        });
      });
    });
  });
});
