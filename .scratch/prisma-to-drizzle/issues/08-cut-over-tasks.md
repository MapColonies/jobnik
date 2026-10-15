# 08 — Cut over Tasks

**What to build:** the Task manager and `TaskRepository` are translated to Drizzle under the query placement rule. Task dequeue becomes a query-builder query in `TaskRepository`: inner joins Task → Stage → Job, filtered by stage type and the eligible Task/Stage/Job statuses, ordered by Job priority, limit 1, locked `FOR UPDATE OF task SKIP LOCKED`. Workers still get the highest-priority eligible Task, and two workers never get the same one. Part of the Prisma → Drizzle stacked-PR chain (spec: `../spec.md`).

**This PR does not pass on its own:** it completes the query cutover begun in 06, and is verified in 09. Say so in the PR description.

**Blocked by:** 07 — Cut over Stages.

**Status:** ready-for-agent

- [ ] No Task-related code issues Prisma queries, raw typed SQL or uses the Prisma transaction type.
- [ ] Dequeue is written in the query builder with a row lock that skips locked rows.
- [ ] Queries are placed according to the query placement rule.
- [ ] The concurrent-dequeue and priority integration tests from 02 pass (checked in 09).
