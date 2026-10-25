import { inject, Lifecycle, scoped } from 'tsyringe';
import { and, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { DEFAULT_PAGE_SIZE, paginationParamsToOffsetAndLimit } from '@map-colonies/drizzle-utils';
import type { JobId } from 'jobnik-openapi';
import { SERVICES } from '@src/common/constants';
import type { Drizzle, DrizzleTx } from '@src/db/drizzle';
import { jobTable } from '@src/db/entities';
import type { PaginatedResult } from '@src/common/utils/pagination';
import type { JobRow, JobFindCriteriaArg } from '../models/models';

const DEFAULT_PAGE = 1;

@scoped(Lifecycle.ContainerScoped)
export class JobRepository {
  public constructor(@inject(SERVICES.DRIZZLE) private readonly drizzle: Drizzle) {}

  /**
   * Finds a page of jobs matching the optional filters, ordered by creation time.
   * @param criteria - the job search query params; filters that are not set are ignored
   * @returns the page of jobs, with their stages when requested, and the total number of matching jobs
   */
  public async findJobs(criteria: JobFindCriteriaArg): Promise<PaginatedResult<JobRow[]>> {
    const {
      page = DEFAULT_PAGE,
      page_size: pageSize = DEFAULT_PAGE_SIZE,
      job_name: name,
      priority,
      from_date: fromDate,
      end_date: endDate,
      should_return_stages: shouldReturnStages,
    } = criteria ?? {};

    // A function of the table, because the relational query aliases it.
    const filter = (table: typeof jobTable): SQL =>
      and(
        name !== undefined ? eq(table.name, name) : undefined,
        priority !== undefined ? eq(table.priority, priority) : undefined,
        fromDate !== undefined ? gte(table.creationTime, new Date(fromDate)) : undefined,
        endDate !== undefined ? lte(table.creationTime, new Date(endDate)) : undefined
      ) ?? sql`true`;

    const { limit, offset } = paginationParamsToOffsetAndLimit({ page, pageSize });

    const itemsQuery = this.drizzle.query.job.findMany({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      where: { RAW: filter },
      with: { stages: shouldReturnStages === true ? true : undefined },
      orderBy: { creationTime: 'asc' },
      limit,
      offset,
    });

    const [items, total] = await Promise.all([itemsQuery, this.drizzle.$count(jobTable, filter(jobTable))]);

    return { total, items };
  }

  /**
   * Finds a job together with its stages.
   * @param jobId - unique identifier of the job
   * @param tx - optional transaction to run the query in
   * @returns the job with its stages, or undefined if it doesn't exist
   */
  public async findJobWithStagesById(jobId: JobId, tx?: DrizzleTx): Promise<JobRow<true> | undefined> {
    return (tx ?? this.drizzle).query.job.findFirst({ where: { id: { eq: jobId } }, with: { stages: true } });
  }
}
