# 06 — Catalog gap sweep: prettier + typescript

Branch: `deps-catalog/06-catalog-gaps` (base `deps-catalog/05-sdk`)
PR: #44 — https://github.com/MapColonies/jobnik/pull/44

## Preconditions confirmed

- `git branch --show-current` → `deps-catalog/05-sdk` before starting (confirmed per task instructions).
- `gh stack view --json` before starting showed 5 branches/PRs (#37, #38, #40, #41, #42), all OPEN,
  `needsRebase: false` throughout.
- Read in full: `spec.md`, `issues/07-catalog-gap-sweep.md`, all 5 prior logs
  (`01-scaffold.md` … `05-sdk.md`), and `issues/06-vitest-v5-follow-up.md` (pattern reference for the
  follow-up ticket this ticket also files).

## npm latest re-check (done live, not from the ticket's stale numbers)

```
npm view prettier version   → 3.9.6
npm view typescript version → 7.0.2
```
Both matched the ticket's pre-written guesses exactly (ticket said "confirm at implementation time — these
move"; they hadn't moved).

## prettier → `^3.9.6`

Zero-risk, as predicted: npm latest and already the highest version in use in-repo (root's own `^3.9.6`).
Added to `catalog:`, all four workspaces switched from literal ranges (`jobnik-manager`/`jobnik-openapi`/`e2e`
were `^3.9.5`, `jobnik-sdk` was `^3.5.3`) to `"prettier": "catalog:"`.

Verified `format` (= `prettier --check .`) passes for all four workspaces post-bump, including `jobnik-sdk`
(previously furthest behind). No reformatting was triggered — `prettier --write .` was not needed.

## typescript — attempted `^7.0.2` for real, fell back to `^5.9.3`

Did **not** pre-judge this as too risky. Set the catalog entry to `^7.0.2`, pointed all four workspaces at
`catalog:`, ran `pnpm install`, then ran the real verification commands.

### What actually happened

`pnpm install` itself succeeded, but immediately printed unmet-peer warnings across all four workspaces:
`@typescript-eslint/*` (parser, eslint-plugin, utils, typescript-estree, project-service, tsconfig-utils),
`typescript-eslint` (via `@map-colonies/eslint-config`), `openapi-typescript`, `prisma-json-types-generator`,
and `vitest-mock-extended` all declare a `typescript` peer range that caps below `7.0.2` (mostly
`>=4.8.4 <6.1.0`).

Ran `pnpm turbo run type-check --filter=<all four>` → **hard build failure** in `jobnik-openapi`:
```
tsconfig.build.json(3,3): error TS5011: The common source directory of 'tsconfig.build.json' is './src'.
The 'rootDir' setting must be explicitly set to this or another path to adjust your output's file layout.
```
A genuine new compiler-enforced constraint in TS7, not present in 5.x — `jobnik-openapi`'s
`tsconfig.build.json` extends `tsconfig.json` and only sets `sourceMap`/`noEmit`/`include`/`exclude`, no
explicit `rootDir`.

Ran `eslint .` directly in `jobnik-openapi` to see whether the peer-warning was just noise → **hard runtime
crash**, not a lint violation:
```
typescript-eslint does not support TS 7.0.
Please see https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0
See also https://github.com/typescript-eslint/typescript-eslint/issues/10940
Error: typescript-eslint does not support TS 7.0.
```
This is an explicit unsupported-version guard baked into `typescript-eslint@8.67.0` itself (the version pulled
in by `@map-colonies/eslint-config@9.0.0` / `@vitest/eslint-plugin`) — not something `eslint --fix` or any
mechanical change on our side can clear. Fixing it for real would mean waiting on/upgrading to a
`typescript-eslint` major with TS7 support, which doesn't exist yet (tracked upstream at
https://github.com/typescript-eslint/typescript-eslint/issues/10940).

### Decision: fallback

Per the ticket's own policy ("if it surfaces real type errors or eslint/`@typescript-eslint` parser breakage
beyond a trivial one-line fix, cap the catalog entry at `^5.9.3`"), this is not a trivial fix — it's (a) an
upstream tool that hasn't shipped TS7 support at all, and (b) a real compiler behavior change requiring a
tsconfig edit. Capped the catalog entry at `^5.9.3` (already the highest version in use in-repo, on
`jobnik-manager`/`jobnik-openapi`).

Reverted `pnpm-workspace.yaml`'s `typescript` entry to `^5.9.3`, re-ran `pnpm install` (clean, only the
pre-existing unrelated `@map-colonies/eslint-plugin` → `eslint@^9.39.0` peer warning remained, present before
this ticket too), and re-ran the full verification suite — all green (see below).

### Follow-up ticket filed

`.scratch/deps-catalog/issues/08-typescript-v7-follow-up.md` (Status: `ready-for-agent`), same shape/pattern as
`06-vitest-v5-follow-up.md`. Documents both failure modes (typescript-eslint's hard TS7 guard, and the
`jobnik-openapi` TS5011 rootDir break) and links the upstream tracking issue. **Not committed** — stays
untracked/local per this stack's convention (confirmed: `.scratch/` never appears in any prior commit's diff
either).

## Workspace changes (final state)

| Workspace | prettier before | prettier after | typescript before | typescript after |
|---|---|---|---|---|
| `jobnik-manager` | `^3.9.5` | `catalog:` → 3.9.6 | `^5.9.3` | `catalog:` → 5.9.3 |
| `jobnik-openapi` | `^3.9.5` | `catalog:` → 3.9.6 | `^5.9.3` | `catalog:` → 5.9.3 |
| `jobnik-sdk` | `^3.5.3` | `catalog:` → 3.9.6 | `^5.8.2` | `catalog:` → 5.9.3 |
| `e2e` | `^3.9.5` | `catalog:` → 3.9.6 | `^5.9.2` (in `dependencies`, miscategorized) | `catalog:` → 5.9.3 (moved to `devDependencies`) |
| root `package.json` | `^3.9.6` (untouched) | unchanged | `^5.9.3` (untouched) | unchanged |

`pnpm list typescript prettier --depth=0` confirmed post-install: all four workspaces resolve
`prettier@3.9.6` / `typescript@5.9.3` uniformly. `jobnik-sdk` (previously furthest behind on both) now matches
everyone else.

## Final cross-workspace catalog-membership audit

Enumerated every plain (non-peer) `dependency`/`devDependency` in all four workspace `package.json` files and
checked which names appear in 2+ workspaces.

**Already-catalogued, confirmed correct (all four or a subset, all referencing `catalog:`):** `eslint`,
`@map-colonies/eslint-config`, `@map-colonies/tsconfig`, `@types/node`, `vitest`, `@vitest/ui`,
`@vitest/coverage-v8`, `@faker-js/faker`, `jest-extended`, `rimraf`, `@map-colonies/prettier-config`,
`@map-colonies/openapi-helpers`, `@map-colonies/read-pkg`, `@map-colonies/semantic-conventions`,
`@opentelemetry/api`, `copyfiles`, `http-status-codes`, `openapi-types`, `docker-compose`, `is-ci`,
`@vitest/eslint-plugin`, `prom-client`, `@map-colonies/js-logger`, `@opentelemetry/core`,
`@opentelemetry/context-async-hooks`, and now `prettier`, `typescript`.

**Single-workspace-only (correctly NOT catalogued)**, spot-checked to make sure none secretly has a second
consumer:
- `jobnik-manager` only: `@godaddy/terminus`, `@map-colonies/config`, `@map-colonies/error-express-handler`,
  `@map-colonies/express-access-log-middleware`, `@map-colonies/openapi-express-viewer`,
  `@map-colonies/prometheus`, `@map-colonies/schemas`, `@map-colonies/tracing`,
  `@map-colonies/tracing-utils`, `@prisma/adapter-pg`, `@prisma/client`, `@prisma/instrumentation`,
  `compression`, `date-fns`, `express`, `express-openapi-validator`, `lodash`, `node-cron`, `pg`,
  `reflect-metadata`, `tsyringe`, `xstate`, `@opentelemetry/sdk-trace-node`, `@types/compression`,
  `@types/date-fns`, `@types/express`, `@types/express-serve-static-core`, `@types/lodash`, `@types/multer`,
  `@types/pg`, `@types/supertest`, `@types/swagger-ui-express`, `cross-env`, `get-port-please`,
  `jest-openapi`, `prisma`, `prisma-json-types-generator`, `supertest`, `tsc-alias`, `type-fest`, `zx`.
- `jobnik-sdk` only: `@arethetypeswrong/cli`, `@opentelemetry/sdk-trace-base`, `@types/opossum`, `publint`,
  `@readme/openapi-parser`, `openapi-fetch`, `openapi-typescript-helpers`, `opossum`, `undici`.
- `jobnik-openapi` only: `@redocly/cli`, `openapi-merge-cli`, `yaml`.
- `e2e` only: (none left uncatalogued beyond the workspace-local packages).

`@opentelemetry/sdk-trace-node` (manager) and `@opentelemetry/sdk-trace-base` (sdk) are different package
names — not a collision. Peer-only deps (`@opentelemetry/api`, `prom-client` in `jobnik-sdk`'s
`peerDependencies`) correctly excluded per spec — and `prom-client`/`@opentelemetry/api` are already
catalogued via their plain-dependency usages elsewhere, unaffected.

**Result: no third gap found.** `prettier` and `typescript` were the only two dependencies meeting the
catalog-membership rule that had been missed. The sweep is clean.

## Verification results

```
pnpm install
```
Clean. Only pre-existing, unrelated peer warning remained (`@map-colonies/eslint-plugin` wants
`eslint@^9.39.0`, found `10.10.0` — present before this ticket, not introduced by it).

```
pnpm turbo run format lint type-check build test --filter=jobnik-manager --filter=@map-colonies/jobnik-sdk --filter=jobnik-openapi --filter=jobnik-e2e
```
→ 17/17 tasks successful (re-ran post-commit too: 17/17 cached, `>>> FULL TURBO`).

```
pnpm turbo run check-pack --filter=@map-colonies/jobnik-sdk
```
→ 3/3 tasks successful (publint + `@arethetypeswrong/cli` + `checkPack.mts`).

## Commit

```
git add pnpm-workspace.yaml pnpm-lock.yaml apps/jobnik-manager/package.json packages/jobnik-sdk/package.json packages/jobnik-openapi/package.json e2e/package.json
git commit -m "fix(deps): catalog prettier and typescript, close catalog-membership gap"
```
Scope used: `deps` (spans all four workspaces, matches instructions). `.scratch/` was never staged (confirmed
via `git status --short` before commit — only the 6 tracked files were staged, `.scratch/` stayed as `??`).

Husky's pre-commit hook (knip via lint-staged) ran and passed (`✅ Everything is awesome!`).

## Stack submission

```
gh stack submit --auto --open
```
→ Created PR #44 for `deps-catalog/06-catalog-gaps`, stack #39, 6 branches pushed and synced.

PR #44 description was then edited (`gh pr edit 44 --body-file ...`) to include the full prettier/typescript
rationale, the two concrete TS7 failure modes with commands/output, the fallback decision, the follow-up
ticket pointer, the audit summary, and the verification commands/results — matching the level of detail the
spec expects for a CI-decided fallback ("note the fallback and why in the PR description").

## Final `gh stack view --json`

All 6 branches present, correctly chained, `needsRebase: false` throughout:

| Branch | PR | Base | needsRebase |
|---|---|---|---|
| `deps-catalog/01-scaffold` | #37 | `master` (trunk) | false |
| `deps-catalog/02-openapi` | #38 | `deps-catalog/01-scaffold` | false |
| `deps-catalog/03-e2e` | #40 | `deps-catalog/02-openapi` | false |
| `deps-catalog/04-manager` | #41 | `deps-catalog/03-e2e` | false |
| `deps-catalog/05-sdk` | #42 | `deps-catalog/04-manager` | false |
| `deps-catalog/06-catalog-gaps` | #44 | `deps-catalog/05-sdk` | false |

All 6 PRs OPEN. Stack is clean top to bottom.

## Summary

- `prettier` → `^3.9.6` (npm latest, zero-risk, landed as attempted).
- `typescript` → attempted npm latest (`^7.0.2`) for real; capped at fallback `^5.9.3` after genuine, verified
  breakage (typescript-eslint's hard TS7 runtime guard + a real `tsc` TS5011 build break in `jobnik-openapi`),
  neither of which was a trivial mechanical fix. Follow-up ticket 08 filed.
- All four workspaces now reference both via `catalog:`. `jobnik-sdk`'s previously-lagging versions
  (`prettier@^3.5.3`, `typescript@^5.8.2`) now match everyone else.
- `e2e`'s `typescript` moved from `dependencies` to `devDependencies`.
- Root `package.json` untouched.
- Final full audit: no third catalog-membership gap found beyond `prettier`/`typescript`.
