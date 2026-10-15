# 07 — Cut over Stages

**What to build:** the Stage manager and `StageRepository` are translated to Drizzle under the query placement rule. That includes the Stage summary update and every transaction that combines Stage writes with Job or Task writes, all using `DrizzleTx`. Stage behavior through the API is unchanged. Part of the Prisma → Drizzle stacked-PR chain (spec: `../spec.md`).

**This PR does not pass on its own:** it becomes green together with 06 and 08, and is verified in 09. Say so in the PR description.

**Blocked by:** 06 — Cut over Jobs.

**Status:** ready-for-agent

- [ ] No Stage-related code issues Prisma queries or uses the Prisma transaction type.
- [ ] The Stage summary update is expressed in Drizzle and still runs in the same transaction as the write that triggers it.
- [ ] Queries are placed according to the query placement rule.
- [ ] Stage integration tests pass once 08 is in place (checked in 09).
