# Ticket 01 — Catalog scaffold — working notes

## Branch / stack
- `git config rerere.enabled true`, `git config remote.pushDefault origin`
- `gh stack init --base master deps-catalog/01-scaffold` — created and checked out `deps-catalog/01-scaffold` off `master`.

## What changed

### `pnpm-workspace.yaml`
Added a flat `catalog:` block (no `catalogs:` split) with all 13 entries from the ticket, at their current identical-everywhere versions, unchanged:
`@map-colonies/prettier-config` ^1.0.0, `@map-colonies/openapi-helpers` ^5.1.0, `@map-colonies/read-pkg` ^2.0.0,
`@map-colonies/semantic-conventions` ^1.0.0, `@opentelemetry/api` ^1.9.0, `copyfiles` ^2.4.1, `http-status-codes` ^2.3.0,
`openapi-types` ^12.1.3, `docker-compose` ^1.3.0, `is-ci` ^4.1.0, `@vitest/eslint-plugin` ^1.6.23, `prom-client` ^15.1.3,
`@map-colonies/js-logger` ^4.0.0.

### Consuming `package.json`s → `"<name>": "catalog:"`
Verified via `grep` sweep across the four workspace manifests before editing, so every plain dependency/devDependency
match was found (30 total references landed):

- **apps/jobnik-manager**: `@map-colonies/js-logger`, `@map-colonies/openapi-helpers`, `@map-colonies/read-pkg`,
  `@map-colonies/semantic-conventions`, `@opentelemetry/api`, `http-status-codes`, `prom-client` (all `dependencies`);
  `@map-colonies/prettier-config`, `@vitest/eslint-plugin`, `copyfiles`, `docker-compose`, `is-ci` (all `devDependencies`).
- **packages/jobnik-sdk**: `@map-colonies/openapi-helpers`, `@map-colonies/prettier-config`, `copyfiles`, `prom-client`
  (all `devDependencies`); `@map-colonies/read-pkg`, `@map-colonies/semantic-conventions`, `http-status-codes`,
  `openapi-types` (all plain `dependencies`).
- **packages/jobnik-openapi**: `@map-colonies/openapi-helpers`, `@map-colonies/prettier-config`, `copyfiles`,
  `openapi-types` (all `devDependencies`; this workspace has no plain `dependencies` block).
- **e2e**: `@opentelemetry/api`, `prom-client` (`dependencies`); `@map-colonies/prettier-config`, `@vitest/eslint-plugin`,
  `docker-compose`, `is-ci` (`devDependencies`).

### `jobnik-sdk` peerDependencies — untouched, as instructed
`packages/jobnik-sdk/package.json` has a `peerDependencies` block with `@opentelemetry/api: ^1.9.0` and
`prom-client: ^15.0.0`. Both left as literal ranges — not catalogued. Per the ticket, only plain `dependency`/
`devDependency` usages move to `catalog:`; peer ranges are meant to stay a range the consumer controls. Note this
means `jobnik-sdk` had **two** separate `prom-client` entries pre-change: a `devDependency` at `^15.1.3` (now
`catalog:`) and the `peerDependency` at `^15.0.0` (untouched) — these are genuinely different ranges for different
purposes, not a typo.

### Scope note: root `package.json` left untouched
Root `package.json` also has `@map-colonies/prettier-config` at `^1.0.0` (identical to the new catalog entry), but
the ticket text explicitly scopes "every consuming package.json" to `apps/jobnik-manager`, `packages/jobnik-sdk`,
`packages/jobnik-openapi`, and `e2e` only — root isn't in that list. Left it as a literal range, following the
explicit instruction rather than extending scope on my own initiative. Flagging here in case a later ticket wants
root picked up too.

## Verification

### `pnpm install`
Ran clean. Only warnings: pnpm no longer reads the legacy `pnpm.onlyBuiltDependencies`/`pnpm.overrides` package.json
fields (pre-existing, unrelated to this change — surfaced because `pnpm install` re-parses on every run), some
pre-existing deprecated-package warnings, and one pre-existing peer-dependency mismatch (`e2e`'s
`@map-colonies/eslint-config@9.0.0` → `@map-colonies/eslint-plugin@0.1.0` wants `eslint@^9.39.0`, found `10.9.0`) —
this predates this PR (eslint bump to `^10.0.0` already landed in a prior change; not touched by ticket 01) and is
unrelated to catalog scaffolding.

### `pnpm-lock.yaml` diff — zero resolution changes confirmed
Read the full diff line by line:
- A new top-level `catalogs: default: {...}` block appears, one entry per catalogued dependency, each with the same
  `specifier` as before and a `version:` matching what was already resolved for that dependency everywhere in the repo.
- Every touched importer entry changes only `specifier: ^x.y.z` → `specifier: 'catalog:'`; every `version:` line
  (the actual resolved/installed version) is byte-identical to before.
- The only other line changed anywhere in the lockfile: a new `deprecated: prom-client has been replaced by
  @prometheus-io/client` annotation on the `prom-client@15.1.3` package block — this is npm registry metadata pnpm
  picked up on re-resolve, not a version or resolution change (prom-client itself stays pinned at 15.1.3 everywhere).

So: no dependency's resolved/installed version changed, as required.

### `pnpm turbo run format lint type-check build test --filter=jobnik-manager --filter=@map-colonies/jobnik-sdk --filter=jobnik-openapi --filter=jobnik-e2e`
Result: **17 successful, 17 total** (0 failed). Some tasks were no-ops for workspaces that don't define them
(e.g. `jobnik-openapi` has no `test` script, `e2e` has no `build`/`test` scripts — it uses `e2e` instead), which
turbo silently skips rather than failing on.

Workspace names used (confirmed via `pnpm -r list --depth -1`): `jobnik-manager`, `@map-colonies/jobnik-sdk`,
`jobnik-openapi`, `jobnik-e2e`.

## Commit
`git add apps/jobnik-manager/package.json e2e/package.json packages/jobnik-openapi/package.json
packages/jobnik-sdk/package.json pnpm-lock.yaml pnpm-workspace.yaml` (6 files — `.scratch/` left untracked/unstaged,
not part of this PR diff).

Commit: `chore(deps): introduce a flat pnpm dependency catalog` (scope `deps`, per commitlint's
`@map-colonies/commitlint-config` extra scopes). Husky's `commit-msg`/pre-commit hooks (knip check) passed.

## Surprises
- None beyond the ones noted above (root package.json scope question, prom-client's two ranges, the deprecated-package
  metadata line). No dependency actually needed a version change — this ticket really was pure mechanics as advertised.
