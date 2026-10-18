import { sql } from 'drizzle-orm';
import { snakeCase, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { JobOperationStatus, Priority, StageOperationStatus, TaskOperationStatus } from '../persistenceModel';

const TIMESTAMP_PRECISION = 3;

export const JOB_MANAGER_SCHEMA = 'job_manager';

export const jobManagerSchema = snakeCase.schema(JOB_MANAGER_SCHEMA);

export const jobOperationStatusEnum = jobManagerSchema.enum('job_operation_status_enum', JobOperationStatus);
export const stageOperationStatusEnum = jobManagerSchema.enum('stage_operation_status_enum', StageOperationStatus);
export const taskOperationStatusEnum = jobManagerSchema.enum('task_operation_status_enum', TaskOperationStatus);
export const priorityEnum = jobManagerSchema.enum('priority_enum', Priority);

export const timestampColumn = (): ReturnType<typeof timestamp> => timestamp({ precision: TIMESTAMP_PRECISION });

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const idColumn = <T extends string>() => uuid().primaryKey().$type<T>().defaultRandom();

export const traceColumns = {
  traceparent: text().notNull(),
  tracestate: text(),
};

export const creationTimeColumn = timestampColumn()
  .default(sql`CURRENT_TIMESTAMP`)
  .notNull();

// Set by the application on insert and update, like Prisma's @updatedAt.
export const updateTimeColumn = timestampColumn()
  .notNull()
  .$onUpdate(() => new Date());
