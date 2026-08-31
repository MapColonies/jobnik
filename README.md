# jobnik

Jobnik is a job management platform: a service that orchestrates multi-stage workflows
with scheduling, priority, retries and state management, a published SDK for talking to
it, and an end-to-end suite that exercises both together. This repository holds all three,
plus the OpenAPI specification they share, as one pnpm workspace orchestrated by turbo.

## Workspace layout

| Path                      | What it is                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/jobnik-manager`     | The manager service — a REST API for jobs, stages and tasks.                                                                                       |
| `packages/jobnik-openapi` | The OpenAPI specification, its versioned build and its generated types. Consumed by both the manager and the SDK, so the spec exists exactly once. |
| `packages/jobnik-sdk`     | `@map-colonies/jobnik-sdk`, published to npm on its own version line.                                                                              |
| `e2e`                     | The end-to-end suite. Runs against a manager image built from this repository's own checkout, so it always tests unreleased code.                  |
| `helm`                    | The umbrella Helm chart, with the manager as a conditioned subchart.                                                                               |

## Getting started

Prerequisites: Node (version pinned in `.nvmrc`) and pnpm (version pinned in
`packageManager` in `package.json`).

```bash
git clone https://github.com/MapColonies/jobnik.git
cd jobnik
pnpm install
pnpm verify
```

`pnpm verify` is the one command that lints, formats, type-checks, builds and tests every
workspace. It's a turbo task, so reruns skip whatever hasn't changed. The e2e suite isn't
part of it — it needs Docker and is run on its own with `pnpm e2e`.

Each workspace also exposes its pieces individually (`pnpm lint`, `pnpm format`,
`pnpm type-check`, `pnpm build`, `pnpm test`, all via turbo), for when you only touched one
part of the product.

## Documentation

Generated API documentation covers the SDK only — the manager's public interface is its
specification (`packages/jobnik-openapi`), not its source. Build it locally with
`pnpm docs`; it's published to GitHub Pages on every push to `master`.

## Dependency updates

One Dependabot configuration (`.github/dependabot.yml`) covers every workspace in this
repository, so upgrades arrive as a single stream of pull requests instead of one per
former repository.
