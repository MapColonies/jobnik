# Ticket 05 — jobnik-sdk alignment — working notes

## Branch / stack
- Confirmed `git branch --show-current` → `deps-catalog/04-manager`, `gh stack view --json` showed it current/topmost,
  base `deps-catalog/03-e2e`, PR #41 open. Matches ticket precondition.
- `gh stack add deps-catalog/05-sdk` — created and checked out `deps-catalog/05-sdk` on top of `deps-catalog/04-manager`.

## Read first (in full)
- `.scratch/deps-catalog/spec.md`
- `.scratch/deps-catalog/issues/05-jobnik-sdk.md`
- `.scratch/deps-catalog/logs/01-scaffold.md`, `02-openapi.md`, `03-e2e.md`, `04-manager.md`

## What changed

### `packages/jobnik-sdk/eslint.config.mjs`
`import { config } from '@map-colonies/eslint-config/helpers'` → `import { defineConfig } from '@map-colonies/eslint-config/helpers'`,
and `export default config(...)` → `export default defineConfig(...)`. Matches the shape already used by
`jobnik-manager`, `jobnik-openapi`, `e2e` (all confirmed by reading their `eslint.config.mjs` files before editing).
Did **not** adopt `@map-colonies/eslint-config/vitest` / `@vitest/eslint-plugin` in the SDK — confirmed `jobnik-openapi`
(also already on eslint-config v9) doesn't use it either, so parity doesn't require it, per the spec's explicit
out-of-scope note.

### `pnpm-workspace.yaml`
Two new catalog entries added (this ticket establishes them, per the checklist):
```
'@opentelemetry/core': ^2.11.0
'@opentelemetry/context-async-hooks': ^2.11.0
```
Per the task's pre-verified npm-latest figure (`^2.11.0`, one minor past the spec's stale `^2.10.0`), attempted
directly — see outcome below.

### `packages/jobnik-sdk/package.json`
`devDependencies` switched from literal ranges to `catalog:`:
- `@map-colonies/eslint-config`: `^7.1.0` → `catalog:` (resolves `9.0.0` — the two-major jump)
- `@map-colonies/tsconfig`: `^2.0.0` → `catalog:` (no version change)
- `@opentelemetry/context-async-hooks`: `^2.0.1` → `catalog:` (resolves `2.11.0`)
- `@opentelemetry/core`: `^2.0.1` → `catalog:` (resolves `2.11.0`)
- `@types/node`: `^24.0.4` → `catalog:` (resolves `24.13.3`, Node-24-line fix already established by tickets 02/03/04)
- `@vitest/coverage-v8`: `^4.0.15` → `catalog:` (resolves `4.1.11`)
- `@vitest/ui`: `^4.0.15` → `catalog:` (resolves `4.1.11`)
- `eslint`: `^9.31.0` → `catalog:` (resolves `10.10.0` — the other half of the two-major jump)
- `jest-extended`: `^6.0.0` → `catalog:` (resolves `7.0.0`)
- `rimraf`: `^6.0.1` → `catalog:` (resolves `6.1.3`)
- `vitest`: `^4.0.15` → `catalog:` (resolves `4.1.11`)

`@opentelemetry/sdk-trace-base` (`^2.0.1`) was **left untouched, literal** — grepped the whole repo
(`grep -rn "sdk-trace-base" --include=package.json .`) and confirmed it's used only by `jobnik-sdk`, nowhere else, so
it fails the "used by two or more workspaces" catalog-membership rule and isn't part of this ticket's checklist
(only `@opentelemetry/core` and `@opentelemetry/context-async-hooks` are named). Not catalogued, on purpose.

`peerDependencies` (`@opentelemetry/api: ^1.9.0`, `prom-client: ^15.0.0`) confirmed **untouched** — checked the file
before and after; both ranges byte-identical to before. Not catalogued, per instruction.

## `eslint --fix .` outcome: exactly 43 violations, 100% auto-fixable, as pre-confirmed

Ran `eslint .` (no fix) first to get a baseline count: **43 problems (43 errors, 0 warnings)**, all either
`@typescript-eslint/consistent-type-imports` or `unicorn/prefer-node-protocol` (one instance, in
`tests/worker/worker.spec.ts`, `timers/promises` → `node:timers/promises`), exactly matching the spec/ticket's
pre-confirmed figures. Every single one was flagged "potentially fixable with the `--fix` option" — no manual
call-site changes were needed anywhere, so nothing to flag/stop-and-report.

Ran `eslint --fix .` once — clean, no residual output. Re-ran `eslint .` afterward: **exit 0, zero output** (zero
errors/warnings). 25 files touched by the fix, all mechanical `import` → `import type` conversions (or split
type/value imports) plus the one `node:` protocol prefix.

### One follow-up needed: a Prettier formatting artifact from the fix
The type-only-import split in `src/network/httpClient.ts` left `import type { Dispatcher} from 'undici';` (missing a
space before the closing brace) — caught by the `lint` task's `prelint` step (`prettier --check .`), which failed on
that one file. Ran `npm run format:fix` (prettier `--write .`) in the SDK workspace to normalize it; only that one
file changed. This is expected fallout of an automated `--fix` pass touching import-declaration formatting, not a
hand-written code change — covered by the same "mechanical fix" allowance as the `--fix` pass itself.

## `@opentelemetry/core` / `@opentelemetry/context-async-hooks` latest-attempt outcome: **landed on `^2.11.0`, no fallback needed**

Attempted `^2.11.0` directly (today's re-verified npm-latest, one minor past the spec's stale `^2.10.0` figure).
Confirmed in the regenerated `pnpm-lock.yaml`: both packages resolve to `2.11.0` (`grep` of the lockfile shows
`@opentelemetry/context-async-hooks@2.11.0` and `@opentelemetry/core@2.11.0` present and referenced from the new
`catalog:` block and from `jobnik-sdk`'s importer entry). `jobnik-sdk`'s full `vitest` suite (168 passed, 1 todo,
11 files) and `pnpm turbo run type-check lint build test check-pack --filter=@map-colonies/jobnik-sdk` (6/6) both
passed clean on the first attempt — no behavioral difference surfaced beyond "new version installed", so no fallback
to `^2.1.0` was needed.

## Final cross-workspace catalog-coverage sweep — found and fixed leftover literals beyond this ticket's own checklist

Per the checklist's explicit "completion criterion for the whole 5-PR stack" item, wrote a small script to compare
every catalog entry in `pnpm-workspace.yaml` against all four workspace `package.json`s
(`apps/jobnik-manager`, `packages/jobnik-sdk`, `packages/jobnik-openapi`, `e2e`). Before fixing, it surfaced **five
leftover literal versions for already-catalog-covered dependencies that no earlier ticket's scope had touched**:

- `e2e/package.json`: `@map-colonies/eslint-config: ^9.0.0` (literal, never catalogued — e2e's own ticket 03 didn't
  touch eslint at all, since e2e wasn't the ticket assigned to the eslint two-major jump)
- `e2e/package.json`: `eslint: ^10.0.0` (literal — same reason)
- `e2e/package.json`: `@opentelemetry/context-async-hooks: ^2.1.0` (literal — the two new catalog entries this
  ticket establishes weren't backfilled into e2e's pre-existing usage automatically)
- `e2e/package.json`: `@opentelemetry/core: ^2.1.0` (literal — same reason)
- `packages/jobnik-openapi/package.json`: `rimraf: ^6.1.2` (literal — ticket 02 didn't touch `rimraf`, ticket 04
  established the catalog entry for `jobnik-manager`'s usage only)

Fixed all five by switching to `catalog:` (all resolve to the existing catalog values: `9.0.0`, `10.10.0`, `2.11.0`,
`2.11.0`, `6.1.3` respectively — no new version-target decisions needed, these deps already had catalog entries from
earlier tickets/this ticket). Re-ran `pnpm install`, then re-verified:
- `pnpm --filter jobnik-e2e exec eslint .` → clean, zero violations (e2e was already on `defineConfig`/eslint-config
  v9 shape from the start, and the `10.0.0` → `10.10.0` eslint bump is a minor-within-major bump that introduced no
  new rules, unlike the SDK's major-version eslint-config jump) — no `--fix` pass needed for e2e.
- Re-ran the full sweep script after the fix: **zero leftover literals for any catalog-covered dependency across all
  four workspaces.**

### Confirmed deliberately out-of-scope, not a leftover: `prettier` and `typescript`
The same sweep also flags `prettier` (`^3.9.5`/`^3.5.3`/`^3.9.5`/`^3.9.5`) and `typescript` (`^5.9.3`/`^5.8.2`/
`^5.9.3`/`^5.9.2`) as shared across all four workspaces with **divergent, non-catalogued** versions. These are
**not** leftover literals for a catalog-covered dependency (neither is a catalog entry at all) — neither appears
anywhere in the spec's "Concrete per-dependency targets" list nor its "Already-identical-everywhere" list, i.e. the
spec never enumerated them as in-scope for this 5-PR stack. Picking version targets for them now would require the
same npm-latest-attempt + CI-fallback investigation the spec did for every other dependency, which was never done
for these two — doing so unilaterally here would be undocumented scope creep beyond both this ticket's checklist and
the spec's explicit dependency list. Left untouched, flagging here as a known gap for a possible future ticket (not
part of "every dependency shared... has exactly one catalog entry", since that sentence is scoped to the
catalog-covered set this stack actually established, not the theoretical set of every shared dependency in the repo).

## Verification

### `pnpm install`
Ran clean after each edit round. Only pre-existing warnings carried forward from tickets 01–04 (legacy
`pnpm.onlyBuiltDependencies`/`pnpm.overrides` fields no longer read, some deprecated-package warnings). Notably, the
pre-existing unmet-peer-eslint warning for `e2e` (`@map-colonies/eslint-plugin@0.1.0` wants `eslint@^9.39.0`) is
**gone** after this ticket's sweep-fix — `e2e` now resolves eslint through the same catalog entry as everything else
(`10.10.0`), collapsing what used to be a second parallel `eslint` subtree in the lockfile. Only `jobnik-manager`'s
pre-existing unmet-peer warning (same root cause, `@map-colonies/eslint-plugin` itself lagging its own peer range —
out of scope for this stack) remains.

### `pnpm turbo run type-check lint build test check-pack --filter=@map-colonies/jobnik-sdk`
**6 successful, 6 total** (type-check, lint, build, test, check-pack — turbo derives one extra task from the
dependency graph). Ran with `--force` to confirm a fully fresh, uncached pass. `check-pack` = `publint && attw --pack
. && node scripts/checkPack.mts` — all three passed (publint clean, `@arethetypeswrong/cli` clean, `checkPack.mts`'s
own dry-run-pack assertions — `dist/index.js`/`dist/index.d.ts`/`dist/openapi3.yaml` present, no `jobnik-openapi` in
shipped dependencies — clean).

### `pnpm turbo run format lint type-check build test --filter=jobnik-manager --filter=@map-colonies/jobnik-sdk --filter=jobnik-openapi --filter=jobnik-e2e`
**17 successful, 17 total** (`--force`, fully fresh) — same result shape as tickets 01–04's logs, confirming no
regression in any of the four workspaces from this ticket's catalog/manifest changes.

### `pnpm verify` (`turbo run format lint type-check build test`, full repo, no filter)
**17 successful, 17 total**, full cache hit (`>>> FULL TURBO`) — confirms the whole repo, not just the touched
workspaces, verifies clean.

### `jobnik-sdk`'s own `npm test` (vitest, standalone, not through turbo)
**168 tests passed, 1 todo, 11 test files, 0 failed.** No bare-specifier import resolution issue (the class of
regression ticket 03 hit in `e2e` on the v3→v4 vitest jump) — checked `jobnik-sdk`'s test imports before running;
none use bare specifiers, all already relative or package-name imports resolved normally by Node/vitest's standard
resolver. `jobnik-sdk` was already on vitest `4.0.15` before this ticket (a prior, already-landed v3→v4 jump outside
this stack's scope) — this ticket's bump (`4.0.15` → `4.1.11`) is a same-major minor bump, not a repeat of the v3→v4
regression class, and none surfaced.

### A red herring investigated and resolved: a turbo task-ordering race with `check-pack`
Mid-verification, running `pnpm turbo run format lint type-check build test check-pack --filter=<all four>` (i.e.
folding `check-pack` into the four-workspace sweep, which is **not** what the task's own verification commands
specify — they're two separate commands, the second one omitting `check-pack`) produced 887 spurious
`@typescript-eslint/no-unsafe-*` errors in `e2e`'s lint task. Root-caused: `jobnik-sdk`'s `check-pack` script runs
`npm pack --dry-run`, which triggers the `prepack` → `build` → `prebuild` → `rimraf dist` chain again even during a
dry run; when turbo runs `jobnik-sdk`'s `check-pack` task in parallel with `e2e`'s `lint` task (which type-resolves
against `@map-colonies/jobnik-sdk`'s `dist/*.d.ts` as a workspace dependency), the `rimraf dist` mid-flight can leave
`e2e`'s type-aware lint rules unable to resolve `jobnik-sdk`'s types, cascading into "unsafe access on an
unresolvable type" everywhere `jobnik-sdk` methods are called. This is a **pre-existing structural race** in
`checkPack.mts`'s use of `npm pack --dry-run` (nothing this ticket's version bumps caused it), and it only surfaces
when `check-pack` and a downstream consumer's `lint`/`type-check` are scheduled in the same turbo run — exactly the
scenario the task's own two-separate-commands verification sequence avoids by design. Confirmed by re-running the
exact two commands specified in the task (`check-pack` isolated to the `--filter=@map-colonies/jobnik-sdk`-only
command, never combined with the four-workspace sweep): both pass clean, 6/6 and 17/17 respectively, with no
recurrence. Not fixed in this PR (out of scope — pre-existing, not caused by this ticket's changes, and the
specified verification sequence doesn't trigger it); worth flagging as a latent race for whoever next touches
`checkPack.mts` or `turbo.json`'s task graph.

## Commit
`git add e2e/package.json packages/jobnik-openapi/package.json packages/jobnik-sdk/eslint.config.mjs
packages/jobnik-sdk/package.json packages/jobnik-sdk/src packages/jobnik-sdk/tests pnpm-lock.yaml
pnpm-workspace.yaml` (29 files — `.scratch/` left untracked/unstaged, not part of this PR diff, verified via
`git status --short` before commit).

Commit: `fix(jobnik-sdk): catch up eslint two majors, complete catalog coverage` — scope `jobnik-sdk` (the
`@map-colonies/jobnik-sdk` package's pnpm-scope-derived commitlint scope; accepted on the first attempt, no dry-run
needed). Husky pre-commit (knip check: "Everything is awesome!") and commit-msg hooks passed. Commit hash: `c000f09`.

The commit message body (and therefore the PR body, since `gh stack submit` seeds the PR description from the
commit) explicitly records: "The issue's 'the logger' line item is dropped from scope: `@map-colonies/js-logger` has
a single consumer (`apps/jobnik-manager`), so there was no cross-workspace version to align" — satisfying the
checklist's requirement that this be noted in the PR (or issue closure) so it isn't mistaken for an oversight later.

## `gh stack submit --auto --open`
```
Checking stack state...
Pushing to origin...
PR #37 for deps-catalog/01-scaffold is up to date
PR #38 for deps-catalog/02-openapi is up to date
PR #40 for deps-catalog/03-e2e is up to date
PR #41 for deps-catalog/04-manager is up to date
✓ Created PR #42 for deps-catalog/05-sdk
✓ Stack updated on GitHub with 5 PRs (stack #39)
✓ Pushed and synced 5 branches
```
PR #42: https://github.com/MapColonies/jobnik/pull/42

## Final stack sanity check: `gh stack view --json`

All 5 branches present, correctly chained (01→02→03→04→05), each with an OPEN PR, `needsRebase: false` on every
branch:

```json
{
  "trunk": "master",
  "currentBranch": "deps-catalog/05-sdk",
  "branches": [
    { "name": "deps-catalog/01-scaffold", "base": "master (fdbe0dd5...)",        "pr": { "number": 37, "state": "OPEN" }, "needsRebase": false },
    { "name": "deps-catalog/02-openapi",  "base": "deps-catalog/01-scaffold",    "pr": { "number": 38, "state": "OPEN" }, "needsRebase": false },
    { "name": "deps-catalog/03-e2e",      "base": "deps-catalog/02-openapi",     "pr": { "number": 40, "state": "OPEN" }, "needsRebase": false },
    { "name": "deps-catalog/04-manager",  "base": "deps-catalog/03-e2e",         "pr": { "number": 41, "state": "OPEN" }, "needsRebase": false },
    { "name": "deps-catalog/05-sdk",      "base": "deps-catalog/04-manager",     "pr": { "number": 42, "state": "OPEN" }, "isCurrent": true, "needsRebase": false }
  ]
}
```

(Full raw JSON captured above in this log during the run — heads: `01`=`54ff182`, `02`=`d277f54`, `03`=`00aa707`,
`04`=`a77dee9`, `05`=`c000f09`.)

## Surprises / follow-ups for whoever reads this later
1. **The final catalog-coverage sweep genuinely needed to touch `e2e` and `jobnik-openapi`, not just `jobnik-sdk`.**
   The ticket's own checklist frames this as "a final sweep... to confirm this," implying it should already be true
   by the time ticket 05 runs — it wasn't, because tickets 02/03/04 each scoped their own eslint/opentelemetry work
   narrowly to their assigned dependency, leaving a few already-catalogued-elsewhere dependencies still literal in
   workspaces that weren't the ticket assigned to bump them. Fixed as part of this PR since the checklist explicitly
   calls this out as "the completion criterion for the whole 5-PR stack" and all five fixes were pure `catalog:`
   reference swaps to already-established/already-vetted values — no new version-target decisions.
2. **`prettier` and `typescript` remain shared-but-uncatalogued across all four workspaces**, with genuinely
   divergent versions. Confirmed deliberate: neither is in the spec's dependency list at all. Not touched — flagging
   as a real gap for a possible future ticket, not a defect in this stack's delivery (the spec simply never scoped
   them in).
3. **The `check-pack` / turbo task-race** described above (pre-existing, not introduced by this ticket, doesn't
   trigger under the task's own specified verification commands) — flagging for `checkPack.mts`/`turbo.json`
   maintainers, not fixed here.
4. `@opentelemetry/sdk-trace-base` stays a single-consumer literal dependency in `jobnik-sdk`, same treatment as
   `@map-colonies/js-logger` in `jobnik-manager` — correctly excluded from the catalog by the "two or more
   consumers" rule (verified via repo-wide grep), not an oversight.
