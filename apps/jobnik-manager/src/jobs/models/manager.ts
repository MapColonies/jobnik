import type { Logger } from '@map-colonies/js-logger';
import { inject, injectable } from 'tsyringe';
import { createActor } from 'xstate';
import type { Tracer } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import { withSpanAsyncV4 } from '@map-colonies/tracing-utils';
import { INFRA_CONVENTIONS } from '@map-colonies/semantic-conventions';
import type { JobId } from 'jobnik-openapi';
import { IllegalJobStatusTransitionError, JobNotInFiniteStateError, JobNotFoundError } from 'jobnik-openapi';
import { eq } from 'drizzle-orm';
import { SERVICES } from '@common/constants';
import { convertArrayPrismaStageToStageResponse } from '@src/stages/models/helper';
import { illegalStatusTransitionErrorMessage } from '@common/errors';
import type { Drizzle, DrizzleTx } from '@src/db/drizzle';
import { jobTable } from '@src/db/entities';
import { resolveTraceContext } from '@src/common/utils/tracingHelpers';
import { ATTR_MESSAGING_MESSAGE_CONVERSATION_ID } from '@src/common/semconv';
import { type NewJob, type Priority, JobOperationStatus } from '@src/db/persistenceModel';
import { JobRepository } from '../DAL/jobRepository';
import { errorMessages as jobsErrorMessages, SamePriorityChangeError } from './errors';
import type { JobCreateModel, JobModel, JobFindCriteriaArg, JobRow, JobsPaginatedResponse } from './models';
import { jobStateMachine, OperationStatusMapper } from './jobStateMachine';

@injectable()
export class JobManager {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.DRIZZLE) private readonly drizzle: Drizzle,
    @inject(SERVICES.TRACER) public readonly tracer: Tracer,
    @inject(JobRepository) private readonly jobRepository: JobRepository
  ) {}

  @withSpanAsyncV4
  public async getJobs(params: JobFindCriteriaArg): Promise<JobsPaginatedResponse> {
    const { total, items: jobs } = await this.jobRepository.findJobs({
      name: params?.job_name,
      priority: params?.priority,
      fromDate: params?.from_date !== undefined ? new Date(params.from_date) : undefined,
      endDate: params?.end_date !== undefined ? new Date(params.end_date) : undefined,
      includeStages: params?.should_return_stages,
      page: params?.page,
      pageSize: params?.page_size,
    });

    const items = jobs.map((job) => this.convertJobRowToResponse(job));
    return { total, items };
  }

  @withSpanAsyncV4
  public async createJob(body: JobCreateModel): Promise<JobModel> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [INFRA_CONVENTIONS.infra.jobnik.job.name]: body.name,
      [INFRA_CONVENTIONS.infra.jobnik.job.priority]: body.priority,
    });

    try {
      const createJobActor = createActor(jobStateMachine).start();
      createJobActor.send({ type: OperationStatusMapper[JobOperationStatus.PENDING] });
      const persistenceSnapshot = createJobActor.getPersistedSnapshot();

      const { traceparent, tracestate } = resolveTraceContext(body);

      const input = {
        ...body,
        status: JobOperationStatus.PENDING,
        xstate: persistenceSnapshot,
        traceparent,
        tracestate,
      } satisfies NewJob;
      const [createdJob] = await this.drizzle.insert(jobTable).values(input).returning();
      /* v8 ignore next 3 -- @preserve */
      if (!createdJob) {
        throw new Error('Failed to create job: no row returned from database.');
      }
      const res = this.convertJobRowToResponse(createdJob);

      spanActive?.setAttributes({
        [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: res.id,
      });

      this.logger.debug({ msg: 'Created new job successfully', response: res });
      return res;
    } catch (error) {
      this.logger.error(`Failed creating job with error: ${(error as Error).message}`);
      throw error;
    }
  }

  @withSpanAsyncV4
  public async getJobById(jobId: JobId, includeStages?: boolean): Promise<JobModel> {
    trace.getActiveSpan()?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: jobId,
    });

    const job = await this.getJobEntityById(jobId, { includeStages });

    if (!job) {
      throw new JobNotFoundError(jobsErrorMessages.jobNotFound);
    }

    return this.convertJobRowToResponse(job);
  }

  @withSpanAsyncV4
  public async updateUserMetadata(jobId: JobId, userMetadata: Record<string, unknown>): Promise<void> {
    trace.getActiveSpan()?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: jobId,
    });

    const updatedJobs = await this.drizzle.update(jobTable).set({ userMetadata }).where(eq(jobTable.id, jobId)).returning({ id: jobTable.id });

    if (updatedJobs.length === 0) {
      throw new JobNotFoundError(jobsErrorMessages.jobNotFound);
    }
  }

  @withSpanAsyncV4
  public async updatePriority(jobId: JobId, priority: Priority): Promise<void> {
    trace.getActiveSpan()?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: jobId,
      [INFRA_CONVENTIONS.infra.jobnik.job.priority]: priority,
    });

    const job = await this.getJobEntityById(jobId);

    if (!job) {
      throw new JobNotFoundError(jobsErrorMessages.jobNotFound);
    }

    if (job.priority === priority) {
      throw new SamePriorityChangeError(jobsErrorMessages.priorityCannotBeUpdatedToSameValue);
    }

    await this.drizzle.update(jobTable).set({ priority }).where(eq(jobTable.id, jobId));
  }

  @withSpanAsyncV4
  public async updateStatus(jobId: JobId, status: JobOperationStatus, tx?: DrizzleTx): Promise<void> {
    trace.getActiveSpan()?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: jobId,
      [INFRA_CONVENTIONS.infra.jobnik.job.status]: status,
    });

    if (!tx) {
      return this.drizzle.transaction(async (newTx) => {
        await this.executeUpdateStatus(jobId, status, newTx);
      });
    }

    await this.executeUpdateStatus(jobId, status, tx);
  }

  @withSpanAsyncV4
  public async deleteJob(jobId: JobId): Promise<void> {
    trace.getActiveSpan()?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: jobId,
    });

    const job = await this.getJobEntityById(jobId);

    if (!job) {
      throw new JobNotFoundError(jobsErrorMessages.jobNotFound);
    }

    const checkJobStatus = createActor(jobStateMachine, { snapshot: job.xstate }).start();

    if (checkJobStatus.getSnapshot().status !== 'done') {
      throw new JobNotInFiniteStateError(jobsErrorMessages.jobNotInFiniteState);
    }

    await this.drizzle.delete(jobTable).where(eq(jobTable.id, jobId));
  }

  /**
   * This method is used to get a job entity by its id from the database.
   * @param jobId unique identifier of the job.
   * @param options Configuration options for the query
   * @returns The job entity if found, otherwise null.
   */
  @withSpanAsyncV4
  public async getJobEntityById<IncludeStages extends boolean = false>(
    jobId: JobId,
    options: { includeStages?: IncludeStages; tx?: DrizzleTx } = {}
  ): Promise<JobRow<IncludeStages> | undefined> {
    const spanActive = trace.getActiveSpan();
    spanActive?.setAttributes({
      [ATTR_MESSAGING_MESSAGE_CONVERSATION_ID]: jobId,
    });

    return this.jobRepository.findJobById(jobId, options);
  }

  @withSpanAsyncV4
  private async executeUpdateStatus(jobId: JobId, status: JobOperationStatus, tx: DrizzleTx): Promise<void> {
    const job = await this.getJobEntityById(jobId, { tx });

    if (!job) {
      throw new JobNotFoundError(jobsErrorMessages.jobNotFound);
    }

    const nextStatusChange = OperationStatusMapper[status];
    const updateActor = createActor(jobStateMachine, { snapshot: job.xstate }).start();
    const isValidStatus = updateActor.getSnapshot().can({ type: nextStatusChange });

    if (!isValidStatus) {
      throw new IllegalJobStatusTransitionError(illegalStatusTransitionErrorMessage(job.status, status));
    }

    updateActor.send({ type: nextStatusChange });
    const newPersistedSnapshot = updateActor.getPersistedSnapshot();

    await tx.update(jobTable).set({ status, xstate: newPersistedSnapshot }).where(eq(jobTable.id, jobId));
  }

  /**
   * Converts a job row to a job response model
   * @param jobRow - The job row, with or without stages
   * @returns The converted job model
   */
  private convertJobRowToResponse(jobRow: JobRow): JobModel {
    const { data, creationTime, userMetadata, updateTime, tracestate, xstate, stages, ...rest } = jobRow;

    const transformedFields = {
      data,
      creationTime: creationTime.toISOString(),
      userMetadata,
      updateTime: updateTime.toISOString(),
      tracestate: tracestate ?? undefined,
      stages: stages ? convertArrayPrismaStageToStageResponse(stages) : undefined,
    };

    return Object.assign(rest, transformedFields);
  }
}
