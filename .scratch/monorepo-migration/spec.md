# Consolidate the three Jobnik repos into this monorepo

Status: ready-for-agent

## Problem Statement

Jobnik is one product split across three repositories — the manager service, the published
SDK, and the end-to-end suite. Every change that crosses a boundary costs a developer
several coordinated pull requests, and one boundary is duplicated outright: the OpenAPI
specification exists as two byte-identical files, one in the manager and one in the SDK,
kept in step by hand. They are identical today only because someone remembered twice in a
row.

The consequences developers live with:

- A spec change means editing two files in two repositories, releasing the SDK, then
  bumping it downstream. Nothing detects a half-applied change.
- The e2e suite cannot be run against unreleased code. To test a branch it resolves the
  latest published release tags from the GitHub API, checks out both other repositories
  into subdirectories, and packs the SDK — machinery that exists purely because the repos
  are separate. It has also been pinned a full major version behind the shipped SDK, so it
  has been testing stale code.
- Tooling has drifted apart. Three different eslint majors, two vitest majors, three
  different pinned Node versions, and one repository (e2e) with no lint, format, commit or
  license tooling at all.
- The manager's container image is built by installing dependencies from scratch with no
  workspace pruning or build caching.

## Solution

One repository containing all three projects as pnpm workspaces, orchestrated by turbo,
following the structure already proven in the `opa-la` monorepo.

The specification moves into a single private workspace package that both the manager and
the SDK consume, with a continuous-integration check that regenerates every derived
artifact and fails if the result differs from what is committed — making a half-applied
spec change impossible rather than merely unlikely.

The e2e suite resolves the SDK through the workspace, so it becomes a gate on unreleased
code instead of a smoke test of what already shipped.

The SDK keeps publishing to npm on its own version line, because it is past 1.0 and has
external consumers.

Delivered as a stack of small pull requests that land together, so each is reviewable on
its own. Dependency version alignment is deliberately excluded and follows as separate
work.

## User Stories

1. As a backend developer, I want the OpenAPI specification to exist exactly once, so that
   I cannot change one copy and forget the other.
2. As a backend developer, I want a continuous-integration check that regenerates every
   artifact derived from the specification and fails on any difference, so that a
   half-applied specification change cannot reach the default branch.
3. As a backend developer, I want to change the specification, the manager and the SDK in a
   single pull request, so that a cross-boundary change is reviewed as one unit.
4. As a backend developer, I want the e2e suite to run against my branch, so that I learn
   about a broken interaction before release rather than after.
5. As a backend developer, I want the e2e suite to resolve the SDK from the workspace, so
   that it can never silently test a stale published version again.
6. As a backend developer, I want one command that lints, formats, type-checks and tests
   everything I touched, so that I do not have to remember three separate toolchains.
7. As a backend developer, I want turbo to skip work whose inputs have not changed, so that
   local verification is fast enough to run habitually.
8. As a backend developer, I want turbo to know that the generated database client is a
   build output, so that a cache hit never leaves me with a tree that fails to type-check.
9. As a backend developer, I want the manager's integration tests to keep provisioning
   their own database exactly as they do now, so that the migration does not change how I
   run tests locally.
10. As a backend developer, I want branded identifier types to keep working in the SDK, so
    that job, stage and task identifiers stay impossible to confuse.
11. As a backend developer, I want commit scopes to be validated against the actual
    workspace names, so that changelog entries land under the right component.
12. As a developer new to Jobnik, I want one repository to clone and one install command,
    so that I can build and test the whole product on my first day.
13. As a developer new to Jobnik, I want a single pinned Node version, so that I do not
    have to guess which of several conflicting declarations is authoritative.
14. As a code reviewer, I want the migration split into small pull requests with a stated
    verification for each, so that I can review structure separately from behaviour.
15. As a code reviewer, I want dependency upgrades kept out of the migration, so that I can
    tell a migration mistake from an upgrade regression.
16. As a code reviewer, I want the e2e suite's first-ever reformat isolated in its own pull
    request with the reformat separated from the lint fixes, so that neither buries the
    other.
17. As an SDK consumer, I want the package to keep its own version line, so that I do not
    receive releases containing no SDK changes and am not forced through a major for a
    change to a service I do not use.
18. As an SDK consumer, I want the installed package to remain self-contained, so that
    nothing in it points at a package that was never published.
19. As an SDK consumer, I want the package validated for correct packaging and type
    resolution before it is published, so that a broken release does not reach me.
20. As an SDK consumer, I want the package metadata to point at the repository that now
    holds the source, so that the links on the registry page work.
21. As a platform engineer, I want the container image built from a pruned workspace with a
    cached dependency store, so that builds are faster and images contain only what the
    service needs.
22. As a platform engineer, I want the deployed image to keep working exactly as it does
    now, including running database migrations, so that the migration carries no runtime
    risk.
23. As a platform engineer, I want no Kubernetes object to change its name, so that the
    first deployment after the migration is an ordinary rolling update.
24. As a platform engineer, I want the container image to keep its current name, so that
    existing tags and version history stay meaningful.
25. As a platform engineer, I want the published chart to become the product name, so that
    it has somewhere to grow when a second deployable component arrives.
26. As a platform engineer, I want the render of the chart verified against the
    pre-migration render, so that a values restructure cannot silently change what is
    deployed.
27. As a platform engineer, I want the existing pipeline that opens deployment-configuration
    pull requests to keep working unchanged, so that releases stay as automated as they are
    today.
28. As a platform engineer, I want the container build driven by a generated matrix, so that
    adding a second deployable service requires no pipeline change.
29. As a release manager, I want each component's version seeded explicitly, so that the new
    repository does not restart versioning from zero.
30. As a release manager, I want the manager, the specification package and the repository
    root to share one version, so that a deployment is described by a single number.
31. As a release manager, I want the SDK published automatically when its own tag is pushed,
    so that publishing stays a consequence of releasing rather than a manual step.
32. As a release manager, I want changelog sections to reflect the commit types the team
    already uses, so that release notes stay readable.
33. As a maintainer, I want unused files, exports and dependencies reported automatically,
    so that consolidating three repositories does not quietly accumulate dead weight.
34. As a maintainer, I want one dependency-update configuration, so that I review one
    stream of upgrade pull requests instead of three.
35. As a maintainer, I want the old repositories frozen before the move begins, so that no
    change has to be reconciled twice.
36. As an autonomous agent picking up this work, I want each pull request to carry an
    explicit completion condition, so that I can tell whether I am finished without asking.

## Implementation Decisions

### Repository and history

A new repository, already created. Clean history — no subtree merge of the three source
repositories. `jobnik-worker-boilerplate` is out of scope; it stays a standalone template.
The three source repositories are frozen before any code moves and archived once the stack
lands.

### Workspace layout

Four workspaces: the manager as an application, the SDK and the specification package as
packages, and the e2e suite as its own top-level workspace. The e2e suite is deliberately
not an application, so that "application" can mean "deployed service" without exception —
the container build matrix relies on that.

Package names are unchanged from the source repositories. This is load-bearing: the build
matrix derives the image name from the manager's package name, so the image keeps its
current name for free.

### Specification ownership

A single private, unscoped workspace package owns the specification, the versioned
specification build, the redocly configuration and the specification lint task. It is
shaped as a real importable module with explicit exports and a generated type declaration,
mirroring the equivalent package in the reference monorepo.

The manager takes it as a runtime dependency, imports its request and response types from
it, and resolves the specification file through the module system rather than through a
copied asset. Its own generated type declaration and generation script are deleted.

The SDK takes it as a development-time dependency only, because the SDK is published and
the specification package is not. The SDK keeps its own generation script: that script
rewrites identifier schemas into branded types, so its output is SDK-specific and cannot be
shared with the manager. Generated output stays committed. The SDK continues to copy the
specification file into its build output, because it parses the specification at runtime and
therefore ships it.

A continuous-integration job reruns both generators and fails if anything differs from what
is committed.

### Build orchestration

turbo drives every task. Task names carried over from the source repositories, plus a
type-check task and an e2e task that the reference monorepo lacks.

The manager's build generates its database client through a pre-script. That generation
writes into the source tree, not the build output, so the build task must declare the
schema among its inputs and the generated client among its outputs. Without that, a cache
hit restores the build output while the generated client is missing, and type-checking and
tests both import from it.

No dependency catalog in this work. A catalog holds one version per entry and the
workspaces currently disagree on several; the catalog arrives with the version-alignment
work so that adding an entry and aligning a version are the same change.

### Container image

The reference monorepo's backend image, minus its policy-engine download: prune the
workspace, install from a cached store, build, then deploy production dependencies only.

Every database-tooling quirk is preserved verbatim, including the step whose only purpose
is to pull the migration command-line tool into the runtime image. That is not cosmetic —
the e2e composition runs migrations through it. The database client already targets the
runtime image's libc, so the existing base image is kept.

### End-to-end suite

The suite runs against an image built from the checkout by the same definition that ships
to production. Its composition file stays inside its own workspace and must never move to
the repository root: the manager's integration tests start a database by asking the
container tool to resolve a composition file from a directory that has none, relying on the
upward search finding the manager's own. A file at the root would capture that search.

Both composition services that build the manager — the service itself and the migration
runner — switch to the pruned build context.

The cross-repository composite action is replaced by a local one. Triggered on any change
to a package the suite depends on; no scheduled run.

### Release and delivery

Two version lines. The manager, the specification package and the repository root move
together under one line. The SDK keeps its own, because it is past 1.0 with external
consumers, and sharing a line would bump it on unrelated changes and force majors on it for
changes elsewhere.

Neither source repository used component-scoped tags, so a fresh repository has no tags to
read: the version manifest is seeded by hand with each component's current version.

The SDK publishes on its own tag. Packaging and type-resolution validation is added to it,
as the only published package here.

The manager's existing delivery pipeline is kept as it stands, including its branch and
prerelease tracks and the job that opens deployment-configuration pull requests. Only the
container build step is replaced, by the reference monorepo's generated matrix. The
reference monorepo has no equivalent of the deployment-configuration automation, so
adopting its pipeline wholesale would be a regression.

### Chart structure

An umbrella chart named for the product, with the manager as a conditioned subchart. The
subchart keeps its current name. This is the critical detail: the manager's deployment
selector is built from the chart name, and deployment selectors are immutable, so renaming
the subchart would delete and recreate the running workload. Renaming only the umbrella
leaves every selector untouched.

The database secret stays in the subchart until a second component needs it.

### Commit conventions

Scopes derived from workspace names and required on every commit, with the release and
dependency scopes allowed explicitly.

### Dropped

The service-catalog descriptors are not carried over. Generated documentation covers the
SDK only — the manager's public interface is its specification, not its source.

## Testing Decisions

A good test here asserts on externally observable behaviour: what the deployed service
renders, what the published package exposes, what the suite observes over HTTP. It does not
assert on internal structure. Concretely, this work is verified by the artifacts it
produces, not by inspecting the configuration that produces them.

### One primary seam

Every check is expressed as a turbo task and invoked through a single entry point. That is
the seam. It already exists in the reference monorepo and is the highest available point:
lint, format, type-check, unit and integration tests, specification lint, specification
drift, unused-code detection, package validation and the e2e suite are all reached the same
way, locally and in continuous integration, with change detection scoping them to what
moved.

No new seam is introduced for the migration itself. Two task names are added — type-check
and e2e — but both hang off the existing seam rather than beside it.

### Reusing existing test suites

The manager's unit and integration projects and the e2e suite are carried over unchanged
and are the regression evidence: if the manager behaves identically before and after, its
existing suites say so. The migration adds no new assertions about the manager's behaviour,
because its behaviour is not meant to change. Its integration project's database
provisioning is preserved as-is rather than unified with the e2e suite's, which is a
separate concern.

### The specification drift check

The one genuinely new test. It reruns both generators and compares against what is
committed. Its prior art is the reference monorepo's packaging validation task: a task
whose assertion is that a regenerated artifact matches the committed one.

### Chart rendering

Verified by diffing the rendered chart against the pre-migration render, expecting no
difference beyond chart metadata. This is a one-time migration check rather than a
recurring test, so it belongs in the chart pull request as a recorded comparison, not as a
permanent job. The recurring protection is chart linting, which the manager already has and
which the reference monorepo's pull-request workflow lacks — so it must be carried over
deliberately.

### The container image

Proven by building it and running the migration command inside it, then by the e2e suite
passing against that image. The image is the artifact, so the test is running it.

## Out of Scope

- **Dependency version alignment.** eslint, vitest, the Node type definitions, the shared
  TypeScript configuration and the logger all disagree across workspaces. Aligning them is
  separate work, one pull request per workspace, introducing the dependency catalog as it
  goes. The SDK's eslint jump spans two majors of the shared configuration and will be a
  large mechanical change; keeping it out is what makes this stack reviewable.
- **Grafana dashboards.** Three dashboard definitions sit unused in the manager. Shipping
  them through the umbrella chart is new functionality, and verifying that panels render
  against live metrics is a different kind of review.
- **The prerelease and branch-based release flow.** Parked on stale branches in the manager
  repository. Its dormant paths are carried over as they are; finishing it is its own
  project.
- **Moving the database secret to the umbrella chart.** When a second component needs it.
- **Migrating the manager off its current database toolkit.** Planned separately, and the
  reason every quirk of the current setup is preserved rather than cleaned up.
- **Unifying how the manager's integration tests and the e2e suite provision databases.**
  They use different container tooling paths and different database versions.
- **The worker boilerplate repository.**

## Further Notes

### Where the reference monorepo is and is not a good guide

It is a good guide for workspace structure, task orchestration, the container build and
unused-code detection. It is a poor guide for release and delivery: the manager's pipeline
is ahead of it, with automation the reference has no equivalent of. Those pull requests are
a merge of the two, not a copy of either. The reference's pull-request workflow is also
missing type-checking, a formatting check and chart linting that the manager has today, and
one of its version pins contradicts its own declared engine requirement — do not inherit
either.

### Facts discovered while planning that the implementer should not have to rediscover

- The two specification files are byte-identical at 2732 lines, hand-maintained across two
  repositories. This is the core justification for the work.
- The SDK parses the specification at runtime and therefore ships it. It cannot simply
  consume generated types.
- The SDK is past 1.0. The e2e suite has been pinned a full major behind it.
- pnpm does run pre-scripts by default; this was verified rather than assumed. The database
  client generation therefore fires — the exposure is turbo's cache, not the package
  manager.
- The manager's delivery pipeline derives the image name, the chart name and the
  deployment-configuration target from the repository name, while the reference monorepo
  derives the image name from the package name. Taking the reference's matrix makes all
  three names resolve correctly with nothing hardcoded.
- The manager's deployment selector is derived from the chart name and is immutable.
- The e2e composition runs migrations inside the manager image via the migration tool, so
  the image must retain it.
- The container tool's upward search for a composition file is what makes the manager's
  integration tests work; a composition file at the repository root would break them.
- The e2e suite has never been linted or formatted and uses a quote style contrary to the
  shared configuration.
- The e2e suite is the fastest-moving of the three, which is why the freeze must precede
  the move.

### External coordination

The deployment-configuration repository needs a change landing with the chart and delivery
pull requests: the chart reference and its pinned versions, and a restructure nesting the
manager's values under a parent key to match the umbrella — including the name override
that keeps Kubernetes object names stable. The image reference is unchanged. Verify with a
rendered-chart comparison.

### Pull request stack

Twelve pull requests, each green on its own and landing together, in this order: scaffold;
move; continuous integration; specification package; container image; e2e in continuous
integration; chart; release configuration; delivery pipeline; unused-code detection; e2e
lint adoption; housekeeping. Each has a stated completion condition; they are intended to
become one ticket file each beside this spec.
