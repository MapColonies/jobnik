# 06 — Cut over Jobs

**What to build:** the first PR of the query cutover. The Drizzle client is registered once in tsyringe (`SERVICES.DRIZZLE`, a cached factory over a drizzle-utils pool, with the pool closed on shutdown). Database errors are recognised with drizzle-utils' query-error guard and Postgres error codes, and map to the same domain errors as before. The Job manager's queries are translated to Drizzle and the query placement rule is applied: single-table lookups and by-id writes stay in the manager, while joins, locks, aggregates, raw `sql`, multi-step transactions and conditionally built filters move to a new `JobRepository`, including the job search with optional filters. Transaction parameters become `DrizzleTx`. Part of the Prisma → Drizzle stacked-PR chain (spec: `../spec.md`).

**This PR does not pass on its own:** it builds and tests green only together with 07 and 08, and 09 is where the whole stack must pass. Say so in the PR description. Tickets 06–09 merge together.

**Blocked by:** 05 — Migrations run through Drizzle.

**Status:** ready-for-agent

- [ ] The Drizzle client is registered once in the DI container and resolved by consumers via injection.
- [ ] No Job-related code issues Prisma queries.
- [ ] `JobRepository` exists and holds exactly the Job queries that meet the repository criteria.
- [ ] Prisma error tagging is not used by Job code; domain errors are mapped from Postgres error codes.
- [ ] Job integration tests pass once 07 and 08 are in place (checked in 09).
