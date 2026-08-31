# 10: Publish the SDK from its own tag, validated

**What to build:** Publishing is a consequence of releasing rather than a manual step: pushing the SDK's own tag publishes it. A package that would break consumers cannot be published, because packaging and type resolution are validated first — this is the only published package in the repository.

The installed package stays self-contained: nothing in it points at the specification package, which is private and was never published, and the specification it parses at runtime ships inside it.

Package metadata points at the repository that now holds the source, so the links on the registry page work.

**Blocked by:** 08 (configure two version lines).

**Branch:** `migration/10-sdk-publish`, layer 10 of 13, based on `migration/09-delivery-pipeline`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [ ] Pushing the SDK's tag publishes it; pushing the shared line's tag does not.
- [ ] Packaging and type-resolution validation runs before publish and fails the job on a problem.
- [ ] A dry-run pack contains the build output and the specification file, and declares no dependency on an unpublished package.
- [ ] Repository, homepage and issue links point at this repository.
- [ ] The validation is reachable as a task through the single entry point, so it can be run before tagging.
- [ ] The work sits on `migration/10-sdk-publish` as layer 10 of the stack, its pull request is based on `migration/09-delivery-pipeline`, and that pull request's own diff contains nothing from the layers below it.
