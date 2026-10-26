import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { initConnection } from '@map-colonies/drizzle-utils';
import { createDrizzle, type Drizzle } from '@src/db/drizzle';
import { getConfig, initConfig } from '@src/common/config';

const TRANSACTION_TIMEOUT_MS = 200;

describe('transaction timeout', () => {
  let pool: Pool;
  let drizzle: Drizzle;

  beforeAll(async function () {
    await initConfig(true);
    pool = await initConnection(getConfig().get('db'));
    drizzle = createDrizzle(pool, { transactionTimeoutMs: TRANSACTION_TIMEOUT_MS });
  });

  afterAll(async function () {
    await pool.end();
  });

  it('should abort a transaction whose statement runs longer than the timeout', async function () {
    const promise = drizzle.transaction(async (tx) => {
      await tx.execute(sql`select pg_sleep(1)`);
    });

    await expect(promise).rejects.toMatchObject({ cause: { message: expect.stringContaining('statement timeout') as unknown } });
  });

  it('should commit a transaction that finishes within the timeout', async function () {
    const result = await drizzle.transaction(async (tx) => {
      const { rows } = await tx.execute<{ timeout: string }>(sql`select current_setting('statement_timeout') as "timeout"`);
      return rows[0]?.timeout;
    });

    expect(result).toBe(`${TRANSACTION_TIMEOUT_MS}ms`);
  });

  it('should not leak the timeout to queries outside the transaction', async function () {
    await drizzle.transaction(async (tx) => {
      await tx.execute(sql`select 1`);
    });

    const { rows } = await drizzle.execute<{ timeout: string }>(sql`select current_setting('statement_timeout') as "timeout"`);

    expect(rows[0]?.timeout).not.toBe(`${TRANSACTION_TIMEOUT_MS}ms`);
  });
});
