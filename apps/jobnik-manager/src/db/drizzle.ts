import type { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { runMigrations as runMigrationsBase } from '@map-colonies/drizzle-utils';
import { JOB_MANAGER_SCHEMA, relations } from './entities';

export type Drizzle = ReturnType<typeof drizzle<typeof relations>>;

/**
 * The transaction handle passed to `Drizzle['transaction']` callbacks.
 * @public
 */
export type DrizzleTx = Parameters<Parameters<Drizzle['transaction']>[0]>[0];

export function createDrizzle(pool: Pool): Drizzle {
  return drizzle({ client: pool, relations });
}

export async function runMigrations(drizzle: NodePgDatabase): Promise<void> {
  // Resolves the migrations folder next to this module, in src/db during development and dist/db in the build.
  await runMigrationsBase(drizzle, JOB_MANAGER_SCHEMA, __dirname);
}
