CREATE SCHEMA IF NOT EXISTS "job_manager";
--> statement-breakpoint
CREATE TYPE "job_manager"."job_operation_status_enum" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ABORTED', 'CREATED', 'PAUSED');--> statement-breakpoint
CREATE TYPE "job_manager"."priority_enum" AS ENUM('VERY_HIGH', 'HIGH', 'MEDIUM', 'LOW', 'VERY_LOW');--> statement-breakpoint
CREATE TYPE "job_manager"."stage_operation_status_enum" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ABORTED', 'WAITING', 'CREATED');--> statement-breakpoint
CREATE TYPE "job_manager"."task_operation_status_enum" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CREATED', 'RETRIED');--> statement-breakpoint
CREATE TABLE "job_manager"."job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"data" jsonb DEFAULT '{}' NOT NULL,
	"status" "job_manager"."job_operation_status_enum" DEFAULT 'CREATED'::"job_manager"."job_operation_status_enum" NOT NULL,
	"xstate" jsonb NOT NULL,
	"percentage" integer DEFAULT 0 NOT NULL,
	"creation_time" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"update_time" timestamp(3) NOT NULL,
	"user_metadata" jsonb DEFAULT '{}' NOT NULL,
	"priority" "job_manager"."priority_enum" DEFAULT 'VERY_LOW'::"job_manager"."priority_enum" NOT NULL,
	"name" text NOT NULL,
	"traceparent" text NOT NULL,
	"tracestate" text
);
--> statement-breakpoint
CREATE TABLE "job_manager"."stage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"data" jsonb DEFAULT '{}' NOT NULL,
	"job_id" uuid NOT NULL,
	"order" integer DEFAULT 1 NOT NULL,
	"percentage" integer DEFAULT 0 NOT NULL,
	"user_metadata" jsonb DEFAULT '{}' NOT NULL,
	"summary" jsonb NOT NULL,
	"status" "job_manager"."stage_operation_status_enum" DEFAULT 'CREATED'::"job_manager"."stage_operation_status_enum" NOT NULL,
	"xstate" jsonb NOT NULL,
	"type" varchar(50) DEFAULT 'unknown' NOT NULL,
	"traceparent" text NOT NULL,
	"tracestate" text
);
--> statement-breakpoint
CREATE TABLE "job_manager"."task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"data" jsonb DEFAULT '{}' NOT NULL,
	"status" "job_manager"."task_operation_status_enum" DEFAULT 'CREATED'::"job_manager"."task_operation_status_enum" NOT NULL,
	"xstate" jsonb NOT NULL,
	"creation_time" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"update_time" timestamp(3) NOT NULL,
	"start_time" timestamp(3),
	"end_time" timestamp(3),
	"user_metadata" jsonb DEFAULT '{}' NOT NULL,
	"stage_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"traceparent" text NOT NULL,
	"tracestate" text
);
--> statement-breakpoint
CREATE INDEX "JOBS_ID_ACTIVE_STATUS_IDX" ON "job_manager"."job" ("priority","id") WHERE status IN ('PENDING', 'IN_PROGRESS', 'CREATED');--> statement-breakpoint
CREATE INDEX "STAGE_ID_ACTIVE_STATUS_IDX" ON "job_manager"."stage" ("job_id","id") WHERE status IN ('PENDING', 'IN_PROGRESS', 'CREATED', 'WAITING');--> statement-breakpoint
CREATE INDEX "STAGE_JOB_ID_ORDER_IDX" ON "job_manager"."stage" ("job_id","order");--> statement-breakpoint
CREATE INDEX "STAGE_TYPE_IDX" ON "job_manager"."stage" ("type");--> statement-breakpoint
CREATE INDEX "TASKS_ID_ACTIVE_STATUS_IDX" ON "job_manager"."task" ("stage_id") WHERE status IN ('PENDING', 'IN_PROGRESS', 'CREATED');--> statement-breakpoint
CREATE INDEX "TASK_STAGE_ID_IDX" ON "job_manager"."task" ("stage_id");--> statement-breakpoint
CREATE INDEX "TASK_IN_PROGRESS_START_TIME_IDX" ON "job_manager"."task" ("start_time") WHERE status = 'IN_PROGRESS';--> statement-breakpoint
ALTER TABLE "job_manager"."stage" ADD CONSTRAINT "stage_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job_manager"."job"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "job_manager"."task" ADD CONSTRAINT "task_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "job_manager"."stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;