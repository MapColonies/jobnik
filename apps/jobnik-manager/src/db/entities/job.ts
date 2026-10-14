import { sql } from 'drizzle-orm';
import { index, integer, jsonb, text } from 'drizzle-orm/pg-core';
import type { Snapshot } from 'xstate';
import type { components, JobId } from 'jobnik-openapi';
import { creationTimeColumn, idColumn, jobManagerSchema, jobOperationStatusEnum, priorityEnum, traceColumns, updateTimeColumn } from './common';

export const jobTable = jobManagerSchema.table(
  'job',
  {
    id: idColumn<JobId>(),
    data: jsonb().$type<components['schemas']['jobPayload']>().default({}).notNull(),
    status: jobOperationStatusEnum().default('CREATED').notNull(),
    xstate: jsonb().$type<Snapshot<unknown>>().notNull(),
    percentage: integer().default(0).notNull(),
    creationTime: creationTimeColumn,
    updateTime: updateTimeColumn,
    userMetadata: jsonb().$type<components['schemas']['userMetadata']>().default({}).notNull(),
    priority: priorityEnum().default('VERY_LOW').notNull(),
    name: text().notNull(),
    ...traceColumns,
  },
  (table) => [
    index('JOBS_ID_ACTIVE_STATUS_IDX')
      .on(table.priority, table.id)
      .where(sql`status IN ('PENDING', 'IN_PROGRESS', 'CREATED')`),
  ]
);
