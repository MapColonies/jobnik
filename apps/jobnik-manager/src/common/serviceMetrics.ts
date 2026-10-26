/* eslint-disable @typescript-eslint/naming-convention */
import type { Logger } from '@map-colonies/js-logger';
import type { FactoryFunction } from 'tsyringe';
import type { Registry } from 'prom-client';
import { Gauge } from 'prom-client';
import { count, eq } from 'drizzle-orm';
import { SERVICES } from '@common/constants';
import { TaskOperationStatus, StageOperationStatus, JobOperationStatus } from '@src/db/persistenceModel';
import type { Drizzle } from '@src/db/drizzle';
import { jobTable, stageTable, taskTable } from '@src/db/entities';

/**
 * Get count of jobs by all statuses
 */
const getJobCountsByStatus = async (drizzle: Drizzle): Promise<{ job_status: string; count: number }[]> => {
  if (process.env.NODE_ENV === 'test') return [];

  try {
    const results: { job_status: string; count: number }[] = await drizzle
      .select({ job_status: jobTable.status, count: count() })
      .from(jobTable)
      .groupBy(jobTable.status);

    // Ensure all statuses are represented
    const allStatuses = Object.values(JobOperationStatus);

    for (const status of allStatuses) {
      const existing = results.find((r) => r.job_status === status);
      if (!existing) {
        results.push({
          job_status: status,
          count: 0,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
};

/**
 * Get count of stages by all statuses and stage type
 */
const getStageCountsByStatus = async (drizzle: Drizzle): Promise<{ stage_status: string; stage_type: string; count: number }[]> => {
  if (process.env.NODE_ENV === 'test') return [];

  try {
    const results: { stage_status: string; stage_type: string; count: number }[] = await drizzle
      .select({ stage_status: stageTable.status, stage_type: stageTable.type, count: count() })
      .from(stageTable)
      .groupBy(stageTable.status, stageTable.type);

    const uniqueStageTypes = [...new Set(results.map((result) => result.stage_type))];

    // Ensure all combinations of status and stage type are represented
    const allStatuses = Object.values(StageOperationStatus);

    for (const stage_status of allStatuses) {
      for (const stage_type of uniqueStageTypes) {
        const existing = results.find((r) => r.stage_status === stage_status && r.stage_type === stage_type);
        if (!existing) {
          results.push({
            stage_status,
            stage_type,
            count: 0,
          });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
};

/**
 * Get count of tasks by all statuses and stage type
 */
const getTaskCountsByStatus = async (drizzle: Drizzle): Promise<{ task_status: string; stage_type: string; count: number }[]> => {
  if (process.env.NODE_ENV === 'test') return [];

  try {
    const results: { task_status: string; stage_type: string; count: number }[] = await drizzle
      .select({ task_status: taskTable.status, stage_type: stageTable.type, count: count() })
      .from(taskTable)
      .innerJoin(stageTable, eq(taskTable.stageId, stageTable.id))
      .groupBy(taskTable.status, stageTable.type);

    const uniqueStageTypes = [...new Set(results.map((result) => result.stage_type))];

    // Ensure all combinations of status and stage type are represented
    const allStatuses = Object.values(TaskOperationStatus);

    for (const status of allStatuses) {
      for (const stage_type of uniqueStageTypes) {
        const existing = results.find((r) => r.task_status === status && r.stage_type === stage_type);
        if (!existing) {
          results.push({
            task_status: status,
            stage_type,
            count: 0,
          });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
};

/**
 * Get queue depth by stage type and priority using database-level aggregation
 */
const getTaskQueueDepthByStageType = async (
  drizzle: Drizzle,
  logger: Logger
): Promise<{ stage_type: string; priority: string; task_status: string; count: number }[]> => {
  if (process.env.NODE_ENV === 'test') return [];

  try {
    return await drizzle
      .select({ stage_type: stageTable.type, priority: jobTable.priority, task_status: taskTable.status, count: count(taskTable.id) })
      .from(taskTable)
      .innerJoin(stageTable, eq(taskTable.stageId, stageTable.id))
      .innerJoin(jobTable, eq(stageTable.jobId, jobTable.id))
      .groupBy(stageTable.type, jobTable.priority, taskTable.status)
      .orderBy(stageTable.type, jobTable.priority, taskTable.status);
  } catch (err) {
    logger.error({
      msg: 'Failed to get task queue depth by stage type using database aggregation',
      err,
    });
    return [];
  }
};

/**
 * Initialize gauge for tracking tasks by all statuses
 */
const initializeTasksByStatusGauge = (logger: Logger, drizzle: Drizzle, serviceMetricsRegistry: Registry): void => {
  new Gauge({
    name: 'jobnik_tasks_by_status',
    help: 'Current number of tasks by status',
    labelNames: ['task_status', 'stage_type'],
    registers: [serviceMetricsRegistry],
    async collect(this: Gauge): Promise<void> {
      const startTime = Date.now();
      try {
        this.reset();

        const statusCounts = await getTaskCountsByStatus(drizzle);

        for (const statusCount of statusCounts) {
          this.set({ task_status: statusCount.task_status, stage_type: statusCount.stage_type }, statusCount.count);
        }

        logger.debug({
          msg: 'Service-level tasks by status gauge updated successfully',
          statusCounts: statusCounts.length,
          totalTasks: statusCounts.reduce((sum, s) => sum + s.count, 0),
          executionTimeMs: Date.now() - startTime,
        });
      } catch (err) {
        logger.error({
          msg: 'Failed to update service-level tasks by status gauge',
          err: err instanceof Error ? err.message : 'Unknown error',
          executionTimeMs: Date.now() - startTime,
        });
        this.reset();
      }
    },
  });
};

/**
 * Initialize gauge for tracking stages by all statuses
 */
const initializeStagesByStatusGauge = (logger: Logger, drizzle: Drizzle, serviceMetricsRegistry: Registry): void => {
  new Gauge({
    name: 'jobnik_stages_by_status',
    help: 'Current number of stages by status',
    labelNames: ['stage_status', 'stage_type'],
    registers: [serviceMetricsRegistry],
    async collect(this: Gauge): Promise<void> {
      const startTime = Date.now();
      try {
        this.reset();

        const statusCounts = await getStageCountsByStatus(drizzle);

        for (const statusCount of statusCounts) {
          this.set({ stage_status: statusCount.stage_status, stage_type: statusCount.stage_type }, statusCount.count);
        }

        logger.debug({
          msg: 'Service-level stages by status gauge updated successfully',
          statusCounts: statusCounts.length,
          totalStages: statusCounts.reduce((sum, s) => sum + s.count, 0),
          executionTimeMs: Date.now() - startTime,
        });
      } catch (err) {
        logger.error({
          msg: 'Failed to update service-level stages by status gauge',
          err: err instanceof Error ? err.message : 'Unknown error',
          executionTimeMs: Date.now() - startTime,
        });
        this.reset();
      }
    },
  });
};

/**
 * Initialize gauge for tracking jobs by all statuses
 */
const initializeJobsByStatusGauge = (logger: Logger, drizzle: Drizzle, serviceMetricsRegistry: Registry): void => {
  new Gauge({
    name: 'jobnik_jobs_by_status',
    help: 'Current number of jobs by status',
    labelNames: ['job_status'],
    registers: [serviceMetricsRegistry],
    async collect(this: Gauge): Promise<void> {
      const startTime = Date.now();
      try {
        this.reset();

        const statusCounts = await getJobCountsByStatus(drizzle);

        for (const statusCount of statusCounts) {
          this.set({ job_status: statusCount.job_status }, statusCount.count);
        }

        logger.debug({
          msg: 'Service-level jobs by status gauge updated successfully',
          statusCounts: statusCounts.length,
          totalJobs: statusCounts.reduce((sum, s) => sum + s.count, 0),
          executionTimeMs: Date.now() - startTime,
        });
      } catch (err) {
        logger.error({
          msg: 'Failed to update service-level jobs by status gauge',
          err: err instanceof Error ? err.message : 'Unknown error',
          executionTimeMs: Date.now() - startTime,
        });
        this.reset();
      }
    },
  });
};

/**
 * Initialize gauge for tracking tasks by stage type and priority
 */
const initializeTasksByTypePriorityGauge = (logger: Logger, drizzle: Drizzle, serviceMetricsRegistry: Registry): void => {
  new Gauge({
    name: 'jobnik_tasks_count',
    help: 'Current number of entire tasks by stage type and priority',
    labelNames: ['stage_type', 'priority', 'task_status'],
    registers: [serviceMetricsRegistry],
    async collect(this: Gauge): Promise<void> {
      const startTime = Date.now();
      try {
        // Clear all previous metrics first
        this.reset();

        const queueDepths = await getTaskQueueDepthByStageType(drizzle, logger);

        // If no pending tasks, explicitly set a zero metric to ensure proper clearing
        if (queueDepths.length === 0) {
          // Don't set any metrics - let the reset() clear everything
          logger.debug({
            msg: 'No pending tasks found - all metrics cleared',
            executionTimeMs: Date.now() - startTime,
          });
        } else {
          // Set metrics for existing pending tasks
          for (const queueDepth of queueDepths) {
            this.set({ stage_type: queueDepth.stage_type, priority: queueDepth.priority, task_status: queueDepth.task_status }, queueDepth.count);
          }

          logger.debug({
            msg: 'Service-level pending tasks by stage type gauge updated successfully',
            queueDepthsCount: queueDepths.length,
            executionTimeMs: Date.now() - startTime,
          });
        }
      } catch (err) {
        logger.error({
          msg: 'Failed to update service-level tasks status by stage type gauge',
          err: err instanceof Error ? err.message : 'Unknown error',
          executionTimeMs: Date.now() - startTime,
        });
        // On error, reset to ensure no stale data
        this.reset();
      }
    },
  });
};

/**
 * Initialize all service-level gauge metrics
 */
const initializeServiceGauges = (logger: Logger, drizzle: Drizzle, serviceMetricsRegistry: Registry): void => {
  initializeTasksByStatusGauge(logger, drizzle, serviceMetricsRegistry);
  initializeStagesByStatusGauge(logger, drizzle, serviceMetricsRegistry);
  initializeJobsByStatusGauge(logger, drizzle, serviceMetricsRegistry);
  initializeTasksByTypePriorityGauge(logger, drizzle, serviceMetricsRegistry);
};

/**
 * Service-level metrics factory that should only be initialized once per service
 * These metrics query the database and should not be duplicated across pods
 */
const serviceMetricsFactory: FactoryFunction<void> = (dependencyContainer) => {
  const logger = dependencyContainer.resolve<Logger>(SERVICES.LOGGER);
  const drizzle = dependencyContainer.resolve<Drizzle>(SERVICES.DRIZZLE);
  const serviceMetricsRegistry = dependencyContainer.resolve<Registry>(SERVICES.SERVICE_METRICS);

  initializeServiceGauges(logger, drizzle, serviceMetricsRegistry);
};

export const SERVICE_METRICS_SYMBOL = Symbol('serviceMetricsFactory');

export { serviceMetricsFactory };
