import { inject, Lifecycle, scoped } from 'tsyringe';
import { type Logger } from '@map-colonies/js-logger';
import { PrismaClient } from '@prismaClient';
import { SERVICES } from '@src/common/constants';
import type { PrismaTransaction } from '@src/db/types';
import { findAndLockTask } from '@src/db/prisma/generated/client/sql';
import type { TaskPrismaObject } from '../models/models';
import { convertRawToTaskModel } from '../models/helper';

@scoped(Lifecycle.ContainerScoped)
export class TaskRepository {
  public constructor(
    @inject(SERVICES.LOGGER) private readonly logger: Logger,
    @inject(SERVICES.PRISMA) private readonly prisma: PrismaClient
  ) {}

  /**
   * Finds and locks the next available high-priority task for processing.
   * * Uses a row-level lock with `SKIP LOCKED` to allow multiple concurrent
   * workers to claim different tasks without blocking each other.
   * * @param stageType - The stage category to pull tasks from.
   * @param tx - The current database transaction.
   * @returns The locked task or null if no eligible tasks are found.
   */
  public async findAndLockTaskForDequeue(stageType: string, tx: PrismaTransaction): Promise<TaskPrismaObject | null> {
    const tasks = await tx.$queryRawTyped(findAndLockTask(stageType));

    if (tasks.length === 0 || tasks[0] === undefined) {
      return null;
    }

    const task = convertRawToTaskModel(tasks[0]);
    return task;
  }
}
