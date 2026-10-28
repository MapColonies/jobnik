import { inject, Lifecycle, scoped } from 'tsyringe';
import { relationsFilterToSQL } from 'drizzle-orm';
import { DEFAULT_PAGE_SIZE, paginationParamsToOffsetAndLimit } from '@map-colonies/drizzle-utils';
import type { JobId } from 'jobnik-openapi';
import { SERVICES } from '@src/common/constants';
import type { Drizzle, DrizzleTx, TableFilter } from '@src/db/drizzle';
import { jobTable } from '@src/db/entities';
import type { PaginatedResult } from '@src/common/utils/pagination';
import type { JobRow, JobSearchParams } from '../models/models';

const DEFAULT_PAGE = 1;

@scoped(Lifecycle.ContainerScoped)
export class JobRepository {
  public constructor(@inject(SERVICES.DRIZZLE) private readonly drizzle: Drizzle) {}

  /**
   * Finds a page of jobs matching the optional filters, ordered by creation time.
   * @param params - the search criteria; filters that are not set are ignored
   * @returns the page of jobs, with their stages when requested, and the total number of matching jobs
   */
  public async findJobs(params: JobSearchParams): Promise<PaginatedResult<JobRow[]>> {
    const { page = DEFAULT_PAGE, pageSize = DEFAULT_PAGE_SIZE, name, priority, fromDate, endDate, includeStages } = params;

    // Relational filters skip undefined values, so unset criteria don't filter.
    const where = {
      name,
      priority,
      creationTime: { gte: fromDate, lte: endDate },
    } satisfies TableFilter<'job'>;

    const { limit, offset } = paginationParamsToOffsetAndLimit({ page, pageSize });

    const itemsQuery = this.drizzle.query.job.findMany({
      where,
      with: { stages: includeStages === true ? true : undefined },
      orderBy: { creationTime: 'asc' },
      limit,
      offset,
    });

    const [items, total] = await Promise.all([itemsQuery, this.drizzle.$count(jobTable, relationsFilterToSQL(jobTable, where))]);

    return { total, items };
  }

  /**
   * Finds a job by its id, optionally together with its stages.
   * @param jobId - unique identifier of the job
   * @param options - whether to load the job's stages, and an optional transaction to run the query in
   * @returns the job, with its stages when requested, or undefined if it doesn't exist
   */
  public async findJobById<IncludeStages extends boolean = false>(
    jobId: JobId,
    options: { includeStages?: IncludeStages; tx?: DrizzleTx } = {}
  ): Promise<JobRow<IncludeStages> | undefined> {
    return (options.tx ?? this.drizzle).query.job.findFirst({
      where: { id: { eq: jobId } },
      with: { stages: options.includeStages === true ? true : undefined },
    });
  }
}
