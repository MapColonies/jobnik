# 09: Keep delivery working, driven by a generated matrix

**What to build:** Releases stay as automated as they are today, with only the container build step replaced. The existing pipeline's branch and prerelease tracks and the job that opens deployment-configuration pull requests are kept exactly as they stand — the reference monorepo has no equivalent of that automation, so adopting its pipeline wholesale would be a regression. These pull requests are a merge of the two pipelines, not a copy of either.

The container build becomes a generated matrix over the deployed applications. That is what makes the image name, the chart name and the deployment-configuration target all resolve correctly with nothing hardcoded: the image name comes from the manager's package name, which ticket 02 kept unchanged. Adding a second deployable service then requires no pipeline change.

The chart pushed is now the umbrella. The deployment-configuration change prepared in ticket 07 lands together with this ticket.

**Blocked by:** 05 (build the manager image from a pruned workspace), 08 (configure two version lines).

**Branch:** `migration/09-delivery-pipeline`, layer 9 of 13, based on `migration/08-release-config`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [ ] The image is pushed under its current name, with the same tag scheme, for every track: branch push, prerelease release and stable release.
- [ ] The chart is pushed under the product name at the released version.
- [ ] The deployment-configuration pull request is still opened per track with the same labels and target paths, and the stable-release housekeeping that syncs the other environments still runs.
- [ ] The dormant prerelease and branch-based paths are carried over as they are, not finished and not removed.
- [ ] Adding another deployable application to the matrix requires no change to the pipeline.
- [ ] Nothing in the pipeline hardcodes the image name, the chart name or the deployment-configuration target.
- [ ] The deployment-configuration change lands with this ticket, and the first deployment afterwards is an ordinary rolling update rather than a delete and recreate.
- [ ] The work sits on `migration/09-delivery-pipeline` as layer 9 of the stack, its pull request is based on `migration/08-release-config`, and that pull request's own diff contains nothing from the layers below it.
