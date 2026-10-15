# 03 — `jobnik-manager`: brand job ids end-to-end

**What to build:** Every `jobId: string` parameter in the job service layer (`jobs/models/manager.ts`) and the job DAL/repository is retyped to `JobId`, imported from `jobnik-openapi`. Prisma-facing call sites accept this unchanged, since a branded id is structurally still a `string`. `jobs/models/models.ts` and the job controller need no changes — they already alias `components['schemas'][...]`/`TypedRequestHandlers` and pick up the brand automatically once `jobnik-openapi` exports it.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Every `jobId` parameter in `jobs/models/manager.ts` and the job DAL/repository is typed `JobId` from `jobnik-openapi`, not `string`
- [ ] Passing a `StageId` or `TaskId` where a job id is expected in this layer fails to compile
- [ ] `jobnik-manager` type-checks, builds, and its existing unit/integration tests pass unmodified
