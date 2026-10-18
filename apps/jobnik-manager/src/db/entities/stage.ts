import { sql } from 'drizzle-orm';
import { foreignKey, index, integer, jsonb, uuid, varchar } from 'drizzle-orm/pg-core';
import type { Snapshot } from 'xstate';
import type { components, JobId, StageId } from 'jobnik-openapi';
import { idColumn, jobManagerSchema, stageOperationStatusEnum, traceColumns } from './common';
import { jobTable } from './job';

const STAGE_TYPE_MAX_LENGTH = 50;

export const stageTable = jobManagerSchema.table(
  'stage',
  {
    id: idColumn<StageId>(),
    data: jsonb().$type<components['schemas']['stagePayload']>().default({}).notNull(),
    jobId: uuid().$type<JobId>().notNull(),
    order: integer().default(1).notNull(),
    percentage: integer().default(0).notNull(),
    userMetadata: jsonb().$type<components['schemas']['userMetadata']>().default({}).notNull(),
    summary: jsonb().$type<components['schemas']['summary']>().notNull(),
    status: stageOperationStatusEnum().default('CREATED').notNull(),
    xstate: jsonb().$type<Snapshot<unknown>>().notNull(),
    type: varchar({ length: STAGE_TYPE_MAX_LENGTH }).default('unknown').notNull(),
    ...traceColumns,
  },
  (table) => [
    foreignKey({ name: 'stage_job_id_fkey', columns: [table.jobId], foreignColumns: [jobTable.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
    index('STAGE_ID_ACTIVE_STATUS_IDX')
      .on(table.jobId, table.id)
      .where(sql`status IN ('PENDING', 'IN_PROGRESS', 'CREATED', 'WAITING')`),
    index('STAGE_JOB_ID_ORDER_IDX').on(table.jobId, table.order),
    index('STAGE_TYPE_IDX').on(table.type),
  ]
);
