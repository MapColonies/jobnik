import { inject, Lifecycle, scoped } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { Prisma, PrismaClient } from '@prismaClient';
import { SERVICES } from '@src/common/constants';
import { PrismaTransaction } from '@src/db/types';
import { StageSummary, UpdateSummaryCount } from '../models/models';
import { summaryCountsMapper, taskOperationStatusWithTotal } from '../models/helper';

@scoped(Lifecycle.ContainerScoped)
export class StageRepository {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.PRISMA) private readonly prisma: PrismaClient
  ) {}

  public async updateStageSummary(stageId: string, summaryPayload: UpdateSummaryCount, tx: PrismaTransaction): Promise<StageSummary> {
    const addStatus = summaryCountsMapper[summaryPayload.add.status];
    const addCount = summaryPayload.add.count;

    this.logger.debug({ msg: `Updating stage summary`, stageId, summaryPayload });
    let setClause;
    // Construct the 'remove' update if it exists
    if (summaryPayload.remove) {
      const removeStatus = summaryCountsMapper[summaryPayload.remove.status];
      const removeCount = summaryPayload.remove.count;

      setClause = Prisma.sql`summary = summary || jsonb_build_object(
        ${addStatus}::text,
        ("summary"->>${addStatus}::text)::integer + ${addCount},
        ${removeStatus}::text,
        ("summary"->>${removeStatus}::text)::integer - ${removeCount}
      )`;
    } else {
      // Construct the 'add' update (update also the total count)
      const totalCount = summaryCountsMapper[taskOperationStatusWithTotal.TOTAL];
      setClause = Prisma.sql`summary = summary || jsonb_build_object(
        ${addStatus}::text,
        ("summary"->>${addStatus}::text)::integer + ${addCount},
        ${totalCount}::text,
        ("summary"->>${totalCount}::text)::integer + ${addCount}
      )`;
    }

    const updateQuery = Prisma.sql`
      UPDATE "job_manager"."stage"
      SET ${setClause}
      WHERE id = ${stageId}
      RETURNING "summary"
    `;

    this.logger.debug(`Executing query to update stage summary: ${updateQuery.text}`);
    const updatedSummary = await tx.$queryRaw<{ summary: StageSummary }[]>(updateQuery);

    /* v8 ignore start -- @preserve */
    if (!updatedSummary[0]) {
      throw new Error('Failed to update stage summary: No summary returned from database.');
    }
    /* v8 ignore stop -- @preserve */

    return updatedSummary[0].summary;
  }
}
