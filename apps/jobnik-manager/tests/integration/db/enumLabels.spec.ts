import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import type { DependencyContainer } from 'tsyringe';
import { jsLogger } from '@map-colonies/js-logger';
import { trace } from '@opentelemetry/api';
import { type PrismaClient } from '@prismaClient';
import { getApp } from '@src/app';
import { SERVICES } from '@common/constants';
import { initConfig } from '@src/common/config';
import { JobOperationStatus, Priority, StageOperationStatus, TaskOperationStatus } from '@src/db/persistenceModel';
import { endDatabasePool } from '../common/utils';

describe('database enum labels', () => {
  let prisma: PrismaClient;
  let container: DependencyContainer;

  beforeAll(async function () {
    await initConfig(true);
    [, container] = await getApp({
      override: [
        { token: SERVICES.LOGGER, provider: { useValue: jsLogger({ enabled: false }) } },
        { token: SERVICES.TRACER, provider: { useValue: trace.getTracer('testTracer') } },
      ],
      useChild: true,
    });

    prisma = container.resolve<PrismaClient>(SERVICES.PRISMA);
  });

  afterAll(async function () {
    await prisma.$disconnect();
    await endDatabasePool(container);
  });

  it.each([
    ['job_operation_status_enum', JobOperationStatus],
    ['stage_operation_status_enum', StageOperationStatus],
    ['task_operation_status_enum', TaskOperationStatus],
    ['priority_enum', Priority],
  ])('should store %s labels as the uppercase names the code uses', async (enumName, codeEnum) => {
    const labels = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel::text AS enumlabel
      FROM pg_enum e
      INNER JOIN pg_type t ON e.enumtypid = t.oid
      INNER JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'job_manager' AND t.typname = ${enumName}
    `;

    expect(labels.map((label) => label.enumlabel).sort()).toEqual(Object.values(codeEnum).sort());
  });
});
