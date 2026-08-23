import type { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { createActor } from 'xstate';
import { trace, type Tracer } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/tracing-utils';
import { INFRA_CONVENTIONS } from '@map-colonies/semantic-conventions';
import type { PrismaClient } from '@prismaClient';
import { JobOperationStatus, Prisma, StageOperationStatus } from '@prismaClient';
import { JobManager } from '@src/jobs/models/manager';
import { SERVICES, TX_TIMEOUT_MS, XSTATE_DONE_STATE } from '@common/constants';
import { resolveTraceContext } from '@src/common/utils/tracingHelpers';
import { jobStateMachine } from '@src/jobs/models/jobStateMachine';
import { illegalStatusTransitionErrorMessage, prismaKnownErrors } from '@src/common/errors';
import { errorMessages as jobsErrorMessages } from '@src/jobs/models/errors';
import { IllegalStageStatusTransitionError, JobInFiniteStateError, JobNotFoundError, StageNotFoundError } from '@src/common/generated/errors';
import { errorMessages as stagesErrorMessages } from '@src/stages/models/errors';
import type { PrismaTransaction } from '@src/db/types';
import { ATTR_MESSAGING_DESTINATION_NAME, ATTR_MESSAGING_MESSAGE_CONVERSATION_ID } from '@src/common/semconv';
import { paginate } from '@src/common/utils/pagination';
import { StageRepository } from '../DAL/stageRepository';
import type {
  StageCreateModel,
  StageEntityOptions,
  StageFindCriteriaArg,
  StageIncludingJob,
  StageModel,
  StageSummary,
  StagesPaginatedResponse,
  UpdateSummaryCount,
} from './models';
import {
  convertArrayPrismaStageToStageResponse,
  convertPrismaToStageResponse,
  defaultStatusCounts,
  getCurrentPercentage,
  getInitialXstate,
} from './helper';
import { OperationStatusMapper, stageStateMachine } from './stageStateMachine';

type GetStageEntityByIdReturnType<TOptions extends StageEntityOptions> = TOptions extends { includeTasks: true; includeJob: true }
  ? Prisma.StageGetPayload<{ include: { task: true; job: true } }>
  : TOptions extends { includeTasks: true }
    ? Prisma.StageGetPayload<{ include: { task: true } }>
    : TOptions extends { includeJob: true }
      ? Prisma.StageGetPayload<{ include: { job: true } }>
      : Prisma.StageGetPayload<Record<string, never>>;
@injectable()
export class StageManager {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.PRISMA) private readonly prisma: PrismaClient,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(StageRepository) private readonly stageRepository: StageRepository,
    @inject(JobManager) private readonly jobManager: JobManager
  ) {}

  @withSpanAsyncV4
  public async addStage(jobId: string, stagePayload: StageCreateModel): Promise<StageModel> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: jobId,
    });

    const job = await this.jobManager.getJobEntityById(jobId);

    if (!job) {
      throw new JobNotFoundError(jobsErrorMessages.jobNotFound);
    }
    spanActive?.setAttributes({
      [INFRA_CONVENTIONS.infra.jobnik.job.name]: job.name,
      [ATTR_MESSAGING_DESTINATION_NAME]: stagePayload.type,
    });

    const checkJobStatus = createActor(jobStateMachine, { snapshot: job.xstate }).start();

    // can't add stages to finite jobs (final states)
    if (checkJobStatus.getSnapshot().status === XSTATE_DONE_STATE) {
      throw new JobInFiniteStateError(jobsErrorMessages.jobAlreadyFinishedStagesError);
    }

    const { startAsWaiting, ...bodyInput } = stagePayload;
    const { traceparent, tracestate } = resolveTraceContext(stagePayload);

    const nextOrder = await this.getNextStageOrder(jobId);

    const stagePersistenceSnapshot = getInitialXstate(stagePayload, nextOrder === 1);

    let actualStatus;
    if (startAsWaiting === true) {
      actualStatus = StageOperationStatus.WAITING;
    } else if (nextOrder === 1) {
      actualStatus = StageOperationStatus.PENDING;
    } else {
      actualStatus = StageOperationStatus.CREATED;
    }

    const input: Prisma.StageCreateInput = {
      ...bodyInput,
      order: nextOrder,
      summary: defaultStatusCounts,
      status: actualStatus,
      job: {
        connect: {
          id: jobId,
        },
      },
      xstate: stagePersistenceSnapshot,
      traceparent,
      tracestate,
    };

    const queryBody: Prisma.StageCreateArgs = {
      data: input,
    };

    try {
      const stage = await this.prisma.stage.create(queryBody);

      spanActive?.setAttributes({
        [INFRA_CONVENTIONS.infra.jobnik.stage.id]: stage.id,
      });

      return convertPrismaToStageResponse(stage);
    } catch (error) {
      this.logger.error(`Failed adding stage to job with error: ${(error as Error).message}`);

      throw error;
    }
  }

  @withSpanAsyncV4
  public async getStages(params: StageFindCriteriaArg): Promise<StagesPaginatedResponse> {
    const { page, page_size, ...filterParams } = params ?? {};

    const where = {
      AND: {
        jobId: { equals: filterParams.job_id },
        type: { equals: filterParams.stage_type },
        status: { equals: filterParams.stage_operation_status },
      },
    };

    const { total, items: stages } = await paginate(
      this.prisma.stage,
      { where, include: { task: filterParams.should_return_tasks ?? false }, orderBy: { id: 'asc' as const } },
      page,
      page_size
    );

    const items = convertArrayPrismaStageToStageResponse(stages);
    return { total, items };
  }

  @withSpanAsyncV4
  public async getStageById(stageId: string, includeTasks?: boolean): Promise<StageModel> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: stageId,
    });

    const stage = await this.getStageEntityById(stageId, { includeTasks });

    if (!stage) {
      throw new StageNotFoundError(stagesErrorMessages.stageNotFound);
    }

    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: stage.jobId,
    });

    return convertPrismaToStageResponse(stage);
  }

  @withSpanAsyncV4
  public async getStagesByJobId(jobId: string, includeTasks?: boolean): Promise<StageModel[]> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: jobId,
    });

    // To validate existence of job, if not will throw JobNotFoundError
    await this.jobManager.getJobById(jobId);

    const queryBody = {
      where: {
        jobId,
      },
      include: {
        task: includeTasks,
      },
      orderBy: {
        order: 'asc' as const,
      },
    };

    const stages = await this.prisma.stage.findMany(queryBody);
    const result = stages.map((stage) => convertPrismaToStageResponse(stage));
    return result;
  }

  @withSpanAsyncV4
  public async getSummaryByStageId(stageId: string): Promise<StageSummary> {
    trace.getActiveSpan()?.setAttributes({
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: stageId,
    });

    const stage = await this.getStageById(stageId);

    const summary = stage.summary;

    return summary;
  }

  @withSpanAsyncV4
  public async updateUserMetadata(stageId: string, userMetadata: Record<string, unknown>): Promise<void> {
    trace.getActiveSpan()?.setAttributes({
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: stageId,
    });

    const updateQueryBody = {
      where: {
        id: stageId,
      },
      data: {
        userMetadata,
      },
    };

    try {
      await this.prisma.stage.update(updateQueryBody);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === prismaKnownErrors.recordNotFound) {
        throw new StageNotFoundError(stagesErrorMessages.stageNotFound);
      }
      throw err;
    }
  }

  @withSpanAsyncV4
  public async updateStatus(stageId: string, status: StageOperationStatus, tx?: PrismaTransaction): Promise<void> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: stageId,
      [INFRA_CONVENTIONS.infra.jobnik.stage.status]: status,
    });

    if (!tx) {
      return this.prisma.$transaction(
        async (newTx) => {
          await this.executeUpdateStatus(stageId, status, newTx);
        },
        { timeout: TX_TIMEOUT_MS }
      );
    }

    await this.executeUpdateStatus(stageId, status, tx);
  }

  /**
   * This method is used to get a stage entity by its id from the database.
   * @param stageId unique identifier of the stage.
   * @param options options for including related entities.
   * @returns The stage entity if found, otherwise null.
   *
   */
  @withSpanAsyncV4
  public async getStageEntityById<T extends StageEntityOptions>(
    stageId: string,
    options: T = {} as T
  ): Promise<null | GetStageEntityByIdReturnType<T>> {
    trace.getActiveSpan()?.setAttributes({
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: stageId,
    });

    const prisma = options.tx ?? this.prisma;

    const queryBody = {
      where: {
        id: stageId,
      },
      include: {
        job: options.includeJob,
        task: options.includeTasks,
      },
    };

    const stage = await prisma.stage.findUnique(queryBody);
    return stage as null | GetStageEntityByIdReturnType<T>;
  }

  /**
   * This method is used to update the related columns of stage progressing .
   * @param stageId unique identifier of the stage.
   * @param summary summary object containing the current progress aggregated task data of the stage.
   */
  @withSpanAsyncV4
  public async updateStageProgressFromTaskChanges(stageId: string, summaryUpdatePayload: UpdateSummaryCount, tx: PrismaTransaction): Promise<void> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: stageId,
    });

    const stage = (await this.getStageEntityById(stageId, { includeJob: true, tx })) as StageIncludingJob;

    // update stage summary aggregated task data
    const updatedSummary = await this.stageRepository.updateStageSummary(stageId, summaryUpdatePayload, tx);

    // update stage progress percentage
    await this.updateStageProgress(stage, updatedSummary, tx);

    // update stage status if it was initialized by first task
    // and the stage is not already in progress
    // Race condition protection: Only transition if stage is PENDING
    // Multiple concurrent tasks may trigger this check simultaneously
    if (updatedSummary.inProgress > 0 && stage.status === StageOperationStatus.PENDING) {
      await this.updateStatus(stageId, StageOperationStatus.IN_PROGRESS, tx);
      trace.getActiveSpan()?.addEvent('Stage set to IN_PROGRESS because first task started', { stageId });
    }
  }

  @withSpanAsyncV4
  private async executeUpdateStatus(stageId: string, targetStatus: StageOperationStatus, tx: PrismaTransaction): Promise<void> {
    const stage = await this.getStageEntityById(stageId, { includeJob: true, tx });

    if (!stage) {
      throw new StageNotFoundError(stagesErrorMessages.stageNotFound);
    }

    // Idempotent status update: if already in target status, no-op
    // This prevents errors during race conditions where multiple workers
    // try to set the same status (e.g., multiple tasks setting stage to IN_PROGRESS)
    /* v8 ignore next 4 -- @preserve */
    if (stage.status === targetStatus) {
      this.logger.debug({
        msg: 'Stage already in target status, skipping transition',
        stageId,
        targetStatus,
      });
      return;
    }

    //#region validate status transition rules
    const previousStageOrder = stage.order - 1;

    // can't move to PENDING if previous stage is not COMPLETED
    if (targetStatus === StageOperationStatus.PENDING && previousStageOrder > 0) {
      const previousStage = await tx.stage.findFirst({
        where: {
          jobId: stage.jobId,
          order: previousStageOrder,
        },
      });

      if (previousStage!.status !== StageOperationStatus.COMPLETED) {
        throw new IllegalStageStatusTransitionError(`Previous stage is not ${StageOperationStatus.COMPLETED}`);
      }
    }

    const nextStatusChange = OperationStatusMapper[targetStatus];
    const updateActor = createActor(stageStateMachine, { snapshot: stage.xstate }).start();
    const isValidStatus = updateActor.getSnapshot().can({ type: nextStatusChange });

    if (!isValidStatus) {
      throw new IllegalStageStatusTransitionError(illegalStatusTransitionErrorMessage(stage.status, targetStatus));
    }
    //#endregion
    updateActor.send({ type: nextStatusChange });
    const newPersistedSnapshot = updateActor.getPersistedSnapshot();

    const updateQueryBody = {
      where: {
        id: stageId,
      },
      data: {
        status: targetStatus,
        xstate: newPersistedSnapshot,
      },
    };

    await tx.stage.update(updateQueryBody);

    //#region update related entities
    // Update job completion when a stage is completed
    // If the stage is marked as completed, and there is a next stage in the job, update the next stage status to PENDING
    if (targetStatus === StageOperationStatus.COMPLETED) {
      const nextStageOrder = stage.order + 1;
      const nextStage = await tx.stage.findFirst({
        where: {
          jobId: stage.jobId,
          order: nextStageOrder,
        },
      });

      if (nextStage?.status === StageOperationStatus.CREATED) {
        await this.executeUpdateStatus(nextStage.id, StageOperationStatus.PENDING, tx);
        trace.getActiveSpan()?.addEvent('Next stage set to PENDING', { nextStageId: nextStage.id });
      }

      const { completedStages, totalStages } = await this.updateJobCompletionProgress(stage.jobId, tx);
      if (completedStages === totalStages) {
        await this.jobManager.updateStatus(stage.jobId, JobOperationStatus.COMPLETED, tx);
        this.logger.info({
          msg: 'Job completed as all stages are done',
          jobId: stage.jobId,
        });

        trace.getActiveSpan()?.addEvent('Job set to COMPLETED', { jobId: stage.jobId });
      }
    }

    if (targetStatus === StageOperationStatus.IN_PROGRESS && stage.job.status === JobOperationStatus.PENDING) {
      // Update job status to IN_PROGRESS
      await this.jobManager.updateStatus(stage.job.id, JobOperationStatus.IN_PROGRESS, tx);
      trace.getActiveSpan()?.addEvent('Job status set to IN_PROGRESS because first stage is being processed', { jobId: stage.jobId });
    } else if (targetStatus === StageOperationStatus.FAILED) {
      // Update job status to FAILED
      await this.jobManager.updateStatus(stage.jobId, JobOperationStatus.FAILED, tx);
      trace.getActiveSpan()?.addEvent('Job set to FAILED because its stage failed', { jobId: stage.jobId });
    }

    //#endregion
  }

  /**
   * This method is used to update the progress of a stage according tasks metrics.
   * @param stageId unique identifier of the stage.
   * @param summary summary object containing the current progress aggregated task data of the stage.
   */
  @withSpanAsyncV4
  private async updateStageProgress(stage: StageIncludingJob, summary: StageSummary, tx: PrismaTransaction): Promise<void> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [INFRA_CONVENTIONS.infra.jobnik.stage.id]: stage.id,
      [INFRA_CONVENTIONS.infra.jobnik.stage.status]: stage.status,
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: stage.jobId,
      [ATTR_MESSAGING_DESTINATION_NAME]: stage.type,
      [INFRA_CONVENTIONS.infra.jobnik.job.name]: stage.job.name,
    });

    const completionPercentage = getCurrentPercentage(summary);
    const stageUpdatedData: Prisma.StageUpdateInput = { percentage: completionPercentage };

    await tx.stage.update({ where: { id: stage.id }, data: stageUpdatedData });
    if (summary.total === summary.completed) {
      await this.updateStatus(stage.id, StageOperationStatus.COMPLETED, tx);

      this.logger.info({
        msg: 'Stage completed, updating job progress',
        stageId: stage.id,
        jobId: stage.jobId,
      });
      await this.updateJobCompletionProgress(stage.jobId, tx);
      trace.getActiveSpan()?.addEvent('Stage set to COMPLETED', { stageId: stage.id });
    }
  }

  /**
   *
   * @param jobId unique identifier of the job. This method retrieves the next order number for a new stage in a job.
   * It checks the maximum order number of existing stages in the job and increments it by one.
   * If no stages exist, it returns 1 as the first order number.
   * @returns The next order number for a new stage in the job.
   */
  @withSpanAsyncV4
  private async getNextStageOrder(jobId: string): Promise<number> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: jobId,
    });

    const lastStageResult = await this.prisma.stage.aggregate({
      where: { jobId },
      _max: { order: true },
    });

    if (lastStageResult._max.order === null) {
      return 1;
    }
    return lastStageResult._max.order + 1;
  }

  /**
   * Updates the job completion progress based on completed stages.
   * Calculates percentage and marks job as completed when all stages are done.
   * @param jobId unique identifier of the job.
   * @param tx transaction context.
   */
  @withSpanAsyncV4
  private async updateJobCompletionProgress(jobId: string, tx?: PrismaTransaction): Promise<{ completedStages: number; totalStages: number }> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: jobId,
    });

    /* v8 ignore next -- @preserve - defensive code, tx is always provided in tests */
    const prisma = tx ?? this.prisma;

    const [totalStages, completedStages] = await Promise.all([
      prisma.stage.count({ where: { jobId } }),
      prisma.stage.count({ where: { jobId, status: StageOperationStatus.COMPLETED } }),
    ]);

    /* v8 ignore next 3 -- @preserve */
    if (totalStages === 0) {
      return { completedStages: 0, totalStages: 0 };
    }

    const JOB_PERCENTAGE_MULTIPLIER = 100;
    const completionPercentage = Math.floor((completedStages / totalStages) * JOB_PERCENTAGE_MULTIPLIER);

    await prisma.job.update({
      where: { id: jobId },
      data: { percentage: completionPercentage },
    });

    return { completedStages, totalStages };
  }
}
