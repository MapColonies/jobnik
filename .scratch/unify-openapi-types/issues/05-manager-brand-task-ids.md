# 05 — `jobnik-manager`: brand task ids end-to-end

**What to build:** Every `taskId: string` parameter in the task service layer (`tasks/models/manager.ts`) and the task DAL/repository is retyped to `TaskId`, imported from `jobnik-openapi`. `getTaskById` rejects a `JobId` or `StageId` at compile time. `tasks/models/models.ts` and the task controller need no changes — they already alias `components['schemas'][...]`/`TypedRequestHandlers` and pick up the brand automatically once `jobnik-openapi` exports it.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Every `taskId` parameter in `tasks/models/manager.ts` and the task DAL/repository is typed `TaskId` from `jobnik-openapi`, not `string`
- [ ] `getTaskById` rejects a `JobId` or `StageId` at compile time
- [ ] `jobnik-manager` type-checks, builds, and its existing unit/integration tests pass unmodified
