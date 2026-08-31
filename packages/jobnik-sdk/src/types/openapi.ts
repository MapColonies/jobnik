/* eslint-disable */
// This file was auto-generated. Do not edit manually.
// To update, run the error generation script again.

import type { JobId, StageId, TaskId } from './brands';
export type paths = {
  '/v1/jobs': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Retrieve jobs matching criteria
     * @description Filter jobs by name, date range, priority. Optional stage inclusion.
     *     Returns empty array if no matches.
     */
    get: operations['findJobsV1'];
    put?: never;
    /**
     * Create job
     * @description Create job with config and metadata. Initial status: PENDING.
     */
    post: operations['createJobV1'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/jobs/{jobId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the job */
        jobId: components['parameters']['jobId'];
      };
      cookie?: never;
    };
    /**
     * Retrieve a specific job by its ID
     * @description Fetches detailed information about a job using its unique identifier.
     *     Includes job configuration, status, metadata, and completion percentage.
     *
     *     Optional inclusion of related stage data via the should_return_stages parameter,
     *     which allows clients to retrieve the complete job hierarchy in a single request.
     */
    get: operations['getJobByIdV1'];
    put?: never;
    post?: never;
    /**
     * Delete a job and all its associated resources (stages, tasks)
     * @description Permanently removes a job and all its associated stages and tasks from the system.
     *     This operation cascades to delete all child resources and cannot be undone.
     *
     *     The job must exist in the system for this operation to succeed.
     *     Jobs can only be deleted when they are in a finite state (COMPLETED, FAILED, or ABORTED).
     *     Attempting to delete a job in any other state will result in a 400 error.
     *
     *     Returns a success message with code JOB_DELETED_SUCCESSFULLY when completed.
     */
    delete: operations['deleteJobV1'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/jobs/{jobId}/user-metadata': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Update job's custom metadata
     * @description Updates the user-defined metadata object for a specific job.
     *     This endpoint allows clients to attach or modify arbitrary data related to a job
     *     without affecting the job's core properties or execution status.
     *
     *     User metadata is useful for storing application-specific context, tracking information,
     *     or any custom data needed by client applications.
     */
    patch: operations['updateUserMetadataV1'];
    trace?: never;
  };
  '/v1/jobs/{jobId}/priority': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the job */
        jobId: components['parameters']['jobId'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Modify job's priority level
     * @description Updates the priority level for a specific job.
     *     This affects how the job is scheduled relative to other jobs in the system.
     *
     *     Higher priority jobs will be processed before lower priority ones when resources
     *     are constrained. Priority changes take effect immediately and apply to all
     *     pending tasks associated with the job.
     */
    patch: operations['updateJobPriorityV1'];
    trace?: never;
  };
  '/v1/jobs/{jobId}/status': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the job */
        jobId: components['parameters']['jobId'];
      };
      cookie?: never;
    };
    get?: never;
    /**
     * Update job status for workflow control
     * @description Updates the operational status of a job to control its workflow execution. This endpoint
     *     supports user-initiated operations including PENDING (resume), ABORTED (cancel), and
     *     PAUSED (suspend), which may cascade changes to related stages and tasks.
     *
     *     Internal status transitions (such as IN_PROGRESS, COMPLETED, FAILED, CREATED) are managed
     *     automatically by the system based on stage and task completion, and cannot be set through
     *     this endpoint.
     *
     *     Status changes follow a state machine that enforces valid transitions. When a job's status
     *     is changed, the system will automatically update timestamps and completion percentages as
     *     appropriate.
     */
    put: operations['updateStatusV1'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/jobs/{jobId}/stages': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the job */
        jobId: components['parameters']['jobId'];
      };
      cookie?: never;
    };
    /**
     * Retrieve all stages for a specific job in execution order
     * @description Fetches all stages associated with the specified job ID, automatically ordered by
     *     their execution sequence (order field). Provides complete information about each
     *     stage including type, status, progress, and sequential order number.
     *
     *     Stages are returned in ascending order based on their order field (1, 2, 3, etc.)
     *     to maintain the correct workflow execution sequence defined when stages were created.
     *
     *     Optional inclusion of related task data via the should_return_tasks parameter,
     *     allowing clients to retrieve the complete job hierarchy in a single request.
     */
    get: operations['getStagesByJobIdV1'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/jobs/{jobId}/stage': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Add a new stage as the last stage in the job workflow
     * @description Appends a new stage to an existing job with automatic order assignment.
     *     The stage will be added after any existing stages in the job's workflow sequence.
     *     Each stage is automatically assigned an incremental order number (1, 2, 3, etc.)
     *     within the scope of its parent job to maintain execution sequence.
     *
     *     This endpoint allows for extending job workflows at runtime by adding new processing steps.
     *     The order field ensures stages are processed in the correct sequence when retrieved.
     *
     *     The job must exist and be in a valid state to accept new stages.
     */
    post: operations['addStageV1'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/stages': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Retrieve stages matching specified criteria
     * @description Returns a filtered list of stages based on the provided query parameters.
     *     Supports filtering by job ID, stage type, and status.
     *
     *     Optional inclusion of related task data via the should_return_tasks parameter
     *     allows clients to retrieve the complete stage hierarchy in a single request.
     */
    get: operations['getStagesV1'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/stages/{stageId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the stage */
        stageId: components['parameters']['stageId'];
      };
      cookie?: never;
    };
    /**
     * Retrieve a specific stage by its ID
     * @description Fetches detailed information about a stage using its unique identifier.
     *     Includes stage configuration, status, metadata, and completion information.
     *
     *     Optional inclusion of related task data via the should_return_tasks parameter,
     *     which allows clients to retrieve the complete stage hierarchy in a single request.
     */
    get: operations['getStageByIdV1'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/stages/{stageId}/summary': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get stage progress summary
     * @description Retrieves aggregated statistics about the tasks within a specific stage.
     *     Provides counts of tasks by status (pending, in progress, completed, etc.)
     *     and a total task count for monitoring stage progress.
     *
     *     This endpoint is useful for displaying progress indicators or status dashboards
     *     without needing to retrieve and process all individual task details.
     */
    get: operations['getStageSummaryV1'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/stages/{stageId}/user-metadata': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Update stage's custom metadata
     * @description Updates the user-defined metadata object for a specific stage.
     *     This endpoint allows clients to attach or modify arbitrary data related to a stage
     *     without affecting the stage's core properties or execution status.
     *
     *     User metadata is useful for storing application-specific context, tracking information,
     *     or any custom data needed by client applications.
     */
    patch: operations['updateStageUserMetadataV1'];
    trace?: never;
  };
  '/v1/stages/{stageId}/status': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    /**
     * Update stage status to trigger workflow progression
     * @description Updates the operational status of a stage to PENDING, which may trigger workflow
     *     transitions and cascade changes to related tasks and the parent job. This endpoint
     *     is restricted to manually advancing stages in the workflow sequence.
     *
     *     Common use cases:
     *     - Resuming a WAITING stage (e.g., after manual intervention or approval)
     *     - Unblocking workflow progression when a stage is ready to proceed
     *
     *     Internal status transitions (such as IN_PROGRESS, COMPLETED, FAILED, ABORTED,
     *     WAITING, CREATED) are managed automatically by the system based on task completion,
     *     job state, and workflow rules.
     *
     *     Status changes follow a state machine that enforces valid transitions. When a stage's
     *     status changes, it may automatically update the parent job's status and trigger
     *     transitions in subsequent stages (e.g., activating the next stage in the sequence).
     */
    put: operations['updateStageStatusV1'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/stages/{stageId}/tasks': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the stage */
        stageId: components['parameters']['stageId'];
      };
      cookie?: never;
    };
    /**
     * Retrieve all tasks for a specific stage
     * @description Fetches all tasks associated with the specified stage ID.
     *     Provides complete information about each task including type, status, and attempt count.
     */
    get: operations['getTasksByStageIdV1'];
    put?: never;
    /**
     * Add new tasks to an existing stage
     * @description Creates and appends new tasks to an existing stage.
     *     This endpoint allows for extending stage processing capabilities by adding more work units.
     *
     *     Task objects require type and data properties, with optional user metadata and
     *     maximum attempt configuration. Tasks are created with an initial status of PENDING.
     *
     *     The stage must exist and be in a valid state to accept new tasks.
     */
    post: operations['addTasksV1'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/stages/{stageType}/tasks/dequeue': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Stage type identifier for dequeuing tasks */
        stageType: components['parameters']['stageType'];
      };
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Find and claim the highest priority pending task of specified stage type
     * @description Retrieves the highest priority task of the specified stage type that is in PENDING or RETRIED status,
     *     and automatically updates its status to IN_PROGRESS. This endpoint implements a priority-based
     *     work queue pattern where workers can claim the next available task.
     *
     *     The endpoint considers task priority (inherited from the parent job), searches only for tasks
     *     that are in valid states (PENDING or RETRIED), and updates related stage and job status if needed.
     *
     *     If successful, returns the complete task details with status updated to IN_PROGRESS.
     */
    patch: operations['dequeueTaskV1'];
    trace?: never;
  };
  '/v1/tasks': {
    parameters: {
      query?: {
        /** @description Filter results by stage identifier */
        stage_id?: components['parameters']['paramStageId'];
        /** @description Filter results by stage type (e.g., processing, validation) */
        stage_type?: components['parameters']['paramStageType'];
        /** @description Filter results by update time, starting from this date/time */
        from_date?: components['parameters']['fromDate'];
        /** @description Filter results by update time, ending at this date/time */
        end_date?: components['parameters']['endDate'];
        /** @description Filter tasks by their operational status */
        status?: components['parameters']['paramsTaskStatus'];
        /** @description 1-based page number for pagination. Requesting beyond the last page returns an empty items array. */
        page?: components['parameters']['pageParam'];
        /** @description Number of items to return per page. */
        page_size?: components['parameters']['pageSizeParam'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Retrieve tasks matching specified criteria
     * @description Returns a filtered list of tasks based on the provided query parameters.
     *     Supports filtering by stage ID, task type, date range, and operational status.
     *
     *     This endpoint is useful for monitoring task progress across multiple stages and jobs,
     *     enabling clients to build custom dashboards or track specific task types.
     */
    get: operations['getTasksByCriteriaV1'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/tasks/{taskId}': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the task */
        taskId: components['parameters']['taskId'];
      };
      cookie?: never;
    };
    /**
     * Retrieve a specific task by its ID
     * @description Fetches detailed information about a task using its unique identifier.
     *     Returns complete task data including type, status, payload, and attempt information.
     */
    get: operations['getTaskByIdV1'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/tasks/{taskId}/user-metadata': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    /**
     * Update task's custom metadata
     * @description Updates the user-defined metadata object for a specific task.
     *     This endpoint allows clients to attach or modify arbitrary data related to a task
     *     without affecting the task's core properties or execution status.
     *
     *     User metadata is useful for storing application-specific context, tracking information,
     *     or any custom data needed by client applications.
     */
    patch: operations['updateTaskUserMetadataV1'];
    trace?: never;
  };
  '/v1/tasks/{taskId}/status': {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the task */
        taskId: components['parameters']['taskId'];
      };
      cookie?: never;
    };
    get?: never;
    /**
     * Mark task as completed or failed
     * @description Updates the operational status of a task to either COMPLETED or FAILED, which may trigger
     *     cascading updates to the parent stage and job. This endpoint is restricted to marking tasks
     *     as finished by external workers.
     *
     *     Internal status transitions (such as PENDING to IN_PROGRESS) are managed automatically
     *     by the system through the dequeue operation and cannot be set through this endpoint.
     *
     *     Status changes follow a state machine that enforces valid transitions. When a task's status
     *     is changed, the system will automatically update the parent stage's summary statistics and
     *     may affect the stage's overall status.
     */
    put: operations['updateTaskStatusV1'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
};
export type webhooks = Record<string, never>;
export type components = {
  schemas: {
    /**
     * Format: date-time
     * @description Timestamp indicating when the resource was created
     */
    creationTime: string;
    /**
     * Format: date-time
     * @description Timestamp indicating when the resource was last updated
     */
    updateTime: string;
    /**
     * Format: date-time
     * @description Timestamp indicating when the resource began processing (in-progress state)
     */
    startTime: string;
    /**
     * Format: date-time
     * @description Timestamp indicating when the resource reached a finite state (e.g., COMPLETED, FAILED, ABORTED)
     */
    endTime: string;
    /**
     * Format: uuid
     * @description Unique identifier for a job
     */
    jobId: JobId;
    /** @description Custom job configuration data containing job-specific parameters */
    jobPayload: {
      [key: string]: unknown;
    };
    /** @description Completion percentage of a job, stage, or task (0-100) */
    percentage: number;
    /** @description Number of times a task has been attempted */
    attempts: number;
    /** @description Maximum number of retries allowed for a task */
    maxAttempts: number;
    /**
     * Format: uuid
     * @description Unique identifier for a stage
     */
    stageId: StageId;
    /** @description Custom stage configuration data containing stage-specific parameters */
    stagePayload: {
      [key: string]: unknown;
    };
    /**
     * @description Stage execution order within job
     * @example 1
     */
    order: number;
    /**
     * @description Job priority for processing order. Higher priority processed first.
     *     VERY_HIGH > HIGH > MEDIUM > LOW > VERY_LOW
     * @example LOW
     * @enum {string}
     */
    priority: 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
    /**
     * @description W3C traceparent for distributed tracing. Auto-injected if not provided.
     *     See [W3C Trace Context](https://www.w3.org/TR/trace-context/).
     * @example 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
     */
    traceparent: string;
    /**
     * @description W3C tracestate for distributed tracing. Optional, auto-injected if available.
     * @example rojo=00f067aa0ba902b7,congo=t61rcWkgMzE
     */
    tracestate: string;
    /**
     * @description Success response codes
     * @example JOB_MODIFIED_SUCCESSFULLY
     * @enum {string}
     */
    successMessages: 'JOB_MODIFIED_SUCCESSFULLY' | 'TASK_MODIFIED_SUCCESSFULLY' | 'STAGE_MODIFIED_SUCCESSFULLY' | 'JOB_DELETED_SUCCESSFULLY';
    /**
     * @description User-controllable job statuses: PENDING (resume), ABORTED (cancel), PAUSED (suspend).
     *     System-managed: IN_PROGRESS, COMPLETED, FAILED, CREATED.
     * @example PENDING
     * @enum {string}
     */
    jobOperationStatus: 'PENDING' | 'ABORTED' | 'PAUSED';
    /**
     * @description All job states. User-controllable: PENDING, ABORTED, PAUSED. System-managed: IN_PROGRESS, COMPLETED, FAILED, CREATED.
     *     Terminal states: COMPLETED, FAILED, ABORTED.
     * @example PENDING
     * @enum {string}
     */
    jobOperationStatusResponse: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ABORTED' | 'PAUSED' | 'CREATED';
    /**
     * @description User-controllable stage status: PENDING only.
     *     System-managed: IN_PROGRESS, COMPLETED, FAILED, ABORTED, WAITING, CREATED.
     * @enum {string}
     */
    stageOperationStatus: 'PENDING';
    /**
     * @description All stage states. User-controllable: PENDING. System-managed: IN_PROGRESS, COMPLETED, FAILED, ABORTED, WAITING, CREATED.
     *     Terminal states: COMPLETED, FAILED, ABORTED.
     * @example PENDING
     * @enum {string}
     */
    stageOperationStatusResponse: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ABORTED' | 'WAITING' | 'CREATED';
    /**
     * @description User-controllable task statuses: COMPLETED, FAILED.
     *     System-managed: PENDING, IN_PROGRESS, CREATED, RETRIED.
     * @example COMPLETED
     * @enum {string}
     */
    taskOperationStatus: 'COMPLETED' | 'FAILED';
    /**
     * @description All task states including RETRIED for retry handling.
     *     Terminal states: COMPLETED, FAILED.
     * @example PENDING
     * @enum {string}
     */
    taskOperationStatusResponse: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CREATED' | 'RETRIED';
    /**
     * @description Job category/type for filtering and behavior
     * @example DEFAULT
     */
    jobName: string;
    /**
     * @description Free-form string identifier for stage functionality, allowing flexible categorization
     *     of stage operations. Used for routing tasks to appropriate workers and
     *     for filtering in API requests. Can be any descriptive name up to 50 characters.
     * @example unknown
     */
    stageType: string;
    /** @description Flag indicating whether to include complete stage details in job response payloads */
    returnStage: boolean;
    /** @description Flag indicating whether to include complete task details in stage response payloads */
    returnTask: boolean;
    /**
     * @description Application-specific custom data container that can store arbitrary client information without affecting core operations
     * @default {}
     */
    userMetadata: {
      [key: string]: unknown;
    };
    /**
     * @description Aggregated task statistics grouped by operational status, providing a complete overview of stage progress.
     *     Used for monitoring progress, generating dashboards, and determining when stages/jobs are complete.
     *     The total field should always equal the sum of all other status counts.
     */
    summary: {
      /** @description Number of tasks awaiting execution */
      pending: number;
      /** @description Number of tasks currently being processed */
      inProgress: number;
      /** @description Number of tasks that finished successfully */
      completed: number;
      /** @description Number of tasks that encountered errors and could not be completed */
      failed: number;
      /** @description Number of tasks in initial state before becoming pending */
      created: number;
      /** @description Number of tasks scheduled for re-execution after failure */
      retried: number;
      /** @description Total count of tasks belonging to the stage */
      total: number;
    };
    /**
     * @description Input payload for creating a new job in the system.
     *     Contains all required configuration for job execution, including processing mode,
     *     custom parameters, metadata.
     *
     *     Tracing fields (traceparent, tracestate) are optional:
     *     - If traceparent is provided, user's trace context is used (tracestate defaults to null if not provided)
     *     - If traceparent is not provided, the system automatically injects both traceparent and tracestate
     *       from the active OpenTelemetry context using propagation.inject() (tracestate may still be null if not available)
     */
    createJobPayload: {
      name: components['schemas']['jobName'];
      data: components['schemas']['jobPayload'];
      priority?: components['schemas']['priority'] & unknown;
      userMetadata?: components['schemas']['userMetadata'];
      traceparent?: components['schemas']['traceparent'];
      tracestate?: components['schemas']['tracestate'];
    };
    /**
     * @description Complete job information with status and metadata.
     *
     *     Comprehensive job response model containing all job details including configuration,
     *     execution status, progress tracking, and associated metadata. This schema represents
     *     the complete state of a job in the system and is returned by job retrieval operations.
     *
     *     Includes optional stage data when requested via query parameters, allowing clients
     *     to retrieve the complete job hierarchy in a single request.
     */
    job: {
      id: components['schemas']['jobId'];
      status: components['schemas']['jobOperationStatusResponse'];
      percentage: components['schemas']['percentage'];
      creationTime: components['schemas']['creationTime'];
      updateTime: components['schemas']['updateTime'];
      name: components['schemas']['jobName'];
      data: components['schemas']['jobPayload'];
      priority: components['schemas']['priority'];
      userMetadata: components['schemas']['userMetadata'];
      traceparent: components['schemas']['traceparent'];
      tracestate?: components['schemas']['tracestate'];
      stages?: components['schemas']['stageResponse'][];
    };
    createStagePayloadRequest: components['schemas']['createStagePayload'] & {
      /**
       * @description Optional flag indicating whether the stage should be created in a waiting state.
       *     If true, the stage will not start processing immediately and will require
       *     manual intervention to begin execution. Useful for staging workflows where
       *     stages need to be prepared but not executed until all dependencies are met.
       * @example false
       */
      startAsWaiting?: boolean;
    };
    /**
     * @description Input payload for creating a new stage within a job.
     *     Contains stage type, operational parameters, and optional user metadata.
     *
     *     Tracing fields (traceparent, tracestate) are optional:
     *     - If traceparent is provided, user's trace context is used (tracestate defaults to null if not provided)
     *     - If traceparent is not provided, the system automatically injects both traceparent and tracestate
     *       from the active OpenTelemetry context using propagation.inject() (tracestate may still be null if not available)
     */
    createStagePayload: {
      type: components['schemas']['stageType'];
      data: components['schemas']['stagePayload'];
      userMetadata?: components['schemas']['userMetadata'];
      traceparent?: components['schemas']['traceparent'];
      tracestate?: components['schemas']['tracestate'];
    };
    stageResponse: components['schemas']['createStagePayload'] & {
      id: components['schemas']['stageId'];
      summary: components['schemas']['summary'];
      percentage: components['schemas']['percentage'];
      status: components['schemas']['stageOperationStatusResponse'];
      jobId: components['schemas']['jobId'];
      order: components['schemas']['order'];
      traceparent: components['schemas']['traceparent'];
    };
    getStageResponse: components['schemas']['stageResponse'] & {
      /** @description Associated tasks belonging to this stage */
      tasks?: components['schemas']['taskResponse'][];
    };
    /**
     * Format: uuid
     * @description Unique identifier for a task, generated by the system upon task creation
     */
    taskId: TaskId;
    /**
     * @description Custom task configuration data containing operation-specific parameters.
     *     The schema varies based on task type and contains all necessary information
     *     for task execution by workers.
     */
    taskPayload: {
      [key: string]: unknown;
    };
    /**
     * @description Input payload for creating a new task within a stage.
     *     Contains task type, operational parameters, and optional retry configuration.
     *     Used when adding tasks to existing stages.
     *
     *     Trace propagation  (traceparent, tracestate) are optional:
     *     - If traceparent is provided, user's trace context is used (tracestate defaults to null if not provided)
     *     - If traceparent is not provided, the system automatically injects both traceparent and tracestate
     *       from the active OpenTelemetry context using propagation.inject() (tracestate may still be null if not available)
     */
    createTaskPayload: {
      data: components['schemas']['taskPayload'];
      userMetadata?: components['schemas']['userMetadata'];
      maxAttempts?: components['schemas']['maxAttempts'];
      traceparent?: components['schemas']['traceparent'];
      tracestate?: components['schemas']['tracestate'];
    };
    /**
     * @description Complete task information returned by the API, including all configuration
     *     data along with execution status, attempt tracking, and associated stage reference.
     *     Used when retrieving task details or after task creation.
     */
    taskResponse: {
      id: components['schemas']['taskId'];
      data: components['schemas']['taskPayload'];
      stageId: components['schemas']['stageId'];
      userMetadata: components['schemas']['userMetadata'];
      creationTime: components['schemas']['creationTime'];
      updateTime: components['schemas']['updateTime'];
      startTime?: components['schemas']['startTime'];
      endTime?: components['schemas']['endTime'];
      status: components['schemas']['taskOperationStatusResponse'];
      attempts: components['schemas']['attempts'];
      maxAttempts: components['schemas']['maxAttempts'];
      traceparent: components['schemas']['traceparent'];
      tracestate?: components['schemas']['tracestate'];
    };
    /**
     * @description Standard success response structure used for operations that don't
     *     return entity data, providing a standardized confirmation message.
     */
    defaultOkMessage: {
      code: components['schemas']['successMessages'];
    };
    /**
     * @description Foundation schema for standardized error responses across all API endpoints.
     *     Provides consistent structure with human-readable message and common-readable code fields
     *     that are extended by individual endpoints to define their specific error scenarios.
     */
    baseErrorResponse: {
      /** @description Human-readable error message describing the issue */
      message: string;
      /** @description common-readable error code indicating the specific error type */
      code: string;
    };
    internalErrorsResponse: components['schemas']['baseErrorResponse'] & {
      /** @enum {unknown} */
      code: 'DATABASE_RELATED_ERROR' | 'UNKNOWN_ERROR';
    };
    badRequestResponse: components['schemas']['baseErrorResponse'] & {
      /** @enum {unknown} */
      code: 'VALIDATION_ERROR';
    };
    jobNotFoundResponse: components['schemas']['baseErrorResponse'] & {
      /** @enum {unknown} */
      code: 'JOB_NOT_FOUND';
    };
    stageNotFoundResponse: components['schemas']['baseErrorResponse'] & {
      /** @enum {unknown} */
      code: 'STAGE_NOT_FOUND';
    };
    taskNotFoundResponse: components['schemas']['baseErrorResponse'] & {
      /** @enum {unknown} */
      code: 'TASK_NOT_FOUND';
    };
    /** @description Paginated list of jobs with total count. */
    jobsPaginatedResponse: {
      /** @description Total number of jobs matching the filter criteria */
      total: number;
      /** @description Page of job records */
      items: components['schemas']['job'][];
    };
    /** @description Paginated list of stages with total count. */
    stagesPaginatedResponse: {
      /** @description Total number of stages matching the filter criteria */
      total: number;
      /** @description Page of stage records */
      items: components['schemas']['getStageResponse'][];
    };
    /** @description Paginated list of tasks with total count. */
    tasksPaginatedResponse: {
      /** @description Total number of tasks matching the filter criteria */
      total: number;
      /** @description Page of task records */
      items: components['schemas']['taskResponse'][];
    };
  };
  responses: never;
  parameters: {
    /** @description Unique identifier for the job */
    jobId: components['schemas']['jobId'];
    /** @description Unique identifier for the stage */
    stageId: components['schemas']['stageId'];
    /** @description Unique identifier for the task */
    taskId: components['schemas']['taskId'];
    /** @description Filter tasks by their operational status */
    paramsTaskStatus: components['schemas']['taskOperationStatusResponse'];
    /** @description Filter jobs by their name/type */
    jobNameQueryParam: components['schemas']['jobName'];
    /** @description Filter jobs by their priority level */
    priority: components['schemas']['priority'];
    /** @description Filter results by update time, starting from this date/time */
    fromDate: string;
    /** @description Filter results by update time, ending at this date/time */
    endDate: string;
    /** @description When true, includes stage data in the response */
    includeStages: components['schemas']['returnStage'];
    /** @description When true, includes task data in the response */
    includeTasks: components['schemas']['returnTask'];
    /** @description Filter results by stage identifier */
    paramStageId: components['schemas']['stageId'];
    /** @description Filter results by job identifier */
    paramJobId: components['schemas']['jobId'];
    /** @description Filter results by stage type (e.g., processing, validation) */
    paramStageType: components['schemas']['stageType'];
    /** @description Stage type identifier for dequeuing tasks */
    stageType: components['schemas']['stageType'];
    /**
     * @description Filter results by stage operational status (e.g., PENDING, IN_PROGRESS).
     *     Used to find stages in specific execution states.
     */
    stageStatus: components['schemas']['stageOperationStatusResponse'];
    /** @description 1-based page number for pagination. Requesting beyond the last page returns an empty items array. */
    pageParam: number;
    /** @description Number of items to return per page. */
    pageSizeParam: number;
  };
  requestBodies: never;
  headers: never;
  pathItems: never;
};
export type $defs = Record<string, never>;
export interface operations {
  findJobsV1: {
    parameters: {
      query?: {
        /** @description Filter jobs by their name/type */
        job_name?: components['parameters']['jobNameQueryParam'];
        /** @description Filter results by update time, starting from this date/time */
        from_date?: components['parameters']['fromDate'];
        /** @description Filter results by update time, ending at this date/time */
        end_date?: components['parameters']['endDate'];
        /** @description Filter jobs by their priority level */
        priority?: components['parameters']['priority'];
        /** @description When true, includes stage data in the response */
        should_return_stages?: components['parameters']['includeStages'];
        /** @description 1-based page number for pagination. Requesting beyond the last page returns an empty items array. */
        page?: components['parameters']['pageParam'];
        /** @description Number of items to return per page. */
        page_size?: components['parameters']['pageSizeParam'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successfully retrieved matching jobs */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['jobsPaginatedResponse'];
        };
      };
      /** @description Invalid query parameters */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  createJobV1: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['createJobPayload'];
      };
    };
    responses: {
      /** @description Job created successfully */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['job'];
        };
      };
      /** @description Invalid request, could not create job */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  getJobByIdV1: {
    parameters: {
      query?: {
        /** @description When true, includes stage data in the response */
        should_return_stages?: components['parameters']['includeStages'];
      };
      header?: never;
      path: {
        /** @description Unique identifier for the job */
        jobId: components['parameters']['jobId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Job data retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['job'];
        };
      };
      /** @description Invalid request, could not get job */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Job not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['jobNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  deleteJobV1: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the job */
        jobId: components['parameters']['jobId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Job deleted successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "code": "JOB_DELETED_SUCCESSFULLY"
           *     }
           */
          'application/json': components['schemas']['defaultOkMessage'];
        };
      };
      /** @description Invalid parameters or validation error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['baseErrorResponse'] & {
            /** @enum {unknown} */
            code: 'VALIDATION_ERROR' | 'JOB_NOT_IN_FINITE_STATE';
          };
        };
      };
      /** @description Job not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['jobNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  updateUserMetadataV1: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the job */
        jobId: components['parameters']['jobId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['userMetadata'];
      };
    };
    responses: {
      /** @description User metadata successfully updated */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "code": "JOB_MODIFIED_SUCCESSFULLY"
           *     }
           */
          'application/json': components['schemas']['defaultOkMessage'];
        };
      };
      /** @description Invalid metadata format or validation error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Job not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['jobNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  updateJobPriorityV1: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the job */
        jobId: components['parameters']['jobId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          priority: components['schemas']['priority'];
        };
      };
    };
    responses: {
      /** @description Job priority successfully changed */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "code": "JOB_MODIFIED_SUCCESSFULLY"
           *     }
           */
          'application/json': components['schemas']['defaultOkMessage'];
        };
      };
      /** @description No change made - requested priority equals current priority */
      204: {
        headers: {
          /** @description Won't change priority if equal to current */
          Reason?: string;
          [name: string]: unknown;
        };
        content?: never;
      };
      /** @description Invalid priority value or other request error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Job not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['jobNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  updateStatusV1: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the job */
        jobId: components['parameters']['jobId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          status: components['schemas']['jobOperationStatus'];
        };
      };
    };
    responses: {
      /** @description Job status successfully changed */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "code": "JOB_MODIFIED_SUCCESSFULLY"
           *     }
           */
          'application/json': components['schemas']['defaultOkMessage'];
        };
      };
      /** @description Invalid status or illegal state transition */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['baseErrorResponse'] & {
            /** @enum {unknown} */
            code?: 'VALIDATION_ERROR' | 'ILLEGAL_JOB_STATUS_TRANSITION';
          };
        };
      };
      /** @description Job not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['jobNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  getStagesByJobIdV1: {
    parameters: {
      query?: {
        /** @description When true, includes task data in the response */
        should_return_tasks?: components['parameters']['includeTasks'];
      };
      header?: never;
      path: {
        /** @description Unique identifier for the job */
        jobId: components['parameters']['jobId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successfully retrieved stages for the specified job */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['getStageResponse'][];
        };
      };
      /** @description Invalid job ID format or other parameter error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Job not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['jobNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  addStageV1: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the job */
        jobId: components['parameters']['jobId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['createStagePayloadRequest'];
      };
    };
    responses: {
      /** @description Stage successfully created and added to the job */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['stageResponse'];
        };
      };
      /** @description Invalid request format. */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['baseErrorResponse'] & {
            /** @enum {unknown} */
            code?: 'VALIDATION_ERROR' | 'JOB_IN_FINITE_STATE';
          };
        };
      };
      /** @description Job not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['jobNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  getStagesV1: {
    parameters: {
      query?: {
        /** @description Filter results by job identifier */
        job_id?: components['parameters']['paramJobId'];
        /** @description Filter results by stage type (e.g., processing, validation) */
        stage_type?: components['parameters']['paramStageType'];
        /**
         * @description Filter results by stage operational status (e.g., PENDING, IN_PROGRESS).
         *     Used to find stages in specific execution states.
         */
        stage_operation_status?: components['parameters']['stageStatus'];
        /** @description When true, includes task data in the response */
        should_return_tasks?: components['parameters']['includeTasks'];
        /** @description 1-based page number for pagination. Requesting beyond the last page returns an empty items array. */
        page?: components['parameters']['pageParam'];
        /** @description Number of items to return per page. */
        page_size?: components['parameters']['pageSizeParam'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successfully retrieved matching stages */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['stagesPaginatedResponse'];
        };
      };
      /** @description Invalid query parameters */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  getStageByIdV1: {
    parameters: {
      query?: {
        /** @description When true, includes task data in the response */
        should_return_tasks?: components['parameters']['includeTasks'];
      };
      header?: never;
      path: {
        /** @description Unique identifier for the stage */
        stageId: components['parameters']['stageId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Stage data retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['getStageResponse'];
        };
      };
      /** @description Invalid request format or parameters */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Stage not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['stageNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  getStageSummaryV1: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the stage */
        stageId: components['parameters']['stageId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Stage summary retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['summary'];
        };
      };
      /** @description Invalid stage ID format */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Stage not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['stageNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  updateStageUserMetadataV1: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the stage */
        stageId: components['parameters']['stageId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['userMetadata'];
      };
    };
    responses: {
      /** @description User metadata successfully updated */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "code": "STAGE_MODIFIED_SUCCESSFULLY"
           *     }
           */
          'application/json': components['schemas']['defaultOkMessage'];
        };
      };
      /** @description Invalid metadata format or validation error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Stage not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['stageNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  updateStageStatusV1: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the stage */
        stageId: components['parameters']['stageId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          status: components['schemas']['stageOperationStatus'];
        };
      };
    };
    responses: {
      /** @description Stage status successfully changed */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "code": "STAGE_MODIFIED_SUCCESSFULLY"
           *     }
           */
          'application/json': components['schemas']['defaultOkMessage'];
        };
      };
      /** @description Invalid status or illegal state transition */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['baseErrorResponse'] & {
            /** @enum {unknown} */
            code?: 'VALIDATION_ERROR' | 'ILLEGAL_STAGE_STATUS_TRANSITION';
          };
        };
      };
      /** @description Stage not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['stageNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['baseErrorResponse'] & {
            /** @enum {unknown} */
            code?: 'DATABASE_RELATED_ERROR' | 'UNKNOWN_ERROR' | 'ILLEGAL_JOB_STATUS_TRANSITION' | 'JOB_NOT_FOUND';
          };
        };
      };
    };
  };
  getTasksByStageIdV1: {
    parameters: {
      query?: {
        /** @description 1-based page number for pagination. Requesting beyond the last page returns an empty items array. */
        page?: components['parameters']['pageParam'];
        /** @description Number of items to return per page. */
        page_size?: components['parameters']['pageSizeParam'];
      };
      header?: never;
      path: {
        /** @description Unique identifier for the stage */
        stageId: components['parameters']['stageId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successfully retrieved tasks for the specified stage */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['tasksPaginatedResponse'];
        };
      };
      /** @description Invalid stage ID format or other parameter error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Stage not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['stageNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  addTasksV1: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the stage */
        stageId: components['parameters']['stageId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['createTaskPayload'][];
      };
    };
    responses: {
      /** @description Tasks successfully created and added to the stage */
      201: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['taskResponse'][];
        };
      };
      /** @description Invalid request format or validation error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['baseErrorResponse'] & {
            /** @enum {unknown} */
            code?: 'VALIDATION_ERROR' | 'STAGE_IN_FINITE_STATE' | 'NOT_ALLOWED_TO_ADD_TASKS_TO_IN_PROGRESS_STAGE';
          };
        };
      };
      /** @description Stage not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['stageNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  dequeueTaskV1: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Stage type identifier for dequeuing tasks */
        stageType: components['parameters']['stageType'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Task successfully dequeued and status updated to IN_PROGRESS */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['taskResponse'];
        };
      };
      /** @description Invalid stageType parameter or other validation error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description No pending tasks of requested type are available */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['taskNotFoundResponse'];
        };
      };
      /** @description task was claimed by another worker. This occurs when multiple workers attempt to dequeue the same task simultaneously. The client should retry the dequeue operation to get a different task. */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['baseErrorResponse'] & {
            /** @enum {unknown} */
            code?: 'TASK_STATUS_UPDATE_FAILED';
          };
        };
      };
      /** @description Internal server error or invalid state transition */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['baseErrorResponse'] & {
            /** @enum {unknown} */
            code?:
              | 'DATABASE_RELATED_ERROR'
              | 'UNKNOWN_ERROR'
              | 'TASK_STATUS_UPDATE_FAILED'
              | 'ILLEGAL_TASK_STATUS_TRANSITION'
              | 'ILLEGAL_STAGE_STATUS_TRANSITION'
              | 'ILLEGAL_JOB_STATUS_TRANSITION'
              | 'STAGE_NOT_FOUND'
              | 'JOB_NOT_FOUND';
          };
        };
      };
    };
  };
  getTasksByCriteriaV1: {
    parameters: {
      query?: {
        /** @description Filter results by stage identifier */
        stage_id?: components['parameters']['paramStageId'];
        /** @description Filter results by stage type (e.g., processing, validation) */
        stage_type?: components['parameters']['paramStageType'];
        /** @description Filter results by update time, starting from this date/time */
        from_date?: components['parameters']['fromDate'];
        /** @description Filter results by update time, ending at this date/time */
        end_date?: components['parameters']['endDate'];
        /** @description Filter tasks by their operational status */
        status?: components['parameters']['paramsTaskStatus'];
        /** @description 1-based page number for pagination. Requesting beyond the last page returns an empty items array. */
        page?: components['parameters']['pageParam'];
        /** @description Number of items to return per page. */
        page_size?: components['parameters']['pageSizeParam'];
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Successfully retrieved matching tasks */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['tasksPaginatedResponse'];
        };
      };
      /** @description Invalid query parameters */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  getTaskByIdV1: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the task */
        taskId: components['parameters']['taskId'];
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Task data retrieved successfully */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['taskResponse'];
        };
      };
      /** @description Invalid task ID format or other parameter error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Task not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['taskNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  updateTaskUserMetadataV1: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the task */
        taskId: components['parameters']['taskId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['userMetadata'];
      };
    };
    responses: {
      /** @description User metadata successfully updated */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          /**
           * @example {
           *       "code": "TASK_MODIFIED_SUCCESSFULLY"
           *     }
           */
          'application/json': components['schemas']['defaultOkMessage'];
        };
      };
      /** @description Invalid metadata format or validation error */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['badRequestResponse'];
        };
      };
      /** @description Task not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['taskNotFoundResponse'];
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['internalErrorsResponse'];
        };
      };
    };
  };
  updateTaskStatusV1: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        /** @description Unique identifier for the task */
        taskId: components['parameters']['taskId'];
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': {
          status: components['schemas']['taskOperationStatus'];
        };
      };
    };
    responses: {
      /** @description Task status successfully changed */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['taskResponse'];
        };
      };
      /** @description Invalid status or illegal state transition */
      400: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['baseErrorResponse'] & {
            /** @enum {unknown} */
            code?: 'VALIDATION_ERROR' | 'ILLEGAL_TASK_STATUS_TRANSITION';
          };
        };
      };
      /** @description Task not found */
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['taskNotFoundResponse'];
        };
      };
      /** @description task status was modified by another request. This occurs when multiple workers attempt to update the same task simultaneously. The current state of the task has changed since it was retrieved. */
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['baseErrorResponse'] & {
            /** @enum {unknown} */
            code?: 'TASK_STATUS_UPDATE_FAILED';
          };
        };
      };
      /** @description Internal server error */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['baseErrorResponse'] & {
            /** @enum {unknown} */
            code?:
              | 'DATABASE_RELATED_ERROR'
              | 'UNKNOWN_ERROR'
              | 'TASK_STATUS_UPDATE_FAILED'
              | 'ILLEGAL_TASK_STATUS_TRANSITION'
              | 'ILLEGAL_STAGE_STATUS_TRANSITION'
              | 'ILLEGAL_JOB_STATUS_TRANSITION'
              | 'STAGE_NOT_FOUND'
              | 'JOB_NOT_FOUND';
          };
        };
      };
    };
  };
}
