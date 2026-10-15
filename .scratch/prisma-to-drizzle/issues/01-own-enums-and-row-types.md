# 01 — Own the enums and row types

**What to build:** jobnik-manager stops importing the status/priority enums and the Job/Stage/Task row types from the Prisma-generated client. A single internal module owns `JobOperationStatus`, `StageOperationStatus`, `TaskOperationStatus` and `Priority` as constant objects, each with a matching union type. It also exports the row types of the Persistence model, which re-export Prisma's for now. Every call site — managers, state machines, errors, metrics, tests — imports from that module, so the Drizzle cutover only has to change the module. Runtime behavior is unchanged. Part of the Prisma → Drizzle stacked-PR chain (spec: `../spec.md`).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The enum constants have the same keys and values Prisma's client exposes (uppercase names, e.g. `IN_PROGRESS: 'IN_PROGRESS'`), each with a union type.
- [ ] Job, Stage and Task row types are exported from the same internal module; for now they are aliases of the Prisma model types.
- [ ] No source or test file outside the internal module and the database layer imports enums or model types from the Prisma client.
- [ ] Status-count metrics still iterate over every enum value.
- [ ] Unit and integration suites pass unchanged in behavior; e2e passes.
