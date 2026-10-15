# 05 — Migrations run through Drizzle

**What to build:** every environment creates its schema with the Drizzle migration command instead of `prisma migrate deploy`: integration global setup and teardown, the e2e `migrator` service, and the Docker image (which ships the command). Prisma still serves requests against the schema Drizzle created, which is identical after ticket 04. Part of the Prisma → Drizzle stacked-PR chain (spec: `../spec.md`).

**Blocked by:** 04 — Drizzle foundation.

**Status:** ready-for-agent

- [ ] Integration global setup migrates with the Drizzle migration command; teardown drops `job_manager` without a Prisma client.
- [ ] The e2e `migrator` service runs the Drizzle migration command from the built image.
- [ ] No environment runs `prisma migrate` any more.
- [ ] Integration and e2e suites pass.
