# Migrate jobnik-manager from Prisma to Drizzle

Status: ready-for-agent

## Problem Statement

jobnik-manager's persistence layer is built on Prisma, and Prisma's query builder is too weak for the queries a job orchestrator needs. The most important one — a worker dequeuing the next Task by locking a row with `SKIP LOCKED` across a Job → Stage → Task join — had to be written as typed raw SQL, with a separate code-generation step and a hardcoded Postgres schema name. Around it, Prisma brings a generated client that must be built and shipped (including a Prisma CLI install in the Docker image), a second generator just to type JSON columns, Branded IDs that have to be cast by hand at the persistence boundary, and a Prisma-specific tracing instrumentation. Database access is scattered: managers call Prisma directly, and two partial repositories hold only a handful of raw-SQL operations. The sibling MapColonies project opa-la (auth-core / auth-manager) has already settled on Drizzle with a shared `@map-colonies/drizzle-utils` package, and jobnik diverges from that house pattern.

## Solution

Replace Prisma with Drizzle in jobnik-manager, following the opa-la auth-core/auth-manager pattern. The table definitions, client factory and migrations live inside jobnik-manager, laid out the same way auth-core is, so they can be extracted later if another consumer appears. Every query — including the Task dequeue — is written in Drizzle's query builder; typed raw SQL and its code generation go away. The Persistence model is inferred from the table definitions and carries the same Branded IDs and JSON types as the API model, without casts. The API contract, the SDK, and every observable behavior stay the same; the existing integration and e2e suites prove it. Since nothing is deployed yet, the Prisma migration history is discarded and Drizzle starts from one fresh migration. The migration is carried out as a chain of GitHub stacked PRs (via `gh-stack`), each green on its own; how the chain is cut is decided when this spec is broken into tickets.

## User Stories

1. As a jobnik maintainer, I want the persistence layer built on Drizzle, so that it matches the MapColonies house pattern established in opa-la.
2. As a jobnik maintainer, I want the Task dequeue query expressed in the query builder, so that it is type-checked against the table definitions instead of relying on hand-maintained SQL.
3. As a jobnik maintainer, I want no typed-SQL code-generation step, so that the build has one fewer generator to run and keep in sync.
4. As a jobnik maintainer, I want no generated ORM client, so that builds, Docker images, and fresh checkouts don't depend on a generation step or a downloaded engine binary.
5. As a jobnik maintainer, I want the Persistence model inferred from the table definitions, so that the row types can't drift from the schema.
6. As a jobnik maintainer, I want Job, Stage and Task id and foreign-key columns typed with the Branded IDs (`JobId`, `StageId`, `TaskId`), so that the casts at the persistence boundary disappear and id mix-ups are caught at compile time.
7. As a jobnik maintainer, I want JSON columns (user metadata, data, xstate, etc.) typed with their existing TypeScript types, so that I get the same typing the JSON-types generator gave without a separate generator.
8. As a jobnik maintainer, I want the Job, Stage and Task status and Priority enums to be plain constant objects the code owns, so that the ~400 existing call sites (`JobOperationStatus.IN_PROGRESS`, `Object.values(...)` for metrics) keep working unchanged.
9. As an API client, I want status and priority values on the wire to stay the uppercase names (`IN_PROGRESS`, `VERY_HIGH`, ...), so that the migration doesn't break the OpenAPI contract or the SDK.
10. As a jobnik maintainer, I want the database enum labels to be the same uppercase names the API uses, so that there is one representation from the API to the database with no translation layer.
11. As a jobnik maintainer, I want the tables in the `job_manager` Postgres schema declared in the table definitions, so that every query is schema-qualified without depending on `search_path`.
12. As an operator, I want the `DB_SCHEMA` setting removed, so that there is no configuration knob that looks supported but would silently break the service.
13. As a jobnik maintainer, I want the fresh Drizzle migration to produce the same tables, columns, types, defaults, constraints, indexes and cascade rules as the Prisma migration (enum labels aside), so that the swap changes no behavior.
14. As a jobnik maintainer, I want `update_time` to keep being set on every update, so that timestamps behave as they did under Prisma.
15. As an operator, I want migrations applied by a separate migration command at deploy time, so that app replicas never race to migrate on startup.
16. As an operator, I want the service to verify at startup that its schema and tables exist, so that a deployment without migrations fails fast with a clear error.
17. As an operator, I want the liveness/readiness health check to keep checking database connectivity, so that orchestration behaves as before.
18. As an operator, I want the Docker image to carry the compiled migrations and a runnable migration command instead of a globally installed Prisma CLI, so that the image is smaller and has no Prisma-specific build steps.
19. As a jobnik maintainer, I want new migrations generated with drizzle-kit from the table definitions, so that schema changes follow the same workflow as opa-la.
20. As a jobnik maintainer, I want one Drizzle client registered once in the DI container, so that every consumer shares one connection pool, exactly as the Prisma client is shared today.
21. As an operator, I want the connection pool closed on shutdown, so that graceful termination doesn't leak connections.
22. As a jobnik maintainer, I want database errors (unique violations, foreign-key violations, etc.) identified with the shared drizzle-utils helpers and Postgres error codes, so that domain error mapping no longer depends on Prisma error tagging.
23. As a jobnik maintainer, I want transactional operations to accept a Drizzle transaction type in place of the Prisma transaction type, so that multi-step operations (e.g. updating a Stage summary together with a Task status) stay atomic.
24. As a jobnik maintainer, I want a clear rule for where a query lives — single-table lookups and by-id writes in the manager; joins, row locks, aggregates, raw `sql`, multi-step transactions and conditionally built filters in a repository — so that the layering is predictable.
25. As a jobnik maintainer, I want Job to gain a repository as soon as it has a query meeting the repository criteria (such as the job search with optional filters), so that the rule is applied uniformly across Job, Stage and Task.
26. As a worker using the SDK, I want dequeuing a Task to keep returning the highest-priority eligible Task and never hand the same Task to two concurrent workers, so that the lock semantics survive the rewrite.
27. As a worker using the SDK, I want dequeue to keep skipping Tasks whose Stage or Job is not in an eligible status, so that paused, aborted or finished work is never handed out.
28. As an API client, I want create, get, list/search, update-status, pause, abort, retry and delete operations on Jobs, Stages and Tasks to behave exactly as before, so that the migration is invisible to me.
29. As an API client, I want the same HTTP error responses (404 not found, 400 illegal status transition, etc.) for the same situations, so that my error handling keeps working.
30. As an operator, I want database query spans to keep appearing in traces, so that observability doesn't regress when the Prisma instrumentation is removed.
31. As an operator, I want the service metrics that count Jobs, Stages and Tasks by status to keep reporting every status, so that dashboards and alerts keep working.
32. As a jobnik maintainer, I want the integration test setup to migrate with the same migration command used at deploy time, so that tests exercise the real migration path.
33. As a jobnik maintainer, I want the integration test teardown to clean up the `job_manager` schema without a Prisma client, so that test runs stay isolated.
34. As a jobnik maintainer, I want unit tests limited to logic that doesn't touch the database (state machines, helpers), so that tests don't mock Drizzle's fluent query chain and break when a query is rephrased.
35. As a jobnik maintainer, I want behavior previously covered by Prisma-mocking unit tests covered by integration tests against a real Postgres, so that coverage of that behavior isn't lost.
36. As a jobnik maintainer, I want the e2e suite (full Docker image, migrator container, SDK-driven workflows) to pass unchanged apart from its migrator service, so that the whole platform is validated end to end.
37. As a jobnik maintainer, I want the e2e migrator service to run the new migration command, so that the e2e environment mirrors deployment.
38. As a jobnik maintainer, I want every Prisma dependency, script, generated artifact, build step and build-approval entry removed, so that nothing Prisma-related is left behind.
39. As a jobnik maintainer, I want the Drizzle dependencies pinned to the latest 1.0 prerelease (`1.0.0-rc.4` as of writing) and routed through the pnpm catalog, so that the version is explicit and consistent with the repo's dependency policy.
40. As a jobnik maintainer, I want the e2e README and any other docs updated to stop referring to Prisma, so that onboarding instructions stay accurate.
41. As a reviewer, I want the migration delivered as a chain of stacked PRs, so that each step is reviewable in isolation. Every PR passes on its own except the per-entity query-cutover PRs, which merge together with the integrate-and-verify PR on top of them.
42. As a reviewer, I want Prisma and Drizzle never serving requests at the same time in any PR of the chain, so that no intermediate state has two ORMs writing to the same tables.

## Implementation Decisions

- **Scope**: only jobnik-manager uses the database. jobnik-openapi and jobnik-sdk are untouched; the e2e package changes only its migrator service and docs.
- **Stack**: `drizzle-orm` and `drizzle-kit` at the latest 1.0 prerelease (`1.0.0-rc.4` at the time of writing; no stable 1.0.0 exists yet), node-postgres driver, the `defineRelations` relations API and relational queries. `@map-colonies/drizzle-utils` 1.0.0 (peer `drizzle-orm ^1.0.0-rc.2`) supplies connection creation, health check, the migration runner, pagination/sort helpers and Postgres error helpers. All added through the pnpm catalog.
- **Database module layout** (inside jobnik-manager, mirroring opa-la's auth-core): one table-definition module per table (job, stage, task), a common module for the `job_manager` schema namespace, snake_case column naming, shared column helpers and the enums, and an index that re-exports the tables and builds the relations graph. A client module exports a `createDrizzle(pool)` factory plus `Drizzle` and `DrizzleTx` types. A drizzle-kit config and a migrations folder sit alongside.
- **Schema namespace**: the tables are declared in the `job_manager` Postgres schema; the `DB_SCHEMA` config key and its environment mapping are removed (ADR 0002).
- **Enums**: the code owns constant objects `JobOperationStatus`, `StageOperationStatus`, `TaskOperationStatus` and `Priority`, with the same keys and values the Prisma client exposed (uppercase names). Postgres enums are built from their values, and each has a matching union type. Database enum labels become the uppercase names — the one deliberate schema difference from the Prisma migration (ADR 0001).
- **Column typing**: id and foreign-key columns use `$type<JobId | StageId | TaskId>()`; JSON columns use `$type<T>()` with their existing types. No runtime validation of JSON is added.
- **Ids**: the Job/Stage/Task `id` columns default to `gen_random_uuid()` in the database (`defaultRandom()`), the second deliberate schema difference from the Prisma migration (ADR 0001).
- **Timestamps**: `creation_time` defaults to now; `update_time` is set in application code on every update (`$onUpdate`), as Prisma's `@updatedAt` was. No database trigger.
- **Persistence model**: row types come from `$inferSelect` / `$inferInsert` on the table definitions and replace every use of Prisma-generated model types. It still doesn't have to mirror the API model.
- **Migrations**: the Prisma migration history is deleted. One fresh drizzle-kit migration creates the `job_manager` schema contents. Migrations run from a standalone migration command (in the style of opa-la's `runMigrations`) that uses the drizzle-utils runner. It is compiled into the image, with migration SQL copied into the build output, and it is not run on app startup. The package scripts for creating and running migrations are replaced accordingly.
- **Enum-label prefactor**: the enum labels are first renamed to the uppercase names while still on Prisma (a Prisma migration, and dropping the enum `@map`s), so Prisma's schema and the Drizzle schema become identical. That lets migrations switch to the Drizzle command before any query does.
- **Schema equivalence check**: before the Prisma migration is deleted, create a database once from the Prisma migrations and once from the Drizzle migration, and diff `pg_dump --schema-only` of the two. The diff must be empty. This is a one-off verification recorded in the PR, not a permanent test.
- **Client lifecycle**: a single `pg` pool created via drizzle-utils and registered in tsyringe; `SERVICES.DRIZZLE` is registered with a cached factory over `createDrizzle`, replacing `SERVICES.PRISMA`. The pool is closed in the shutdown hook.
- **Startup verification and health**: the startup check that the schema and all three tables exist, and the liveness/readiness DB check, move to Drizzle / drizzle-utils equivalents.
- **Error mapping**: the Prisma client extension that tags errors is removed. Managers and repositories recognise database errors with drizzle-utils' query-error guard and Postgres error codes, and map them to the same domain errors as today.
- **Query placement rule**: a manager may issue single-table relational lookups (`findFirst`/`findMany`) and by-id insert/update/delete directly. Anything with joins, row locks, aggregates, raw `sql`, multi-step transactions, or conditionally assembled filters lives in a repository (Job, Stage, Task). The existing Stage and Task repositories are kept and extended, and a Job repository is introduced for queries that qualify, such as the job search with optional filters.
- **Task dequeue**: rewritten in the query builder — inner joins Task→Stage→Job, filtered by stage type and the eligible Task/Stage/Job statuses, ordered by Job priority, limit 1, locked with `FOR UPDATE OF task SKIP LOCKED`. It lives in the Task repository. The typed-SQL folder and its generator are removed.
- **Transactions**: every parameter typed as the Prisma transaction becomes `DrizzleTx`; operations that compose multiple writes keep running in a single transaction.
- **Tracing**: `PrismaInstrumentation` is removed. Query spans come from the `pg` instrumentation that `@map-colonies/tracing` already enables through the auto-instrumentations.
- **Metrics**: status-count metrics keep iterating over every enum value, now from the owned constant objects.
- **Build and image**: the Prisma generators, schema copy step, `prisma format --check` step and global Prisma CLI install are removed from the build and Docker image. The image instead carries the compiled migration command and migration SQL. Prisma entries leave `onlyBuiltDependencies`.
- **Delivery**: a chain of GitHub stacked PRs managed with `gh-stack`, one PR per ticket under `issues/`. The query cutover is split per entity (Jobs, Stages, Tasks), because transactions span entities and no entity can switch alone. Those PRs don't pass on their own and merge together with the integrate-and-verify PR on top. Every other PR passes on its own, and no merged state has both ORMs serving requests.

## Testing Decisions

- **What a good test is**: it exercises external behavior through the highest available seam — HTTP requests to the running app, or SDK-driven workflows against the full stack — and asserts on responses and persisted state, never on which query-builder methods were called. A query can be rewritten without touching a test.
- **Primary seam — integration suite**: the existing jobnik-manager integration tests (real Postgres via docker-compose, requests through the app's request sender, direct DB assertions through the resolved client) are the main regression net. Their test bodies should pass with only setup changes: global setup migrates with the new migration command, teardown drops `job_manager` without Prisma, and direct DB assertions use the Drizzle client.
- **Second seam — e2e suite**: the e2e package (full Docker image, migrator service, SDK workflows: simple, multiple stages, shared stage types, priority, pause, abort, retry, wait, delete) must pass with only its migrator service switched to the new migration command. This validates the image, the migration command, dequeue locking and priority ordering end to end.
- **Unit tests**: only logic that doesn't touch the database — the Job/Stage/Task state machines and pure helpers. Unit tests that deep-mock the Prisma client (stage repository, task repository, and the jobs/stages/tasks manager specs) are removed, and any behavior they covered that the integration suite doesn't already cover gets an integration test. No test mocks the Drizzle client.
- **Concurrency coverage**: dequeue must never return the same Task to two concurrent callers. This gets an integration test if the existing suites don't already demonstrate it.
- **One-off schema check**: the `pg_dump --schema-only` diff (must be empty) is run and its result recorded in the PR that introduces the Drizzle migration.
- **Prior art**: jobnik-manager's integration setup (docker-compose global setup, request sender, direct DB assertions); the e2e suite's compose-based infrastructure; opa-la auth-manager's integration setup that resets the schema and runs migrations once per suite.

## Out of Scope

- Moving the database module into its own package (e.g. a `jobnik-core`); it stays inside jobnik-manager, laid out so it can be extracted later.
- Switching the test infrastructure to testcontainers.
- Runtime validation of JSON columns (e.g. zod).
- Any other schema cleanup (column types, defaults, database triggers for `update_time`) beyond the enum-label change.
- Any change to the OpenAPI contract, the SDK, or API behavior.
- Restructuring beyond the query placement rule (e.g. removing the repositories, or a full repository layer for all CRUD).
- Data migration — there are no deployed databases.
- Adopting a stable Drizzle 1.0.0 once released; that's a later dependency bump.

## Further Notes

- Decisions are recorded in ADR 0001 (Drizzle replaces Prisma, fresh migration, enum-label exception) and ADR 0002 (hardcoded `job_manager` schema). The glossary entries **Persistence model** and **Branded ID** in `CONTEXT.md` were updated for this migration.
- Reference implementation: MapColonies/opa-la, `packages/auth-core` (table definitions, client factory, drizzle-kit config, migration command) and `apps/auth-manager` (DI registration, managers using Drizzle directly, drizzle-utils error mapping, integration setup). opa-la pins `drizzle-orm` 1.0.0-rc.2 and drizzle-utils 0.2.0, while this migration targets newer versions, so check the drizzle-utils changelog between 0.2.0 and 1.0.0.
- Watch for the enum-value trap: Prisma's TypeScript enum values were the uppercase names while the database labels were `In-Progress`-style, and the `@map` translation hid the difference. Anything that relied on the database labels (raw SQL, fixtures, dashboards querying the DB directly) has to use the uppercase names after the migration.
