# 10 — Remove Prisma

**What to build:** nothing Prisma-related remains in the repo. The row types in the internal module from 01 switch from Prisma aliases to Drizzle's `$inferSelect`/`$inferInsert`. Part of the Prisma → Drizzle stacked-PR chain (spec: `../spec.md`).

Removed:
- the Prisma dependencies;
- the Prisma schema, migration history and generated client;
- the typed-SQL folder and its generator;
- the Prisma package scripts;
- `PrismaInstrumentation`;
- the Prisma steps in the build and Docker image (global CLI install, `prisma format --check`, schema copy);
- the Prisma entries in `onlyBuiltDependencies`;
- the `DB_SCHEMA` config key and its environment mapping (ADR 0002).

The e2e README and other docs stop referring to Prisma.

**Blocked by:** 09 — Integrate and verify.

**Status:** ready-for-agent

- [ ] No file in the repo (excluding lockfile churn and ADRs/spec) references Prisma.
- [ ] Row types are inferred from the Drizzle table definitions and carry the Branded IDs without casts.
- [ ] The Docker image builds without installing the Prisma CLI.
- [ ] `DB_SCHEMA` is gone from config and the e2e compose file.
- [ ] Type-check, lint, unit, integration and e2e suites all pass.
