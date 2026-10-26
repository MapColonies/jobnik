import type { Pool } from 'pg';
import { getTableName, sql, type RelationsFilter } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { runMigrations as runMigrationsBase } from '@map-colonies/drizzle-utils';
import { JOB_MANAGER_SCHEMA, jobTable, relations, stageTable, taskTable } from './entities';

export type Drizzle = ReturnType<typeof drizzle<typeof relations>>;

/**
 * The transaction handle passed to `Drizzle['transaction']` callbacks.
 * @public
 */
export type DrizzleTx = Parameters<Parameters<Drizzle['transaction']>[0]>[0];

/** A relational query filter on the job table; keys whose value is undefined are ignored. */
export type JobFilter = RelationsFilter<(typeof relations)['job'], typeof relations>;

/** A relational query filter on the stage table; keys whose value is undefined are ignored. */
export type StageFilter = RelationsFilter<(typeof relations)['stage'], typeof relations>;

/** A relational query filter on the task table; keys whose value is undefined are ignored. */
export type TaskFilter = RelationsFilter<(typeof relations)['task'], typeof relations>;

export function createDrizzle(pool: Pool): Drizzle {
  return drizzle({ client: pool, relations });
}

export async function runMigrations(drizzle: NodePgDatabase): Promise<void> {
  // Resolves the migrations folder next to this module, in src/db during development and dist/db in the build.
  await runMigrationsBase(drizzle, JOB_MANAGER_SCHEMA, __dirname);
}

/**
 * Verifies that the job_manager schema and all of its tables exist, so a deployment without migrations fails fast.
 * The app never migrates on its own; migrations are applied by the standalone migration command.
 */
export async function verifyDbSetup(db: Drizzle): Promise<void> {
  try {
    const schemaResult = await db.execute<{ exists: boolean }>(
      sql`SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = ${JOB_MANAGER_SCHEMA}) AS "exists"`
    );
    if (schemaResult.rows[0]?.exists !== true) {
      throw new Error(`Schema: ${JOB_MANAGER_SCHEMA} doesn't exist`);
    }

    const tablesResult = await db.execute<{ tableName: string }>(
      sql`SELECT table_name AS "tableName" FROM information_schema.tables WHERE table_schema = ${JOB_MANAGER_SCHEMA}`
    );
    const existingTables = new Set(tablesResult.rows.map((row) => row.tableName));
    const missingTables = [jobTable, stageTable, taskTable].map((table) => getTableName(table)).filter((name) => !existingTables.has(name));
    if (missingTables.length > 0) {
      throw new Error(`Missing tables in schema ${JOB_MANAGER_SCHEMA}: ${missingTables.join(', ')}`);
    }
  } catch (error) {
    throw new Error(`Error on db connection: ${(error as Error).message}`, { cause: error });
  }
}
