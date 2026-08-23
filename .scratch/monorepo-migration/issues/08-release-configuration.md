# 08: Configure two version lines

**What to build:** A deployment is described by a single number, and the SDK is not dragged along by it.

The manager, the specification package and the repository root move together under one version line. The SDK keeps its own, because it is past 1.0 with external consumers: sharing a line would ship it releases containing no SDK changes and force its consumers through a major for a change to a service they do not use.

Neither source repository used component-scoped tags, so a fresh repository has no tags to read. Every component's version is seeded by hand at its current value, so the new repository does not restart versioning from zero.

Changelog sections reflect the commit types the team already uses, so release notes stay readable. Commit scopes are validated against the actual workspace names, with the release and dependency scopes allowed explicitly, so changelog entries land under the right component.

**Blocked by:** 07 (publish the chart under the product name).

**Branch:** `migration/08-release-config`, layer 8 of 13, based on `migration/07-umbrella-chart`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [ ] The manager, the specification package and the repository root share one version; the SDK has its own line and its own tag.
- [ ] Every component's version is seeded at its current value; nothing starts at zero.
- [ ] A release run bumps the chart versions and the specification's declared version along with the code.
- [ ] A commit whose scope is not a workspace name is rejected; workspace scopes plus the release and dependency scopes are accepted.
- [ ] Changelog sections match the commit types the team uses, with the noise-only types hidden.
- [ ] A dry run produces one release pull request for the shared line and a separate one for the SDK.
- [ ] The work sits on `migration/08-release-config` as layer 8 of the stack, its pull request is based on `migration/07-umbrella-chart`, and that pull request's own diff contains nothing from the layers below it.
