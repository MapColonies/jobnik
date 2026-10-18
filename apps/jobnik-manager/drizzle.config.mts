import { defineConfig } from 'drizzle-kit';

// Only used to generate migrations from the table definitions; migrations are applied by src/db/runMigrations.ts.
export default defineConfig({
  schema: ['./src/db/entities/index.ts'],
  out: './src/db/migrations',
  dialect: 'postgresql',
  schemaFilter: ['job_manager'],
  verbose: true,
  strict: true,
});
