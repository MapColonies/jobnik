# 09: Keep delivery working, driven by a generated matrix

**What to build:** Releases stay as automated as they are today, with only the container build step replaced. The existing pipeline's branch and prerelease tracks and the job that opens deployment-configuration pull requests are kept exactly as they stand — the reference monorepo has no equivalent of that automation, so adopting its pipeline wholesale would be a regression. These pull requests are a merge of the two pipelines, not a copy of either.

The container build becomes a generated matrix over the deployed applications. That is what makes the image name, the chart name and the deployment-configuration target all resolve correctly with nothing hardcoded: the image name comes from the manager's package name, which ticket 02 kept unchanged. Adding a second deployable service then requires no pipeline change.

The chart pushed is now the umbrella. The deployment-configuration change prepared in ticket 07 lands together with this ticket.

**Blocked by:** 05 (build the manager image from a pruned workspace), 08 (configure two version lines).

**Branch:** `migration/09-delivery-pipeline`, layer 9 of 13, based on `migration/08-release-config`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [x] The image is pushed under its current name, with the same tag scheme, for every track: branch push, prerelease release and stable release.
- [x] The chart is pushed under the product name at the released version.
- [x] The deployment-configuration pull request is still opened per track with the same labels and target paths, and the stable-release housekeeping that syncs the other environments still runs.
- [x] The dormant prerelease and branch-based paths are carried over as they are, not finished and not removed.
- [x] Adding another deployable application to the matrix requires no change to the pipeline.
- [x] Nothing in the pipeline hardcodes the image name, the chart name or the deployment-configuration target.
- [x] The deployment-configuration change lands with this ticket, and the first deployment afterwards is an ordinary rolling update rather than a delete and recreate.
- [x] The work sits on `migration/09-delivery-pipeline` as layer 9 of the stack, its pull request is based on `migration/08-release-config`, and that pull request's own diff contains nothing from the layers below it.

## Comments

### Source of "the existing pipeline"

The manager's own former pipeline (`.github/workflows/build-and-push.yaml` in
the now-frozen `MapColonies/jobnik-manager` repository) was fetched via the
GitHub API to work from — it isn't part of this monorepo's history. It
triggers on push to `next` (dev) and on `release: published` (qa for a
prerelease, prod for a stable release), pushes an image and a chart per
track, opens a PR against `site-values` per track, and on a stable release
additionally syncs `qa` and `integration` to the new tag. That structure is
kept verbatim; only the pieces this migration's spec calls out are adapted:

- **The container build is now a generated matrix.** `scripts/generate-matrix.mjs`
  (ported from the reference monorepo's `opa-la`) reads `turbo ls --filter="./apps/*"`
  and each app's own `package.json` `dockerfile` field — the same field
  ticket 05 already added to `apps/jobnik-manager/package.json` — to build
  `{service, dockerfile}` pairs. The image build job matrixes over that
  output, so the pushed tag is `.../${{ matrix.service }}:<tag>` (the
  package name, "jobnik-manager") instead of the old
  `.../${{ github.event.repository.name }}:<tag>` (which would now resolve
  to "jobnik", the repo/product name — wrong for the image). Adding a second
  deployable app under `apps/*` with its own `dockerfile` field requires no
  change to this workflow or the script.
- **The chart pushed is the umbrella**, `./helm` (ticket 07),
  packaged and pushed as one unit — not matrixed, since there's one product
  chart regardless of how many apps it wraps. `name: ${{ github.event.repository.name }}`
  is unchanged from before and, unlike the image, needs no adaptation: this
  repository is named for the product, so it already resolves to "jobnik".
  The same holds for the `chart:` input to `update-chart-version` in the
  site-values jobs — the deployment-configuration target falls out of the
  repository name for free, exactly as it did before.
- **The release trigger is guarded by tag prefix.** Ticket 08's
  `linked-versions` group makes `jobnik`, `jobnik-manager` and
  `jobnik-openapi` release together at the same version, but each still gets
  its own tag and its own `release` webhook (`jobnik-vX.Y.Z`,
  `jobnik-manager-vX.Y.Z`, `jobnik-openapi-vX.Y.Z`). Without a guard, one
  version bump would run this whole pipeline three times and open three
  redundant site-values PRs. `determine-config` only proceeds past a
  `release` event when the tag matches `jobnik-v*` — the repository-root
  component, chosen because it's the one that literally means "a deployment
  is described by a single number" (ticket 08), so it's the natural trigger
  regardless of how many deployable apps eventually share that line. The
  matched tag's `jobnik-` prefix is then stripped before it's used as the
  image/chart tag, so the tag scheme downstream is unchanged from before
  this repository had more than one released component.

### A fix made in passing

`actionlint` flagged the carried-over "skip bot commits" step for using
`github.event.head_commit.message` directly inside the shell script — an
untrusted value that could smuggle shell metacharacters into the run block.
Moved it into an `env:` var instead, which is behaviorally identical but
closes the injection. Everything else in that dormant push-to-`next` path is
untouched.

### Deployment-configuration

No repository-internal change was needed here beyond what ticket 07 already
prepared in `../07-deployment-configuration-change.md`: the image reference
in that external repo is untouched by this ticket (only the chart reference
moves, which ticket 07's prepared change already covers), and the chart's
own name resolving to the repository name (see above) means the "chart"
input this pipeline sends to `update-chart-version` already matches what
that prepared change expects. Landing it alongside this ticket, and
supplying the one missing fact (each environment's live `fullnameOverride`),
remains for whoever applies it in that repository.
