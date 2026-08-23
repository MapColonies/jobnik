# 13: Leave one repository a newcomer can pick up

**What to build:** A developer new to Jobnik clones one repository, runs one install command, and can build and test the whole product on their first day. Dependency updates arrive as one stream instead of three. Generated documentation covers the SDK only — the manager's public interface is its specification, not its source.

Leftovers from three separate repositories are gone, including the service-catalog descriptors, which are not carried over.

Once the stack has landed, the three source repositories are archived, each pointing here.

**Blocked by:** 01 through 12 (the whole stack).

**Branch:** `migration/13-housekeeping`, layer 13 of 13, based on `migration/12-e2e-lint`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [ ] From a fresh clone, one install and one command lint, format, type-check, build and test everything.
- [ ] The README describes the workspace layout and that single command.
- [ ] One dependency-update configuration covers the repository.
- [ ] Documentation generation covers the SDK only.
- [ ] Service-catalog descriptors and other per-repository leftovers are removed.
- [ ] The three source repositories are archived, each pointing at this one. (Human step.)
- [ ] The deliberately excluded follow-up work is filed rather than forgotten: dependency version alignment with the catalog it introduces, the Grafana dashboards, the prerelease and branch-based release flow, moving the database secret to the umbrella, unifying how the manager's integration tests and the e2e suite provision databases.
- [ ] The work sits on `migration/13-housekeeping` as layer 13 of the stack, its pull request is based on `migration/12-e2e-lint`, and that pull request's own diff contains nothing from the layers below it.
