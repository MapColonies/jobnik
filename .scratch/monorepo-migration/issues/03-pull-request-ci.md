# 03: Verify every pull request through one workflow

**What to build:** A developer opening a pull request gets everything they touched linted, formatted, type-checked and tested, and nothing they did not touch. One workflow, reaching every check through the single entry point, with change detection scoping the work to what actually moved so that verification is fast enough to trust.

The reference monorepo's pull-request workflow is missing type-checking, a formatting check and chart linting that the manager has today. Those are carried over deliberately rather than inherited away.

**Blocked by:** 02 (move the three projects in as workspaces).

**Branch:** `migration/03-pull-request-ci`, layer 3 of 13, based on `migration/02-move-workspaces`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [ ] A pull request touching only the SDK does not run the manager's tasks.
- [ ] Lint, formatting check, type-check, unit tests, integration tests, specification lint and chart lint all run.
- [ ] Type-checking, the formatting check and chart linting are present — all three are absent from the reference monorepo's workflow.
- [ ] The manager's coverage reporting is preserved.
- [ ] Change detection compares against the pull request's base branch, and the build cache is shared between runs.
- [ ] A deliberately introduced lint error, type error and failing test each fail the run.
- [ ] Node is set up from the repository's single declared version, not from a version pinned in the workflow.
- [ ] The work sits on `migration/03-pull-request-ci` as layer 3 of the stack, its pull request is based on `migration/02-move-workspaces`, and that pull request's own diff contains nothing from the layers below it.
