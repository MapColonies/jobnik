# Unify OpenAPI types and brand IDs consistently

Status: ready-for-agent

## Problem Statement

The types describing the API are generated twice. `jobnik-openapi` generates `paths`/`components`/`operations`/`TypedRequestHandlers` from the OpenAPI spec, and `jobnik-sdk` independently reruns the same codegen against the same spec file, producing a near-duplicate types file that differs only in that it brands `jobId`/`stageId`/`taskId` as `JobId`/`StageId`/`TaskId`. Meanwhile `jobnik-manager` — which consumes `jobnik-openapi`'s types directly — has no branding at all, so nothing stops a `jobId` from being passed where a `stageId` or `taskId` is expected anywhere in its service or DB-access code.

## Solution

Make `jobnik-openapi` the single place OpenAPI-derived types are generated, brands included. `jobnik-sdk` stops regenerating those types and imports them straight from `jobnik-openapi`. `jobnik-manager` retypes every job/stage/task id parameter, from its controllers down through its service layer and DAL, to the branded ids — so the compiler catches an id of the wrong kind wherever it's passed, not just at the HTTP boundary.

## User Stories

1. As a developer working in `jobnik-manager`, I want `getStageById` to reject a `JobId` at compile time, so that I can't accidentally pass the wrong kind of id when fetching a stage.
2. As a developer working in `jobnik-manager`, I want `getTaskById` to reject a `JobId` or `StageId` at compile time, so that task lookups can't be called with the wrong id kind.
3. As a developer working in `jobnik-manager`, I want the DAL/repository layer (e.g. `stageRepository.updateStageSummary`) to require branded ids, so that the protection isn't lost once a request drops below the service layer.
4. As a developer maintaining `jobnik-openapi`, I want it to be the single place that generates OpenAPI-derived types, so that there's one generation step to update when the spec changes.
5. As a developer maintaining `jobnik-sdk`, I want to consume `jobnik-openapi`'s generated types directly, so that I don't maintain a second, independently-generated copy that only differs by branding.
6. As a developer maintaining `jobnik-sdk`, I want its `JobId`/`StageId`/`TaskId` brands to come from `jobnik-openapi`, so that there's one definition of what a branded id is, not two.
7. As a developer reviewing a PR, I want `req.params.jobId` in a controller to already be typed `JobId` (not `string`) from the moment `TypedRequestHandlers` hands it over, so that no manual casting is needed at the boundary.
8. As a developer working in `jobnik-manager`, I want `JobModel`/`StageModel`/`TaskModel` (and their `Create` variants) to automatically pick up branded ids once `jobnik-openapi` changes, so that I don't have to hand-maintain per-model overrides.
9. As a developer running `generate:check` in `jobnik-sdk`, I want it to still validate the generated error mapping (`src/generated/openapi-errors.ts`) unchanged, so that removing the duplicate type codegen doesn't remove unrelated generation coverage.
10. As a developer working on `jobnik-manager`'s Prisma schema, I want its status/priority enums to stay independently maintained, so that the persistence model isn't forced to mirror the API model.
11. As a developer running `jobnik-e2e`, I want its test suite to keep working unmodified, so that a types-only refactor in other packages doesn't ripple into e2e.
12. As a future maintainer reading the code, I want `CONTEXT.md`'s `Branded ID`/`API model`/`Persistence model` definitions to explain why ids are branded and why Prisma isn't unified with OpenAPI, so the design isn't "fixed" by someone who doesn't know it was deliberate.
13. As a developer building `jobnik-sdk`, I want its build/prebuild scripts (`copySpec`, `generateErrors`) to keep working unchanged, so that only the duplicate type-generation path is removed, not the rest of its build pipeline.
14. As a developer working in `jobnik-manager`, I want every `jobId`/`stageId`/`taskId: string` parameter across `manager.ts` and the DAL retyped to the branded id, so no silent gap remains where a plain string could still be passed.
15. As a developer consuming `jobnik-openapi`'s exported types, I want `paths`, `components`, `operations`, and `TypedRequestHandlers` to all consistently use the branded ids, so there's no inconsistency between different export shapes of the same spec.

## Implementation Decisions

- **`jobnik-openapi`**: move the `Brand<T, S>` utility and `JobId`/`StageId`/`TaskId` aliases from `jobnik-sdk`'s `src/types/brands.ts` into a new module in `jobnik-openapi` (e.g. `src/brands.ts`), and export them from its index alongside `paths`/`components`/`operations`/`TypedRequestHandlers`.
- **`jobnik-openapi`'s `scripts/generateTypes.mts`**: add the same `inject`/`transform` options `jobnik-sdk`'s script currently uses — inject `import type { JobId, StageId, TaskId } from './brands'`; transform the schema objects at `#/components/schemas/jobId|stageId|taskId` to reference the branded type — so the generated `src/openapi.d.ts` brands those fields everywhere they appear (schemas, path params, `TypedRequestHandlers`).
- **`jobnik-sdk`**: remove the `generateTypes` call, its `inject`/`transform` options, and the resulting duplicate `src/types/openapi.ts` from `scripts/openapi.mts`; delete `src/types/brands.ts`. Import `paths`/`components`/`operations`/`JobId`/`StageId`/`TaskId` directly from `jobnik-openapi` wherever `src/types/openapi.ts` was previously referenced. Keep the `generateErrors` call (`src/generated/openapi-errors.ts`) untouched — unrelated concern.
- **`jobnik-manager`**: no changes needed to `jobs/models/models.ts`, `stages/models/models.ts`, `tasks/models/models.ts`, or the three `TypedRequestHandlers`-typed controllers — they alias `components['schemas'][...]`/`TypedRequestHandlers` directly, so they pick up branding automatically once `jobnik-openapi`'s codegen changes.
- **`jobnik-manager`**: retype every `jobId: string`/`stageId: string`/`taskId: string` parameter through the service layer (`jobs/models/manager.ts`, `stages/models/manager.ts`, `tasks/models/manager.ts`) and the DAL/repository layer (e.g. `stages/DAL/stageRepository.ts`) to `JobId`/`StageId`/`TaskId` respectively, imported from `jobnik-openapi`. Prisma-facing call sites accept these unchanged, since a branded id is structurally still a `string`.
- **`jobnik-manager`'s Prisma schema** (`JobOperationStatus`, `StageOperationStatus`, `Priority`, `TaskOperationStatus`) stays as-is — not derived from or unified with the OpenAPI schema's equivalent string-literal unions. Persistence model and API model are treated as intentionally distinct (see `CONTEXT.md`).
- No change to `jobnik-e2e` — it only imports from `@map-colonies/jobnik-sdk`, never `jobnik-openapi` directly.
- `CONTEXT.md` (repo root) already updated with `Branded ID`, `API model`, and `Persistence model` glossary entries as part of this work.
- No ADR — this is one step within an ongoing larger migration.

## Testing Decisions

- No new runtime tests: branded ids are erased to plain `string` at runtime, so this change has no new observable behavior to assert against.
- Primary verification seam: TypeScript compilation at each package boundary — `jobnik-openapi`'s generated export surface, checked via `jobnik-sdk`'s and `jobnik-manager`'s existing `type-check`/`build` scripts. A wrong or missing brand should surface as a compile error at the boundary where a mismatched id is passed.
- Regression coverage: existing test suites (`jobnik-manager` unit/integration tests, `jobnik-sdk` vitest suite, `jobnik-e2e`) must continue to pass unmodified — they're the evidence that behavior didn't change.
- Prior art: `jobnik-sdk`'s `generate:check` script already treats generated output as a checked artifact (`generate:openapi && git diff --exit-code -- ...`); apply the same discipline to `jobnik-openapi`'s own generated `src/openapi.d.ts` after the `inject`/`transform` is added, to catch drift.

## Out of Scope

- Removing Prisma or replacing it with anything else.
- Unifying Prisma's enums with OpenAPI's schema enums.
- Any change to `jobnik-e2e`.
- Any change to the physical OpenAPI spec (`openapi3.yaml`/`openapi_v1.yaml`) or its content.
- Runtime/DB validation that a branded id actually exists — that remains the job of the OpenAPI request validator middleware and the DB lookup itself, not the brand.
- Writing an ADR for this change.

## Further Notes

This spec is one step of a larger migration the user referenced when declining an ADR — other steps/ADRs may exist elsewhere; this spec covers only the OpenAPI-package-unification-and-branding piece. Decisions here were reached through a grilling session; see conversation history if further rationale is needed.
