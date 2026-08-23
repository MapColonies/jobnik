# Prepared change for the deployment-configuration repository

Referenced from `issues/07-umbrella-chart.md`. This is supporting material for
that ticket, not a ticket of its own — the deployment-configuration
repository isn't part of this monorepo, so this file is the prepared change,
ready to be applied there and landed alongside ticket 09, not a diff that
was actually pushed.

## What changes

1. **Chart reference and pinned version.** Wherever the environment's release
   currently points at the `jobnik-manager` chart (name + pinned version),
   point it at the `jobnik` umbrella chart instead, pinned to the umbrella's
   released version. The chart repository/registry itself is unchanged — only
   the chart name and version pinned within it move from the subchart to the
   umbrella. The image reference is unchanged; only the chart moves.

2. **Values restructured under a parent key.** Every value that today sits at
   the top level of the environment's values file for this service must move
   one level down, nested under `jobnik-manager:`, to match the umbrella's
   dependency name. For example:

   ```yaml
   # before
   replicaCount: 2
   image:
     repository: jobnik-manager
   dbConfig:
     useExternalSecret: true
     secretName: jobnik-manager-postgres-secret
   # ...every other existing key

   # after
   jobnik-manager:
     replicaCount: 2
     image:
       repository: jobnik-manager
     dbConfig:
       useExternalSecret: true
       secretName: jobnik-manager-postgres-secret
     # ...every other existing key, unchanged, just indented one level
   ```

   Nothing about the values themselves changes — this is a pure re-indent.

3. **Name override, so no Kubernetes object changes name.** Before this
   change, `{{ .Release.Name }}` in the manager's `fullname` helper was the
   release name used when the manager was installed directly. After this
   change, the umbrella is what gets installed, under whatever release name
   the environment already uses for this deployment — which may not match
   the manager's own chart name, and would otherwise produce a different
   `fullname` than before.

   **Action required by whoever lands this:** read the environment's current
   live values (or `helm get values` against the running release) to find
   the fullname the manager currently resolves to, then set it explicitly:

   ```yaml
   jobnik-manager:
     fullnameOverride: <the manager's current resolved fullname, verbatim>
     # ...the rest of the restructured values from step 2
   ```

   This is the one fact this file cannot supply from inside this repository —
   it depends on the live release name in each target environment, which
   this monorepo has no visibility into. Every other part of this change is
   mechanical.

## Verification

Once applied, render the environment's values through the new `jobnik` chart
and confirm:

- The Deployment's `metadata.name` and `spec.selector.matchLabels` are
  byte-identical to a render of the same values through the old
  `jobnik-manager` chart directly.
- No object in the rendered manifest changes name.

This mirrors the in-repo comparison recorded in `issues/07-umbrella-chart.md`,
which proves the restructure itself (umbrella wrapping, values nesting,
condition) introduces no difference — the only remaining variable per
environment is the `fullnameOverride` fact above.
