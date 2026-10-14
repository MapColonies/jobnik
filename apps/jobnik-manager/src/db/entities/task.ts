import { sql } from 'drizzle-orm';
import { foreignKey, index, integer, jsonb, uuid } from 'drizzle-orm/pg-core';
import type { Snapshot } from 'xstate';
import type { components, StageId, TaskId } from 'jobnik-openapi';
import { creationTimeColumn, idColumn, jobManagerSchema, taskOperationStatusEnum, timestampColumn, traceColumns, updateTimeColumn } from './common';
import { stageTable } from './stage';

export const taskTable = jobManagerSchema.table(
  'task',
  {
    id: idColumn<TaskId>(),
    data: jsonb().$type<components['schemas']['taskPayload']>().default({}).notNull(),
    status: taskOperationStatusEnum().default('CREATED').notNull(),
    xstate: jsonb().$type<Snapshot<unknown>>().notNull(),
    creationTime: creationTimeColumn,
    updateTime: updateTimeColumn,
    startTime: timestampColumn(),
    endTime: timestampColumn(),
    userMetadata: jsonb().$type<components['schemas']['userMetadata']>().default({}).notNull(),
    stageId: uuid().$type<StageId>().notNull(),
    attempts: integer().default(0).notNull(),
    maxAttempts: integer().default(1).notNull(),
    ...traceColumns,
  },
  (table) => [
    foreignKey({ name: 'task_stage_id_fkey', columns: [table.stageId], foreignColumns: [stageTable.id] })
      .onDelete('cascade')
      .onUpdate('cascade'),
    index('TASKS_ID_ACTIVE_STATUS_IDX')
      .on(table.stageId)
      .where(sql`status IN ('PENDING', 'IN_PROGRESS', 'CREATED')`),
    index('TASK_STAGE_ID_IDX').on(table.stageId),
    index('TASK_IN_PROGRESS_START_TIME_IDX')
      .on(table.startTime)
      .where(sql`status = 'IN_PROGRESS'`),
  ]
);
