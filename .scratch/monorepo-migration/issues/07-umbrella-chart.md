# 07: Publish the chart under the product name

**What to build:** The published chart becomes the product name, so it has somewhere to grow when a second deployable component arrives, with the manager as a conditioned subchart. No Kubernetes object changes its name, so the first deployment after the migration is an ordinary rolling update.

The subchart keeps its current name. This is the critical detail: the manager's deployment selector is built from the chart name, and deployment selectors are immutable, so renaming the subchart would delete and recreate the running workload. Renaming only the umbrella leaves every selector untouched.

The database secret stays in the subchart until a second component needs it.

The values live in the deployment-configuration repository, so a matching change there lands with this ticket and with ticket 09: the chart reference and its pinned versions, and the manager's values nested under a parent key to match the umbrella, including the name override that keeps object names stable. The image reference is unchanged.

Verification is a one-time migration check — a recorded comparison against the pre-migration render — not a permanent job. The recurring protection is chart linting, carried over in ticket 03.

**Blocked by:** 02 (move the three projects in as workspaces).

**Branch:** `migration/07-umbrella-chart`, layer 7 of 13, based on `migration/06-e2e-gate`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [ ] Chart dependencies build and the chart lints.
- [ ] The rendered umbrella — manager values nested, name override applied — diffed against the pre-migration render shows no difference beyond chart metadata, and the comparison is recorded in this ticket.
- [ ] The manager's deployment selector is byte-identical to the pre-migration one, and no object changes name.
- [ ] The subchart keeps the manager's current name; only the umbrella is named for the product.
- [ ] The database secret still lives in the subchart.
- [ ] The manager is a conditioned subchart, so it can be disabled independently once a second component exists.
- [ ] The corresponding deployment-configuration change is prepared and referenced from this ticket, ready to land alongside ticket 09.
- [ ] The work sits on `migration/07-umbrella-chart` as layer 7 of the stack, its pull request is based on `migration/06-e2e-gate`, and that pull request's own diff contains nothing from the layers below it.
