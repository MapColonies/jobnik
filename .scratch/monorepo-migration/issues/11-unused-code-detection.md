# 11: Report unused files, exports and dependencies

**What to build:** Consolidating three repositories does not quietly accumulate dead weight. Unused files, exports and dependencies are reported automatically on every pull request, across all workspaces.

Known-legitimate exceptions are declared specifically rather than suppressed wholesale: entry points loaded only at runtime, generated output, and binaries invoked from scripts.

**Blocked by:** 04 (make the specification exist exactly once) — that ticket settles the final export and dependency shape, which is what the configuration has to describe.

**Branch:** `migration/11-knip`, layer 11 of 13, based on `migration/10-sdk-publish`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [ ] The report is clean across every workspace on the migrated tree.
- [ ] An unused dependency or an unreferenced export added deliberately is reported.
- [ ] Runtime-only entry points, generated output and script-invoked binaries are declared as such, not blanket-ignored.
- [ ] It runs on pull requests through the single entry point.
- [ ] The work sits on `migration/11-knip` as layer 11 of the stack, its pull request is based on `migration/10-sdk-publish`, and that pull request's own diff contains nothing from the layers below it.
