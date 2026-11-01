import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import type { DependencyContainer } from 'tsyringe';
import { sql } from 'drizzle-orm';
import type { Drizzle } from '@src/db/drizzle';
import { initConfig } from '@src/common/config';
import { JobOperationStatus, Priority, StageOperationStatus, TaskOperationStatus } from '@src/db/persistenceModel';
import { setupIntegrationApp, teardownIntegrationApp } from '../common/utils';

describe('database enum labels', () => {
  let drizzle: Drizzle;
  let container: DependencyContainer;

  beforeAll(async function () {
    await initConfig(true);
    ({ container, drizzle } = await setupIntegrationApp());
  });

  afterAll(async function () {
    await teardownIntegrationApp(container);
  });

  it.each([
    ['job_operation_status_enum', JobOperationStatus],
    ['stage_operation_status_enum', StageOperationStatus],
    ['task_operation_status_enum', TaskOperationStatus],
    ['priority_enum', Priority],
  ])('should store %s labels as the uppercase names the code uses', async (enumName, codeEnum) => {
    const { rows: labels } = await drizzle.execute<{ enumlabel: string }>(sql`
      SELECT e.enumlabel::text AS enumlabel
      FROM pg_enum e
      INNER JOIN pg_type t ON e.enumtypid = t.oid
      INNER JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE n.nspname = 'job_manager' AND t.typname = ${enumName}
    `);

    expect(labels.map((label) => label.enumlabel).sort()).toEqual(Object.values(codeEnum).sort());
  });
});
