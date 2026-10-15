# Ticket 04 — jobnik-manager alignment — working notes

## Branch / stack
- Confirmed `git branch --show-current` → `deps-catalog/03-e2e`, `gh stack view --json` showed it current/topmost,
  base `deps-catalog/02-openapi`, PR #40 open. Matches ticket precondition.
- `gh stack add deps-catalog/04-manager` — created and checked out `deps-catalog/04-manager` on top of
  `deps-catalog/03-e2e`.

## Pre-implementation state of `apps/jobnik-manager/package.json`
Before edits, manager already had literal (non-catalog) ranges for all ten deps this ticket touches:
`@faker-js/faker: ^10.5.0`, `@map-colonies/eslint-config: ^9.0.0`, `@map-colonies/tsconfig: ^2.0.0`,
`@types/node: ^25.0.0`, `@vitest/coverage-v8: ^4.1.10`, `@vitest/ui: ^4.0.16`, `eslint: ^10.0.0`,
`jest-extended: ^7.0.0`, `rimraf: ^6.1.2`, `vitest: ^4.0.16`.

## Verified npm-latest figures (re-checked at implementation time)
- `pnpm view @vitest/coverage-v8 versions --json` → npm's technical `latest` dist-tag is `5.0.0` (vitest's whole
  ecosystem major, same as ticket 03 found for `vitest`/`@vitest/ui`), but the newest stable `4.x` release is
  `4.1.11` — exists in the version list right below the `5.0.0-beta.*`/`5.0.0-rc.*`/`5.0.0` entries. Per explicit
  instruction (matching ticket 03's `vitest`/`@vitest/ui` catalog value of `^4.1.11`), targeted `^4.1.11` for
  `@vitest/coverage-v8` to keep the whole vitest toolchain on one major line. Did not attempt `5.0.0`.
- `pnpm view rimraf version` → `6.1.3`. Matches ticket's stated target exactly. Attempted as first choice.
- `pnpm view jest-extended version` → `7.0.0`. Matches ticket's stated already-latest target exactly (no version
  change from manager's existing literal `^7.0.0`, just a `catalog:` reference swap).

## What changed

### `pnpm-workspace.yaml`
Added three new entries to the existing flat `catalog:` block, inserted after ticket 03's `'@faker-js/faker'` entry:
```
'@vitest/coverage-v8': ^4.1.11
jest-extended: ^7.0.0
rimraf: ^6.1.3
```

### `apps/jobnik-manager/package.json`
Ten `devDependencies` entries switched from literal ranges to `catalog:`:
- `@faker-js/faker`: `^10.5.0` → `catalog:` (resolves to `10.6.0`)
- `@map-colonies/eslint-config`: `^9.0.0` → `catalog:` (no version change, `9.0.0`)
- `@map-colonies/tsconfig`: `^2.0.0` → `catalog:` (no version change, `2.0.0`)
- `@types/node`: `^25.0.0` → `catalog:` (resolves to `24.13.3` — the actual fix this ticket exists for; was
  previously resolving to a `25.x` line nothing in this repo runs)
- `@vitest/coverage-v8`: `^4.1.10` → `catalog:` (resolves to `4.1.11`)
- `@vitest/ui`: `^4.0.16` → `catalog:` (resolves to `4.1.11`, matching ticket 03's `vitest`/`@vitest/ui` catalog bump)
- `eslint`: `^10.0.0` → `catalog:` (resolves to `10.10.0`, ticket 02's catalog value)
- `jest-extended`: `^7.0.0` → `catalog:` (no version change, `7.0.0`)
- `rimraf`: `^6.1.2` → `catalog:` (resolves to `6.1.3`)
- `vitest`: `^4.0.16` → `catalog:` (resolves to `4.1.11`, matching ticket 03's `vitest` catalog bump)

## Latest-attempt outcomes
- `@vitest/coverage-v8`: **landed on `^4.1.11`** (newest stable 4.x, matching the vitest/`@vitest/ui` line ticket 03
  already landed on) — no fallback to `^4.1.10` needed.
- `rimraf`: **landed on `^6.1.3`** — no fallback to `^6.1.2` needed.
- `jest-extended`: **landed on `^7.0.0`** — already latest, no version change at all.

## The vitest v3→v4 bare-specifier import regression ticket 03 hit — did NOT recur here
Ticket 03's e2e log flagged a real v3→v4 vitest/vite regression (bare-specifier imports like `'infrastructure/data'`
resolving via `tsconfig` `baseUrl` at compile time but failing at vitest/vite runtime resolution). Checked
`apps/jobnik-manager`'s test files for the same bare-specifier import pattern before running the suite — none found;
manager's test imports all use relative (`./`/`../`) specifiers already. Confirmed no fix needed: `pnpm turbo run
type-check lint build test --filter=jobnik-manager` passed clean on the first run after the bump (5 successful, 5
total, 0 cached — type-check, lint, build, test, and one more turbo-derived task).

## Verification

### `pnpm install`
Ran clean. Only pre-existing warnings carried forward from tickets 01–03: legacy `pnpm.onlyBuiltDependencies`/
`pnpm.overrides` fields no longer read, some deprecated-package warnings (`@types/date-fns`,
`@map-colonies/openapi-helpers`, `prom-client`, `eslint@9.39.5` transitively in the SDK), and the pre-existing
unmet-peer-eslint warnings for `jobnik-manager` (now `10.10.0` found, was `10.9.0`/`10.0.0` before) and `e2e`
(`@map-colonies/eslint-plugin@0.1.0` wants `eslint@^9.39.0`). No new warning categories introduced by this ticket.

Confirmed in the regenerated `pnpm-lock.yaml`: `apps/jobnik-manager`'s `@types/node` importer entry now shows
`specifier: ^24.13.3` (catalog) / `version: 24.13.3` — the required fix.

### `pnpm turbo run type-check lint build test --filter=jobnik-manager`
**5 successful, 5 total** (0 cached — fully fresh run). Confirms `type-check`, `lint`, `build`, `test` all pass with
the corrected `@types/node` and all ten latest-attempt catalog values.

### `pnpm turbo run format lint type-check build test --filter=jobnik-manager --filter=@map-colonies/jobnik-sdk --filter=jobnik-openapi --filter=jobnik-e2e`
**17 successful, 17 total** (5 cached, 12 fresh) — same result shape as tickets 01–03's logs, confirming no
regression in any of the four workspaces from this ticket's catalog/manifest changes.

## Commit
`git add apps/jobnik-manager/package.json pnpm-lock.yaml pnpm-workspace.yaml` (3 files — `.scratch/` left
untracked/unstaged, not part of this PR diff, verified via `git status --short` before commit).

Commit: `fix(jobnik-manager): align shared deps to the catalog, fix @types/node to the Node 24 line` — scope
`jobnik-manager`, the exact `name` field from `apps/jobnik-manager/package.json`. Husky pre-commit (knip check:
"Everything is awesome!") and commit-msg hooks passed. Commit hash: `a77dee9`.

## Surprises
- None. All ten latest-attempt values (including the two with explicit fallback options,
  `@vitest/coverage-v8`/`rimraf`) cleared CI on the first try — no fallback needed for any dependency. The
  bare-specifier import regression ticket 03 hit in `e2e` did not recur in `jobnik-manager` since its test files
  never used that pattern.

## Next: `gh stack submit --auto --open`
Run after this log is written (log itself is not committed, `.scratch/` stays untracked/unstaged for this PR).
