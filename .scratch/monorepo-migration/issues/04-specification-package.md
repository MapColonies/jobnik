# 04: Make the specification exist exactly once

**What to build:** The OpenAPI specification exists in one place, and a half-applied change to it cannot reach the default branch.

A single private, unscoped workspace package owns the specification, its versioned build, its lint task and its generated type declaration, shaped as a real importable module with explicit exports.

The manager takes it as a runtime dependency, imports its request and response types from it, and resolves the specification file through the module system rather than through a copied asset. The manager's own generated type declaration and generation script are deleted.

The SDK takes it as a development-time dependency only, because the SDK is published and this package is not. The SDK keeps its own generation script: that script rewrites the job, stage and task identifier schemas into branded types, so its output is SDK-specific and cannot be shared with the manager. Its generated output stays committed. The SDK continues to copy the specification into its build output, because it parses the specification at runtime and therefore ships it.

A continuous-integration job reruns both generators and fails if anything differs from what is committed. This is the one genuinely new test in the migration.

**Blocked by:** 03 (verify every pull request through one workflow).

**Branch:** `migration/04-openapi-package`, layer 4 of 13, based on `migration/03-pull-request-ci`. Stack conventions: `../stack.md`.

**Status:** ready-for-agent

- [ ] Exactly one copy of the specification exists in the repository. Before this ticket there were two, byte-identical at 2732 lines, hand-maintained across two repositories.
- [ ] The manager serves and validates against the specification resolved through the package, not through a copied file, and its own generated declaration and generation script are gone.
- [ ] The SDK's build output still contains the specification file, and the SDK still parses it at runtime.
- [ ] Job, stage and task identifiers are still branded in the SDK's generated types, so they stay impossible to confuse.
- [ ] Editing a schema without regenerating fails continuous integration; regenerating makes it pass.
- [ ] Specification linting runs from the package.
- [ ] The specification, the manager and the SDK can be changed in a single pull request and reviewed as one unit.
- [ ] The manager's and the SDK's existing suites pass unchanged.
- [ ] The work sits on `migration/04-openapi-package` as layer 4 of the stack, its pull request is based on `migration/03-pull-request-ci`, and that pull request's own diff contains nothing from the layers below it.
