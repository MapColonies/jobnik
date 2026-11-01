import type { Pool } from 'pg';
import type { RelationsFilter } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { runMigrations as runMigrationsBase } from '@map-colonies/drizzle-utils';
import { JOB_MANAGER_SCHEMA, relations } from './entities';

export type Drizzle = ReturnType<typeof drizzle<typeof relations>>;

/**
 * The transaction handle passed to `Drizzle['transaction']` callbacks.
 * @public
 */
export type DrizzleTx = Parameters<Parameters<Drizzle['transaction']>[0]>[0];

/** A relational query filter on the job table; keys whose value is undefined are ignored. */
export type JobFilter = RelationsFilter<(typeof relations)['job'], typeof relations>;

/**
 * Rejects a configured `db.schema` other than the one the tables are defined in.
 * The table definitions are bound to {@link JOB_MANAGER_SCHEMA}, so any other value would be silently ignored.
 * @param schema - the configured database schema
 */
export function assertSupportedDbSchema(schema: string): void {
  if (schema !== JOB_MANAGER_SCHEMA) {
    throw new Error(
      `Unsupported db.schema '${schema}': the tables live in the '${JOB_MANAGER_SCHEMA}' schema, so db.schema must be '${JOB_MANAGER_SCHEMA}'`
    );
  }
}

export function createDrizzle(pool: Pool): Drizzle {
  return drizzle({ client: pool, relations });
}

export async function runMigrations(drizzle: NodePgDatabase): Promise<void> {
  // Resolves the migrations folder next to this module, in src/db during development and dist/db in the build.
  await runMigrationsBase(drizzle, JOB_MANAGER_SCHEMA, __dirname);
}
