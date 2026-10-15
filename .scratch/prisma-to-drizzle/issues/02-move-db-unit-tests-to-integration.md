# 02 — Move database-touching unit tests to integration tests

**What to build:** the unit tests that deep-mock the Prisma client (the Job/Stage/Task manager specs and the Stage/Task repository specs) are removed. Anything they covered that the integration suite doesn't is covered by integration tests against real Postgres, through the HTTP API where possible. Unit tests keep only logic that doesn't touch the database (state machines, pure helpers). This builds the safety net before any query moves, and it stays on Prisma. Part of the Prisma → Drizzle stacked-PR chain (spec: `../spec.md`).

**Blocked by:** 01 — Own the enums and row types (it rewrites imports in the same test files).

**Status:** ready-for-agent

- [ ] No unit test mocks the database client.
- [ ] Every behavior asserted by a removed unit test has an integration test, or is shown to be already covered (listed in the PR description).
- [ ] An integration test shows that concurrent dequeue calls for the same stage type never return the same Task.
- [ ] An integration test shows that dequeue returns the highest-priority eligible Task and skips Tasks whose Stage or Job isn't in an eligible status.
- [ ] State-machine and helper unit tests are kept.
- [ ] All suites pass.
