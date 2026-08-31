-- CreateEnum
CREATE TYPE "job_operation_status_enum" AS ENUM ('Pending', 'In-Progress', 'Completed', 'Failed', 'Aborted', 'Created', 'Paused');

-- CreateEnum
CREATE TYPE "stage_operation_status_enum" AS ENUM ('Pending', 'In-Progress', 'Completed', 'Failed', 'Aborted', 'Waiting', 'Created');

-- CreateEnum
CREATE TYPE "priority_enum" AS ENUM ('Very-High', 'High', 'Medium', 'Low', 'Very-Low');

-- CreateEnum
CREATE TYPE "task_operation_status_enum" AS ENUM ('Pending', 'In-Progress', 'Completed', 'Failed', 'Created', 'Retried');

-- CreateTable
CREATE TABLE "job" (
    "id" UUID NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "status" "job_operation_status_enum" NOT NULL DEFAULT 'Created',
    "xstate" JSONB NOT NULL,
    "percentage" INTEGER NOT NULL DEFAULT 0,
    "creation_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_time" TIMESTAMP(3) NOT NULL,
    "user_metadata" JSONB NOT NULL DEFAULT '{}',
    "priority" "priority_enum" NOT NULL DEFAULT 'Very-Low',
    "name" TEXT NOT NULL,
    "traceparent" TEXT NOT NULL,
    "tracestate" TEXT,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage" (
    "id" UUID NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "job_id" UUID NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "percentage" INTEGER NOT NULL DEFAULT 0,
    "user_metadata" JSONB NOT NULL DEFAULT '{}',
    "summary" JSONB NOT NULL,
    "status" "stage_operation_status_enum" NOT NULL DEFAULT 'Created',
    "xstate" JSONB NOT NULL,
    "type" VARCHAR(50) NOT NULL DEFAULT 'unknown',
    "traceparent" TEXT NOT NULL,
    "tracestate" TEXT,

    CONSTRAINT "stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" UUID NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "status" "task_operation_status_enum" NOT NULL DEFAULT 'Created',
    "xstate" JSONB NOT NULL,
    "creation_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_time" TIMESTAMP(3) NOT NULL,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "user_metadata" JSONB NOT NULL DEFAULT '{}',
    "stage_id" UUID NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 1,
    "traceparent" TEXT NOT NULL,
    "tracestate" TEXT,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "stage" ADD CONSTRAINT "stage_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (Partial Indexes for Active Statuses)
CREATE INDEX "JOBS_ID_ACTIVE_STATUS_IDX" ON "job" ("priority", "id") WHERE (status IN ('Pending', 'In-Progress', 'Created'));

-- CreateIndex
CREATE INDEX "STAGE_ID_ACTIVE_STATUS_IDX" ON "stage" ("job_id", "id") WHERE (status IN ('Pending', 'In-Progress', 'Created', 'Waiting'));

-- CreateIndex
CREATE INDEX "TASKS_ID_ACTIVE_STATUS_IDX" ON "task" ("stage_id") WHERE (status IN ('Pending', 'In-Progress', 'Created'));

-- CreateIndex (Composite index for stage ordering and lookups)
-- Serves: getNextStageOrder, findFirst, getStagesByJobId, stage.count, CASCADE DELETE
-- Subsumes standalone (job_id) index via prefix lookup
CREATE INDEX "STAGE_JOB_ID_ORDER_IDX" ON "stage" ("job_id", "order");

-- CreateIndex (Full index for CASCADE DELETE and all task lookups)
-- Complements partial index TASKS_ID_ACTIVE_STATUS_IDX for complete coverage
-- Critical for FK integrity and cascade performance
CREATE INDEX "TASK_STAGE_ID_IDX" ON "task" ("stage_id");

-- CreateIndex (Stage type index for dequeue path optimization)
-- Enables efficient filtering in findAndLockTask query (task → stage → job join)
CREATE INDEX "STAGE_TYPE_IDX" ON "stage" ("type");

-- CreateIndex (Partial index for stale task cleanup)
-- Only maintains entries for IN_PROGRESS tasks, optimized for sweeper query
CREATE INDEX "TASK_IN_PROGRESS_START_TIME_IDX" ON "task" ("start_time") WHERE (status = 'In-Progress');
