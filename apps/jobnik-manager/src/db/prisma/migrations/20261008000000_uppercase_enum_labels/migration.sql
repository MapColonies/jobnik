-- Rename enum labels to the uppercase names the API and code use.
-- Column defaults and partial-index predicates reference labels by OID, so they follow the rename.

ALTER TYPE "job_operation_status_enum" RENAME VALUE 'Pending' TO 'PENDING';
ALTER TYPE "job_operation_status_enum" RENAME VALUE 'In-Progress' TO 'IN_PROGRESS';
ALTER TYPE "job_operation_status_enum" RENAME VALUE 'Completed' TO 'COMPLETED';
ALTER TYPE "job_operation_status_enum" RENAME VALUE 'Failed' TO 'FAILED';
ALTER TYPE "job_operation_status_enum" RENAME VALUE 'Aborted' TO 'ABORTED';
ALTER TYPE "job_operation_status_enum" RENAME VALUE 'Created' TO 'CREATED';
ALTER TYPE "job_operation_status_enum" RENAME VALUE 'Paused' TO 'PAUSED';

ALTER TYPE "stage_operation_status_enum" RENAME VALUE 'Pending' TO 'PENDING';
ALTER TYPE "stage_operation_status_enum" RENAME VALUE 'In-Progress' TO 'IN_PROGRESS';
ALTER TYPE "stage_operation_status_enum" RENAME VALUE 'Completed' TO 'COMPLETED';
ALTER TYPE "stage_operation_status_enum" RENAME VALUE 'Failed' TO 'FAILED';
ALTER TYPE "stage_operation_status_enum" RENAME VALUE 'Aborted' TO 'ABORTED';
ALTER TYPE "stage_operation_status_enum" RENAME VALUE 'Waiting' TO 'WAITING';
ALTER TYPE "stage_operation_status_enum" RENAME VALUE 'Created' TO 'CREATED';

ALTER TYPE "priority_enum" RENAME VALUE 'Very-High' TO 'VERY_HIGH';
ALTER TYPE "priority_enum" RENAME VALUE 'High' TO 'HIGH';
ALTER TYPE "priority_enum" RENAME VALUE 'Medium' TO 'MEDIUM';
ALTER TYPE "priority_enum" RENAME VALUE 'Low' TO 'LOW';
ALTER TYPE "priority_enum" RENAME VALUE 'Very-Low' TO 'VERY_LOW';

ALTER TYPE "task_operation_status_enum" RENAME VALUE 'Pending' TO 'PENDING';
ALTER TYPE "task_operation_status_enum" RENAME VALUE 'In-Progress' TO 'IN_PROGRESS';
ALTER TYPE "task_operation_status_enum" RENAME VALUE 'Completed' TO 'COMPLETED';
ALTER TYPE "task_operation_status_enum" RENAME VALUE 'Failed' TO 'FAILED';
ALTER TYPE "task_operation_status_enum" RENAME VALUE 'Created' TO 'CREATED';
ALTER TYPE "task_operation_status_enum" RENAME VALUE 'Retried' TO 'RETRIED';
