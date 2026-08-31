# 05: Build the manager image from a pruned workspace

**What to build:** The manager's container image is built from a pruned workspace with a cached dependency store, so builds are faster and the image contains only what the service needs. The deployed image behaves exactly as it does today, including running database migrations.

Follow the reference monorepo's backend image, minus its policy-engine download: prune the workspace to the manager, install from a cached store, build, then deploy production dependencies only.

Every database-tooling quirk is preserved verbatim, including the step whose only apparent purpose is to pull the migration command-line tool into the runtime image. That is not cosmetic — the e2e composition runs migrations through it. The existing runtime base image is kept, because the generated database client already targets its libc.

The image is the artifact, so the test is running it.

**Blocked by:** 04 (make the specification exist exactly once).

**Branch:** `migration/05-container-image`, layer 5 of 13, based on `migration/04-openapi-package`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [ ] The image builds from a clean checkout of the monorepo, installing only what the manager needs.
- [ ] The migration command runs successfully inside the built image against a throwaway database.
- [ ] The container starts and reports liveness, with the same entrypoint and memory settings as today.
- [ ] Only production dependencies are present in the runtime layer.
- [ ] The runtime base image is unchanged, and the migration command-line tool is present in it.
- [ ] The specification the manager resolves through the module system is present in the image.
- [ ] The manager declares which image definition builds it, so a build matrix can find it without anything hardcoded.
- [ ] Rebuilding with no source change reuses the cached dependency store.
- [ ] The work sits on `migration/05-container-image` as layer 5 of the stack, its pull request is based on `migration/04-openapi-package`, and that pull request's own diff contains nothing from the layers below it.
