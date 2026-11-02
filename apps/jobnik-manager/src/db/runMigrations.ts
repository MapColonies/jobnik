// Standalone migration command, run at deploy time before the app starts. The app itself never migrates.
import { initConnection } from '@map-colonies/drizzle-utils';
import { jsLogger } from '@map-colonies/js-logger';
import { getConfig, initConfig } from '@common/config';
import { createDrizzle, runMigrations } from './drizzle';

async function main(): Promise<void> {
  await initConfig();
  const config = getConfig();
  const logger = jsLogger(config.get('telemetry.logger'));

  const pool = await initConnection(config.get('db'));
  try {
    // Migrations may legitimately run longer than a request transaction, so they are not bounded by the transaction timeout.
    await runMigrations(createDrizzle(pool, { transactionTimeoutMs: 0 }));
    logger.info({ msg: 'migrations completed' });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  /* eslint-disable no-console */
  console.error('failed to run migrations');
  console.error(error);
  /* eslint-enable no-console */
  process.exit(1);
});
