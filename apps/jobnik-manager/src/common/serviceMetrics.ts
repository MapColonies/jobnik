/* eslint-disable @typescript-eslint/naming-convention */
import type { Logger } from '@map-colonies/js-logger';
import type { FactoryFunction } from 'tsyringe';
import type { Registry } from 'prom-client';
import { Gauge } from 'prom-client';
import { TaskOperationStatus, StageOperationStatus, JobOperationStatus, type PrismaClient } from '@prismaClient';
import { SERVICES } from '@common/constants';

/**
 * Get count of jobs by all statuses
 */
const getJobCountsByStatus = async (prisma: PrismaClient): Promise<{ job_status: string; count: number }[]> => {
  if (process.env.NODE_ENV === 'test') return [];

  try {
    const statusCounts = await prisma.job.groupBy({
      by: ['status'],
      _count: {
        id: true,
      },
    });

    // Convert to result format
    const results: { job_status: string; count: number }[] = statusCounts.map((item) => ({
      job_status: item.status,
      count: item._count.id,
    }));

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
const getStageCountsByStatus = async (prisma: PrismaClient): Promise<{ stage_status: string; stage_type: string; count: number }[]> => {
  if (process.env.NODE_ENV === 'test') return [];

  try {
    // Get all stages with their type information
    const stages = await prisma.stage.findMany({
      select: {
        id: true,
        status: true,
        type: true,
      },
    });

    // Extract unique stage types from the data we already have
    const uniqueStageTypes = [...new Set(stages.map((stage) => stage.type))];

    // Group by status and stage type
    const groupCounts: { [key: string]: number } = {};

    for (const stage of stages) {
      const key = `${stage.status}-${stage.type}`;
      const currentCount = groupCounts[key] ?? 0;
      groupCounts[key] = currentCount + 1;
    }

    // Convert to result format
    const results: { stage_status: string; stage_type: string; count: number }[] = [];

    for (const [key, count] of Object.entries(groupCounts)) {
      const parts = key.split('-');
      const stage_status = parts[0];
      const stage_type = parts.slice(1).join('-'); // Handle stage types that might contain dashes

      if (stage_status !== undefined && stage_status !== '') {
        results.push({
          stage_status,
          stage_type,
          count,
        });
      }
    }

    // Ensure all combinations of status and stage type are represented
    const allStatuses = Object.values(StageOperationStatus);

    // Only create matrix if we have actual stage types
    if (uniqueStageTypes.length > 0) {
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
    }

    return results;
  } catch {
    return [];
  }
};

/**
 * Get count of tasks by all statuses and stage type
 */
const getTaskCountsByStatus = async (prisma: PrismaClient): Promise<{ task_status: string; stage_type: string; count: number }[]> => {
  if (process.env.NODE_ENV === 'test') return [];

  try {
    // Get all tasks with their stage information
    const tasksWithStages = await prisma.task.findMany({
      select: {
        id: true,
        status: true,
        stage: {
          select: {
            type: true,
          },
        },
      },
    });

    // Extract unique stage types from the data we already have
    const uniqueStageTypes = [...new Set(tasksWithStages.map((task) => task.stage.type))];

    // Group by status and stage type
    const groupCounts: { [key: string]: number } = {};

    for (const task of tasksWithStages) {
      const stage_type = task.stage.type;
      const key = `${task.status}-${stage_type}`;
      const currentCount = groupCounts[key] ?? 0;
      groupCounts[key] = currentCount + 1;
    }

    // Convert to result format
    const results: { task_status: string; stage_type: string; count: number }[] = [];

    for (const [key, count] of Object.entries(groupCounts)) {
      const parts = key.split('-');
      const task_status = parts[0];
      const stage_type = parts.slice(1).join('-'); // Handle stage types that might contain dashes

      if (task_status !== undefined && task_status !== '') {
        results.push({
          task_status,
          stage_type,
          count,
        });
      }
    }

    // Ensure all combinations of status and stage type are represented
    const allStatuses = Object.values(TaskOperationStatus);

    // Only create matrix if we have actual stage types
    if (uniqueStageTypes.length > 0) {
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
  prisma: PrismaClient,
  logger: Logger
): Promise<{ stage_type: string; priority: string; task_status: string; count: number }[]> => {
  if (process.env.NODE_ENV === 'test') return [];

  try {
    // Use raw query for optimal performance with complex joins and grouping
    const results = await prisma.$queryRaw<{ stage_type: string; priority: string; task_status: string; count: bigint }[]>`
      SELECT 
        s.type AS "stage_type",
        j.priority AS "priority",
        t.status AS "task_status",
        COUNT(t.id) AS "count"
      FROM 
        "job_manager"."task" AS t
      INNER JOIN 
        "job_manager"."stage" AS s ON t."stage_id" = s.id
      INNER JOIN 
        "job_manager"."job" AS j ON s."job_id" = j.id
      GROUP BY 
        s.type, j.priority, t.status
      ORDER BY
        s.type, j.priority, t.status;
    `;

    // Convert BigInt count to number for compatibility
    return results.map((row) => ({
      ...row,
      count: Number(row.count),
    }));
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
const initializeTasksByStatusGauge = (logger: Logger, prisma: PrismaClient, serviceMetricsRegistry: Registry): void => {
  new Gauge({
    name: 'jobnik_tasks_by_status',
    help: 'Current number of tasks by status',
    labelNames: ['task_status', 'stage_type'],
    registers: [serviceMetricsRegistry],
    async collect(this: Gauge): Promise<void> {
      const startTime = Date.now();
      try {
        this.reset();

        const statusCounts = await getTaskCountsByStatus(prisma);

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
const initializeStagesByStatusGauge = (logger: Logger, prisma: PrismaClient, serviceMetricsRegistry: Registry): void => {
  new Gauge({
    name: 'jobnik_stages_by_status',
    help: 'Current number of stages by status',
    labelNames: ['stage_status', 'stage_type'],
    registers: [serviceMetricsRegistry],
    async collect(this: Gauge): Promise<void> {
      const startTime = Date.now();
      try {
        this.reset();

        const statusCounts = await getStageCountsByStatus(prisma);

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
const initializeJobsByStatusGauge = (logger: Logger, prisma: PrismaClient, serviceMetricsRegistry: Registry): void => {
  new Gauge({
    name: 'jobnik_jobs_by_status',
    help: 'Current number of jobs by status',
    labelNames: ['job_status'],
    registers: [serviceMetricsRegistry],
    async collect(this: Gauge): Promise<void> {
      const startTime = Date.now();
      try {
        this.reset();

        const statusCounts = await getJobCountsByStatus(prisma);

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
const initializeTasksByTypePriorityGauge = (logger: Logger, prisma: PrismaClient, serviceMetricsRegistry: Registry): void => {
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

        const queueDepths = await getTaskQueueDepthByStageType(prisma, logger);

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
const initializeServiceGauges = (logger: Logger, prisma: PrismaClient, serviceMetricsRegistry: Registry): void => {
  initializeTasksByStatusGauge(logger, prisma, serviceMetricsRegistry);
  initializeStagesByStatusGauge(logger, prisma, serviceMetricsRegistry);
  initializeJobsByStatusGauge(logger, prisma, serviceMetricsRegistry);
  initializeTasksByTypePriorityGauge(logger, prisma, serviceMetricsRegistry);
};

/**
 * Service-level metrics factory that should only be initialized once per service
 * These metrics query the database and should not be duplicated across pods
 */
const serviceMetricsFactory: FactoryFunction<void> = (dependencyContainer) => {
  const logger = dependencyContainer.resolve<Logger>(SERVICES.LOGGER);
  const prisma = dependencyContainer.resolve<PrismaClient>(SERVICES.PRISMA);
  const serviceMetricsRegistry = dependencyContainer.resolve<Registry>(SERVICES.SERVICE_METRICS);

  initializeServiceGauges(logger, prisma, serviceMetricsRegistry);
};

export const SERVICE_METRICS_SYMBOL = Symbol('serviceMetricsFactory');

export { serviceMetricsFactory };
