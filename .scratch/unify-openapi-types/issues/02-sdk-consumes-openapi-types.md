# 02 — `jobnik-sdk` consumes `jobnik-openapi` types directly

**What to build:** `jobnik-sdk` stops regenerating OpenAPI-derived types and imports them straight from `jobnik-openapi`. Remove the `generateTypes` call and its `inject`/`transform` options from `scripts/openapi.mts`, delete the resulting duplicate `src/types/openapi.ts`, and delete `src/types/brands.ts`. Update every internal reference that previously imported from `src/types/openapi.ts` to instead import `paths`/`components`/`operations`/`JobId`/`StageId`/`TaskId` from `jobnik-openapi`. Keep the `generateErrors` call (`src/generated/openapi-errors.ts`) and the rest of the build/prebuild pipeline (`copySpec`, etc.) unchanged — this is a types-only removal, not a build pipeline change.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `scripts/openapi.mts` no longer calls `generateTypes`/`inject`/`transform`; `src/types/openapi.ts` and `src/types/brands.ts` are deleted
- [ ] All prior consumers of `src/types/openapi.ts` now import from `jobnik-openapi` instead
- [ ] `generate:check` still validates `src/generated/openapi-errors.ts` unchanged
- [ ] `jobnik-sdk` type-checks, builds, and its existing vitest suite passes unmodified
