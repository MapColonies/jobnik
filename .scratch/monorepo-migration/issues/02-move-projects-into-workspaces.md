# 02: Move the three projects in as workspaces

**What to build:** All three Jobnik projects live in this repository and are verified from here. The manager is an application; the SDK is a package; the e2e suite is its own top-level workspace and deliberately **not** an application, so that "application" can mean "deployed service" without exception — the container build matrix relies on that.

Package names are unchanged from the source repositories. This is load-bearing rather than cosmetic: the build matrix later derives the image name from the manager's package name, so keeping the name keeps the image name for free.

Dependency versions are not touched. The workspaces disagree on several today; aligning them is separate work, and keeping it out is what makes this stack reviewable.

**Precondition (human):** the three source repositories are frozen before anything is imported, and the imported commit of each is recorded in this ticket. The e2e suite is the fastest-moving of the three, which is why the freeze must precede the move rather than follow it.

**Blocked by:** 01 (scaffold the monorepo).

**Branch:** `migration/02-move-workspaces`, layer 2 of 13, based on `migration/01-scaffold`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [ ] The three source repositories are frozen, and the commit imported from each is recorded in this ticket.
- [ ] Manager, SDK and e2e suite each install from this repository and run their own lint, type-check and tests through the single entry point.
- [ ] One lockfile for the whole repository; no per-project lockfiles remain.
- [ ] Package names are identical to the source repositories.
- [ ] The e2e suite resolves the SDK through the workspace. Its published-version pin is gone — it was a major behind what the SDK actually ships, so the suite has been testing stale code.
- [ ] The manager's integration tests provision their own database exactly as they do now, unchanged. Their compose file stays inside the manager's workspace and there is **no** compose file at the repository root: the container tool's upward search from the manager's test directory is what makes those tests work, and a file at the root would capture it.
- [ ] No dependency version changed as part of the move.
- [ ] The e2e workspace is not an application.
- [ ] The work sits on `migration/02-move-workspaces` as layer 2 of the stack, its pull request is based on `migration/01-scaffold`, and that pull request's own diff contains nothing from the layers below it.
