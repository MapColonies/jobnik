# 12: Lint and format the e2e suite for the first time

**What to build:** One command lints, formats, type-checks and tests everything, with no workspace exempt. The e2e suite has never been linted or formatted and uses a quote style contrary to the shared configuration, so the mechanical reformat is enormous.

The reformat is separated from the lint fixes so neither buries the other: one commit is formatting only, a second carries the lint fixes. The suite's dependency versions are not aligned here — that is out of scope for this stack.

**Blocked by:** 06 (make the e2e suite a gate on unreleased code) — the machinery changes touch the same files, so reformatting after them avoids a pointless conflict.

**Branch:** `migration/12-e2e-lint`, layer 12 of 13, based on `migration/11-knip`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [ ] The e2e workspace is covered by the same lint and format tasks as every other workspace, and both pass.
- [ ] The formatting commit contains no behavioural change, reproducible by rerunning the formatter against its parent commit.
- [ ] The lint fixes are in a commit of their own, separate from the reformat.
- [ ] The e2e suite still passes after both commits.
- [ ] No dependency version changed.
- [ ] The work sits on `migration/12-e2e-lint` as layer 12 of the stack, its pull request is based on `migration/11-knip`, and that pull request's own diff contains nothing from the layers below it.
