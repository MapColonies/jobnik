# 01 — Unify branded-id generation in `jobnik-openapi`

**What to build:** `jobnik-openapi` becomes the single place OpenAPI-derived types are generated, brands included. Move the `Brand<T, S>` utility and `JobId`/`StageId`/`TaskId` aliases from `jobnik-sdk`'s `src/types/brands.ts` into a new `src/brands.ts` in `jobnik-openapi`, exported from its index alongside `paths`/`components`/`operations`/`TypedRequestHandlers`. Add the same `inject`/`transform` options `jobnik-sdk`'s script currently uses to `jobnik-openapi`'s `scripts/generateTypes.mts` — inject `import type { JobId, StageId, TaskId } from './brands'`, and transform the schema objects at `#/components/schemas/jobId|stageId|taskId` to reference the branded type — so the generated `src/openapi.d.ts` brands those fields everywhere they appear (schemas, path params, `TypedRequestHandlers`). Add a `generate:check`-style drift guard for this regenerated output, matching the discipline `jobnik-sdk` already applies to its own generated files.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `jobnik-openapi` exports `Brand`, `JobId`, `StageId`, `TaskId` from a new `src/brands.ts`, re-exported from its index
- [ ] `scripts/generateTypes.mts` injects the brand import and transforms `jobId`/`stageId`/`taskId` schema refs to the branded types
- [ ] Regenerated `src/openapi.d.ts` shows the brands applied consistently across `paths`, `components`, `operations`, and `TypedRequestHandlers`
- [ ] A checked-artifact guard (regenerate + `git diff --exit-code`) exists for `src/openapi.d.ts`
- [ ] `jobnik-openapi` type-checks and builds cleanly
