import type { Pool } from 'pg';
import { getTableName, sql, type RelationsFilter } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { runMigrations as runMigrationsBase } from '@map-colonies/drizzle-utils';
import { TX_TIMEOUT_MS } from '@common/constants';
import { JOB_MANAGER_SCHEMA, jobTable, relations, stageTable, taskTable } from './entities';

export type Drizzle = ReturnType<typeof drizzle<typeof relations>>;

/**
 * The transaction handle passed to `Drizzle['transaction']` callbacks.
 * @public
 */
export type DrizzleTx = Parameters<Parameters<Drizzle['transaction']>[0]>[0];

/**
 * A relational query filter on one table; keys whose value is undefined are ignored.
 * @template TTable - the table's name in the relations config
 */
export type TableFilter<TTable extends keyof typeof relations> = RelationsFilter<(typeof relations)[TTable], typeof relations>;

/**
 * Thrown when a transaction fails before its callback runs, for example when no connection can be checked out of the pool.
 * The driver reports such failures as plain errors rather than query errors.
 */
export class DatabaseConnectionError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DatabaseConnectionError';
  }
}

export interface CreateDrizzleOptions {
  /**
   * Upper bound, in milliseconds, for every statement and idle period inside a transaction.
   * Zero disables the bound.
   */
  transactionTimeoutMs?: number;
}

export function createDrizzle(pool: Pool, options: CreateDrizzleOptions = {}): Drizzle {
  const db = drizzle({ client: pool, relations });
  const transactionTimeoutMs = options.transactionTimeoutMs ?? TX_TIMEOUT_MS;
  const originalTransaction = db.transaction.bind(db);

  const transaction: Drizzle['transaction'] = async (callback, config) => {
    // Held in an object because the flag is set inside the callback, which control-flow narrowing can't see.
    const state = { callbackStarted: false };
    try {
      return await originalTransaction(async (tx) => {
        state.callbackStarted = true;
        if (transactionTimeoutMs > 0) {
          const timeout = String(transactionTimeoutMs);
          await tx.execute(
            sql`select set_config('statement_timeout', ${timeout}, true), set_config('idle_in_transaction_session_timeout', ${timeout}, true)`
          );
        }
        return callback(tx);
      }, config);
    } catch (error) {
      if (state.callbackStarted) {
        throw error;
      }
      throw new DatabaseConnectionError(`Failed to start a database transaction: ${(error as Error).message}`, { cause: error });
    }
  };
  db.transaction = transaction;

  return db;
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
