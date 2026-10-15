# 03 — Uppercase enum labels in the database

**What to build:** the database enum labels for Job/Stage/Task status and Priority become the uppercase names the API and code already use (`IN_PROGRESS`, `VERY_HIGH`, ...) instead of `In-Progress` style. A Prisma migration renames the labels, and the Prisma schema drops its enum `@map`s. The typed-SQL dequeue query's status literals are updated to match. Still on Prisma, and API behavior is unchanged. Afterwards Prisma's schema matches what the Drizzle migration will create exactly (ADR 0001). Part of the Prisma → Drizzle stacked-PR chain (spec: `../spec.md`).

**Blocked by:** 02 — Move database-touching unit tests to integration tests.

**Status:** ready-for-agent

- [ ] A Prisma migration renames every enum label to its uppercase name; defaults that reference enum labels are updated.
- [ ] The Prisma schema has no enum-value `@map`s.
- [ ] No raw SQL or test fixture uses the old `In-Progress`-style labels.
- [ ] API wire values are unchanged.
- [ ] All suites pass, including e2e.
