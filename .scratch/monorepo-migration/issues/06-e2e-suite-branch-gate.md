# 06: Make the e2e suite a gate on unreleased code

**What to build:** A developer learns about a broken interaction before release rather than after. The suite runs against their branch: it builds the manager image from the checkout using the same definition that ships to production, and it exercises the SDK resolved from the workspace, so it can never silently test a stale published version again.

The cross-repository composite action is replaced by a local one. All the machinery that exists purely because the repositories were separate goes away: no checking out other repositories into subdirectories, no packing the SDK, no resolving versions from outside the checkout. Note that the old action checks out the other two repositories at their default branch (or a passed commit) — there is no release-tag resolution to remove; the staleness came from the suite's published-version dependency pin, which ticket 02 replaced.

Both composition services that build the manager — the service itself and the migration runner — switch to the pruned build.

The composition file stays inside the e2e workspace and must never move to the repository root: the manager's integration tests start a database by asking the container tool to resolve a composition file from a directory that has none, relying on the upward search finding the manager's own. A file at the root would capture that search.

**Blocked by:** 05 (build the manager image from a pruned workspace).

**Branch:** `migration/06-e2e-gate`, layer 6 of 13, based on `migration/05-container-image`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [ ] The suite runs in continuous integration against an image built from the pull request's checkout, by the same definition that ships to production.
- [ ] The SDK under test is the workspace SDK. No published version is installed and nothing is packed.
- [ ] No other repository is checked out.
- [ ] Both manager-building composition services use the pruned build.
- [ ] The suite is triggered by a change to any workspace it depends on, and is not scheduled.
- [ ] The composition file is still inside the e2e workspace, and the manager's integration tests are unaffected.
- [ ] The suite is reachable as a task through the single entry point, locally as well as in continuous integration.
- [ ] The work sits on `migration/06-e2e-gate` as layer 6 of the stack, its pull request is based on `migration/05-container-image`, and that pull request's own diff contains nothing from the layers below it.
