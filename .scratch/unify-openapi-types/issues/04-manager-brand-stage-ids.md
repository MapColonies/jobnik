# 04 — `jobnik-manager`: brand stage ids end-to-end

**What to build:** Every `stageId: string` parameter in the stage service layer (`stages/models/manager.ts`) and the stage DAL/repository (e.g. `stageRepository.updateStageSummary`) is retyped to `StageId`, imported from `jobnik-openapi`. `getStageById` rejects a `JobId` at compile time. `stages/models/models.ts` and the stage controller need no changes — they already alias `components['schemas'][...]`/`TypedRequestHandlers` and pick up the brand automatically once `jobnik-openapi` exports it.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Every `stageId` parameter in `stages/models/manager.ts` and `stageRepository` is typed `StageId` from `jobnik-openapi`, not `string`
- [ ] `getStageById` and `stageRepository.updateStageSummary` reject a `JobId` at compile time
- [ ] `jobnik-manager` type-checks, builds, and its existing unit/integration tests pass unmodified
