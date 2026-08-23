# jobnik-openapi

Owns the Jobnik OpenAPI specification exactly once: the hand-authored versioned source
(`openapi_v1.yaml`), the build that merges it into the single served specification
(`openapi3.yaml`), the specification's lint task, and the generated request/response types
(`src/openapi.d.ts`).

Private and unscoped — this package is consumed only from within this workspace, never
published.

## Consumers

- **The manager** (`jobnik-manager`) takes this as a runtime dependency. It imports request
  and response types from it and resolves the specification file through the module system
  (`openapiFilePath`) instead of keeping its own copy.
- **The SDK** (`@map-colonies/jobnik-sdk`) takes this as a development-time dependency only,
  because the SDK is published and this package is not. The SDK keeps its own generation
  script, which rewrites identifier schemas into SDK-specific branded types, and continues to
  ship a copy of the specification file in its build output because it parses the
  specification at runtime.

## Regenerating

```sh
pnpm --filter jobnik-openapi run generate
```

Regenerates `openapi3.yaml` from `openapi_v1.yaml` and regenerates `src/openapi.d.ts` from
`openapi3.yaml`. Both outputs are committed. `generate:check` reruns generation and fails if
the result differs from what is committed — that's what continuous integration runs to catch
a half-applied specification change.

## Adding a new API version

The source files are versioned and unprefixed; the build adds the version prefix and merges
them.

1. Create a new file named `openapi_v{number}.yaml` (e.g. `openapi_v3.yaml`), sibling to
   `openapi_v1.yaml`.
2. Define your API endpoints with **unversioned** paths and operationIds (e.g. `/jobs` and
   `findJobs`, not `/v3/jobs` and `findJobsV3`) — the build adds those automatically.
3. Run `pnpm --filter jobnik-openapi run generate`.

The build discovers every `openapi_v{number}.yaml` file, adds a `/v{n}` path prefix and a
`V{n}` operationId suffix to each, and merges them all into the single committed
`openapi3.yaml`.
