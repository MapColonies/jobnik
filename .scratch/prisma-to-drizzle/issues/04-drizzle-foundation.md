# 04 — Drizzle foundation

**What to build:** jobnik-manager gets a Drizzle database module laid out like opa-la's auth-core, not yet used by the app. It has:
- one table definition per table (job, stage, task) in the `job_manager` Postgres schema (ADR 0002), with snake_case columns;
- enums built from the owned constants (ticket 01);
- Branded ID and JSON typing via `$type<T>()`;
- `update_time` set on update via `$onUpdate`;
- a relations graph via `defineRelations`;
- a `createDrizzle(pool)` factory with `Drizzle` and `DrizzleTx` types;
- a drizzle-kit config, one fresh migration, and a standalone migration command (drizzle-utils runner) compiled into the build, with the migration SQL copied into the output.

Part of the Prisma → Drizzle stacked-PR chain (spec: `../spec.md`).

**Blocked by:** 01 — Own the enums and row types; 03 — Uppercase enum labels in the database.

**Status:** ready-for-agent

- [ ] `drizzle-orm` and `drizzle-kit` are pinned to the latest 1.0 prerelease (`1.0.0-rc.4` at the time of writing), with `@map-colonies/drizzle-utils` 1.0.0, all through the pnpm catalog.
- [ ] The migration command applies the fresh migration to an empty database.
- [ ] `pg_dump --schema-only` of a database migrated by Prisma and one migrated by the Drizzle command show no differences; the result is recorded in the PR description.
- [ ] Creating a new migration from the table definitions is a package script.
- [ ] The app still runs entirely on Prisma; all suites pass.

## Comments

**Schema equivalence check (2026-10-14), for the PR description:** created two empty databases on the integration Postgres (15); migrated `prisma_check` with `prisma migrate deploy` (both Prisma migrations) and `drizzle_check` with `node ./db/runMigrations.js` (run twice, idempotent). Compared with
`pg_dump -U postgres --schema-only --no-owner --schema=job_manager --exclude-table='job_manager._prisma_migrations' --exclude-table='job_manager.__drizzle_migrations*' <db>` (comments and blank lines stripped). The only difference was pg_dump's random `\restrict` / `\unrestrict` token; tables, columns, types, defaults, constraints, FKs and indexes were identical (109 lines each).

**Update (2026-10-15):** ids moved to a database default (`defaultRandom()` → `DEFAULT gen_random_uuid()`), recorded in ADR 0001 as the second deliberate difference. Re-ran the check: the only differences are now the three `id uuid DEFAULT gen_random_uuid() NOT NULL` lines (plus the random `\restrict` token).
