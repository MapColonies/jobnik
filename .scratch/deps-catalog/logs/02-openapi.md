# Ticket 02 — jobnik-openapi alignment — working notes

## Branch / stack
- Confirmed `git branch --show-current` → `deps-catalog/01-scaffold` and `gh stack view --json` showed it as the
  current/topmost branch, base `master`, PR #37 open. Matches the ticket's precondition.
- `gh stack add deps-catalog/02-openapi` — created and checked out `deps-catalog/02-openapi` on top of
  `deps-catalog/01-scaffold`.

## Verified npm-latest figures (re-checked at implementation time, per spec's "re-check since these move")
- `pnpm view eslint version` → `10.10.0`. Matches the task's stated verified figure (`^10.10.0`), one step ahead of
  the ticket text's placeholder (`^10.9.1`) and the spec's (`^10.9.1`). Attempted this as first choice.
- `npm view @types/node versions --json`, filtered to the `24.x` line, max → `24.13.3`. Matches ticket/spec target
  exactly. This is a fixed target (Node 24 runtime pin), not a "latest npm global" attempt — npm's actual global
  latest is in the `26.x` line (`26.4.1` observed), which nothing in this repo runs.
- `@map-colonies/eslint-config` → `^9.0.0` and `@map-colonies/tsconfig` → `^2.0.0`: both already the version
  `jobnik-openapi` was pinned to before this change (confirmed by reading `packages/jobnik-openapi/package.json`
  pre-edit: `"@map-colonies/eslint-config": "^9.0.0"`, `"@map-colonies/tsconfig": "^2.0.0"`). No version change,
  purely a `catalog:` reference swap, as expected.

## What changed

### `pnpm-workspace.yaml`
Added four new entries to the existing flat `catalog:` block (inserted above the ticket-01 entries, order otherwise
untouched):
```
eslint: ^10.10.0
'@map-colonies/eslint-config': ^9.0.0
'@map-colonies/tsconfig': ^2.0.0
'@types/node': ^24.13.3
```

### `packages/jobnik-openapi/package.json`
Four `devDependencies` entries switched from literal ranges to `catalog:`:
- `@map-colonies/eslint-config`: `^9.0.0` → `catalog:` (no version change)
- `@map-colonies/tsconfig`: `^2.0.0` → `catalog:` (no version change)
- `eslint`: `^10.0.0` → `catalog:` (resolves to `10.10.0`, a real bump — see below)
- `@types/node`: `^25.0.0` → `catalog:` (resolves to `24.13.3`, the actual fix this ticket exists for — was
  previously resolving to `25.9.5`, a Node major nothing in this repo runs)

## `eslint` latest-attempt outcome: **landed on latest, no fallback needed**

Attempted `^10.10.0` (today's npm latest) directly — did not pre-emptively cap at the `^10.0.0` in-repo fallback.
All four `jobnik-openapi` checks (`type-check`, `lint`, `lint:openapi`, `build`) passed clean on the first attempt via
`pnpm turbo run type-check lint lint:openapi build --filter=jobnik-openapi` → **4 successful, 4 total**. No lint
violations surfaced from the `10.9.0` → `10.10.0` bump (a single patch-ish minor within the same major openapi was
already on, so no rule-set changes were expected or observed). No fallback to `^10.0.0` was triggered.

Pre-existing, unrelated: `pnpm install` reports an unmet-peer warning for both `jobnik-manager` and `jobnik-openapi`
(`@map-colonies/eslint-plugin@0.1.0` wants `eslint@^9.39.0`, found `10.9.0`/`10.10.0`). This is the same warning
ticket 01's log flagged as pre-existing (already present in `jobnik-manager` before this PR, unrelated to the
catalog work, not something this ticket's scope covers). It's a warning, not an install/build/lint failure — did not
block any check.

## `pnpm-lock.yaml` — confirmed the actual resolution change

Read the diff directly:
- New catalog block gains `eslint: 10.10.0`, `@map-colonies/eslint-config: 9.0.0` (unchanged), `@map-colonies/tsconfig`
  (unchanged), `@types/node: 24.13.3`.
- `packages/jobnik-openapi`'s importer entry:
  - `@types/node`: `specifier: ^25.0.0` / `version: 25.9.5` → `specifier: 'catalog:'` / `version: 24.13.3` — the
    required fix, confirmed.
  - `eslint`: `specifier: ^10.0.0` → `'catalog:'`, resolved version moves `10.9.0` → `10.10.0`.
  - `@map-colonies/eslint-config`, `@map-colonies/tsconfig`: specifier only changes to `'catalog:'`; resolved
    versions unchanged.
- A parallel `eslint@10.10.0` dependency subtree (and everything transitively keyed off it —
  `@map-colonies/eslint-config@9.0.0(...eslint@10.10.0...)`, `@typescript-eslint/*@...(eslint@10.10.0...)`, etc.) was
  added **alongside** the pre-existing `eslint@10.9.0` subtree, which the other three workspaces
  (`jobnik-manager`, `jobnik-sdk`, `e2e`) still resolve against via their own untouched literal `^10.0.0` ranges.
  Nothing about their resolved versions changed. This confirms the catalog entries introduced here are additive and
  scoped to `jobnik-openapi` only, per the ticket's expectation that "they shouldn't [affect other workspaces] since
  openapi is establishing these entries for the first time."
- `git diff --stat`: only `packages/jobnik-openapi/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` touched —
  no other workspace manifest changed.

## Verification

### `pnpm install`
Ran clean (regenerated lockfile). Same pre-existing warnings noted in ticket 01's log (pnpm.onlyBuiltDependencies/
overrides fields no longer read, some deprecated-package warnings) plus the two unmet-peer-eslint warnings discussed
above (one pre-existing for `jobnik-manager`, one newly at `10.10.0` instead of `10.9.0` for `jobnik-openapi` — same
underlying pre-existing issue, not new in kind).

### `pnpm turbo run type-check lint lint:openapi build --filter=jobnik-openapi`
**4 successful, 4 total.** Confirms `type-check`, `lint`, `build` (plus `lint:openapi`, included since it's the
ticket's own workspace-specific check) all pass with the corrected `@types/node` and the latest-attempt `eslint`.

### `pnpm turbo run format lint type-check build test --filter=jobnik-manager --filter=@map-colonies/jobnik-sdk --filter=jobnik-openapi --filter=jobnik-e2e`
**17 successful, 17 total** (3 cached, 14 fresh). Confirms no regression in any other workspace in the stack from
the catalog entries this PR introduces.

## Commit
`git add packages/jobnik-openapi/package.json pnpm-lock.yaml pnpm-workspace.yaml` (3 files — `.scratch/` left
untracked, not part of this PR diff, verified via `git status --short` before commit).

Commit: `fix(jobnik-openapi): align shared deps to the catalog, fix @types/node to the Node 24 line` — scope
`jobnik-openapi`, the exact `name` field from `packages/jobnik-openapi/package.json`. Husky pre-commit (knip check:
"Everything is awesome!") and commit-msg hooks passed. Commit hash: `d277f54`.

## Surprises
- None. This ticket really was close to pure mechanics as the issue description promised, with the one genuine
  version change (`@types/node` ^25.0.0 → ^24.13.3, i.e. resolved 25.9.5 → 24.13.3) landing exactly as specified, and
  the `eslint` latest-attempt (`^10.10.0`) clearing CI on the first try — no fallback to `^10.0.0` needed. The
  pre-existing unmet-peer-eslint warning (unrelated to this ticket, already flagged in ticket 01) is worth carrying
  forward as a known-issue note for whichever later ticket in the stack (03/04/05) ends up de-facto resolving it via
  a bump to `@map-colonies/eslint-plugin`/`@map-colonies/eslint-config`, but nothing in this ticket's scope required
  touching it.

## Next: `gh stack submit --auto --open`
Run after this log is written (log itself is not committed, `.scratch/` stays untracked/unstaged for this PR).
