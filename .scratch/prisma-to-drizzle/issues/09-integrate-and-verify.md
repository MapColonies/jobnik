# 09 — Integrate and verify

**What to build:** the top of the cutover stack, where the whole stack must pass. The remaining runtime database touchpoints move to Drizzle / drizzle-utils:
- the startup check that the `job_manager` schema and all three tables exist;
- the liveness/readiness database health check;
- status-count metrics;
- anything else that still reaches the Prisma client at runtime.

With 06–08 this is a complete, passing cutover: the service runs entirely on Drizzle, and Prisma is installed but unused. Part of the Prisma → Drizzle stacked-PR chain (spec: `../spec.md`).

**Blocked by:** 06 — Cut over Jobs; 07 — Cut over Stages; 08 — Cut over Tasks.

**Status:** ready-for-agent

- [ ] Nothing in the running service resolves, constructs or imports the Prisma client; `SERVICES.PRISMA` is gone.
- [ ] Startup fails fast with a clear error when the schema or a table is missing.
- [ ] Health checks report database connectivity through drizzle-utils.
- [ ] Metrics still report every status.
- [ ] Type-check, lint, unit, integration and e2e suites all pass.
- [ ] Database query spans still show up in traces (pg auto-instrumentation).
