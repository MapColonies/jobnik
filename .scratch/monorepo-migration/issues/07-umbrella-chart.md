# 07: Publish the chart under the product name

**What to build:** The published chart becomes the product name, so it has somewhere to grow when a second deployable component arrives, with the manager as a conditioned subchart. No Kubernetes object changes its name, so the first deployment after the migration is an ordinary rolling update.

The subchart keeps its current name. This is the critical detail: the manager's deployment selector is built from the chart name, and deployment selectors are immutable, so renaming the subchart would delete and recreate the running workload. Renaming only the umbrella leaves every selector untouched.

The database secret stays in the subchart until a second component needs it.

The values live in the deployment-configuration repository, so a matching change there lands with this ticket and with ticket 09: the chart reference and its pinned versions, and the manager's values nested under a parent key to match the umbrella, including the name override that keeps object names stable. The image reference is unchanged.

Verification is a one-time migration check — a recorded comparison against the pre-migration render — not a permanent job. The recurring protection is chart linting, carried over in ticket 03.

**Blocked by:** 02 (move the three projects in as workspaces).

**Branch:** `migration/07-umbrella-chart`, layer 7 of 13, based on `migration/06-e2e-gate`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [x] Chart dependencies build and the chart lints.
- [x] The rendered umbrella — manager values nested, name override applied — diffed against the pre-migration render shows no difference beyond chart metadata, and the comparison is recorded in this ticket.
- [x] The manager's deployment selector is byte-identical to the pre-migration one, and no object changes name.
- [x] The subchart keeps the manager's current name; only the umbrella is named for the product.
- [x] The database secret still lives in the subchart.
- [x] The manager is a conditioned subchart, so it can be disabled independently once a second component exists.
- [x] The corresponding deployment-configuration change is prepared and referenced from this ticket, ready to land alongside ticket 09.
- [x] The work sits on `migration/07-umbrella-chart` as layer 7 of the stack, its pull request is based on `migration/06-e2e-gate`, and that pull request's own diff contains nothing from the layers below it.

## Comments

### Structure

A new `helm/` umbrella chart (`apiVersion: v2`, `type: application`,
seeded at `0.2.1` to match the shared version line the manager is already
on). It depends on the manager chart through a `file://../apps/jobnik-manager/helm`
repository reference rather than physically nesting/moving it — the
subchart's directory, name and template contents are untouched (see the
lockfile note below for the one exception). The dependency carries
`condition: jobnik-manager.enabled`, reusing the `enabled` flag the manager
chart already exposes in its own `values.yaml` (the same flag its
`deployment.yaml` already guards on), so no new toggle was invented. `helm
template jobnik-manager helm --set jobnik-manager.enabled=false`
renders nothing, confirming the subchart is independently disableable.

The umbrella's own `values.yaml` sets only `jobnik-manager.enabled: true` —
everything else the manager needs comes from the subchart's own bundled
defaults, which Helm applies automatically for an unset key. Nothing in the
manager chart's templates, values or `Chart.yaml` changed.

The manager chart has no `Secret` template today — `dbConfig.secretName`/
`useExternalSecret` reference one that's provisioned outside this repo. The
umbrella adds no templates of its own, so there is nothing here that could
have moved the database secret out of the subchart.

### Verification: rendered diff against the pre-migration render

Rendered both charts with the same release name (`jobnik-manager`) so any
difference is attributable only to the umbrella wrapping, not to a release
name change:

```sh
helm template jobnik-manager apps/jobnik-manager/helm   > before.yaml   # pre-migration: standalone chart
helm template jobnik-manager helm                       > after.yaml    # post-migration: umbrella + subchart
diff <(sed 's#Source: jobnik-manager/#Source: CHART/#'          before.yaml) \
     <(sed 's#Source: jobnik/charts/jobnik-manager/#Source: CHART/#' after.yaml)
```

Result: **no differences** once the `# Source:` comment path is normalized
(it changes from `jobnik-manager/templates/...` to
`jobnik/charts/jobnik-manager/templates/...` purely because Helm renders
that comment from the chart's on-disk template path, which now includes the
umbrella — chart metadata, not a rendered object). Every Kubernetes object,
including the Deployment's `metadata.name` and `spec.selector.matchLabels`,
is byte-identical, and no object's name changed. The `helm.sh/chart` label
also stayed `jobnik-manager-0.2.1` in both renders, because the label helper
reads `.Chart.Name`/`.Chart.Version`, which for a subchart's own templates
resolve to the subchart's `Chart.yaml`, not the umbrella's.

Both charts lint clean:

```
$ helm lint apps/jobnik-manager/helm
1 chart(s) linted, 0 chart(s) failed
$ helm lint helm --with-subcharts
2 chart(s) linted, 0 chart(s) failed
```

### A pre-existing bug this ticket had to fix to render anything

`apps/jobnik-manager/helm/Chart.lock` recorded `mclabels` at `1.0.1` while
`Chart.yaml` had already moved to `1.1.0` — present since the files were
carried over in the workspace-move commit, unrelated to this migration.
`helm dependency build` refuses to run at all while the lock and the
declared dependency disagree ("the lock file is out of sync with the
dependencies file"), which blocked rendering _anything_ from the manager
chart, before or after this ticket's change — so "chart dependencies build"
above could not be satisfied without it. Fixed as its own commit
(`fix(jobnik-manager): regenerate the helm chart's stale dependency lock`),
kept separate from the umbrella addition: a lockfile regeneration, not a
version bump (`Chart.yaml` is untouched).

### Deployment-configuration

This repository doesn't contain the deployment-configuration repository, so
the corresponding change is prepared as
[`../07-deployment-configuration-change.md`](../07-deployment-configuration-change.md),
alongside this migration's spec rather than as another numbered ticket,
since it's supporting material for this one, not a ticket of its own: the
chart reference and pinned version move from the subchart to the umbrella,
existing values nest under a `jobnik-manager:` key, and a `fullnameOverride`
keeps object names stable. That file also flags the one fact it can't supply
from inside this repo — each environment's current live fullname — for
whoever lands it alongside ticket 09.
