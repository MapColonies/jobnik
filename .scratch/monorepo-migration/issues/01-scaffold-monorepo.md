# 01: Scaffold the monorepo

**What to build:** A clone of this repository installs and verifies itself with one command, before any product code exists. Clean clone, one install, then a single entry point that lints, formats, type-checks, builds and tests the whole workspace — all green, because there is nothing in it yet to check. One Node version is declared and nothing in the repository contradicts it. A malformed commit message is rejected locally.

This is the seam every later ticket hangs off: every check in this stack is a turbo task reached through this one entry point, locally and in continuous integration alike.

**Blocked by:** None (can start immediately).

**Branch:** `migration/01-scaffold`, layer 1 of 13, based on `master`, the trunk. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [ ] Install succeeds on a clean clone, and the repository accepts only pnpm as its package manager.
- [ ] The task vocabulary the rest of the stack depends on exists and is a no-op: build, container build, lint, lint fix, format, type-check, test, e2e, specification lint, package validation, unused-code detection.
- [ ] Task names are the ones carried over from the source repositories, plus type-check and e2e, which the reference monorepo lacks.
- [ ] Turbo drives every task, and every task is invoked through the single root entry point rather than beside it.
- [ ] Exactly one Node version is declared for the repository and the engine requirement agrees with it. The reference monorepo contradicts itself here — do not inherit that.
- [ ] Commit tooling rejects a message with no conventional type; formatting and editor configuration apply repository-wide.
- [ ] Specification-linting configuration sits at the root, ready for the specification package to point at.
- [ ] No dependency catalog is introduced. A catalog holds one version per entry and the workspaces currently disagree on several; it arrives with the version-alignment work so that adding an entry and aligning a version are the same change.
- [ ] The work sits on `migration/01-scaffold` as layer 1 of the stack, its pull request is based on `master`, the trunk, and that pull request's own diff contains nothing from the layers below it.
