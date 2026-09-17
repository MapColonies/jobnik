# Jobnik

A job orchestration system: Jobs are composed of Stages, which are composed of Tasks.

## Language

**Branded ID**:
A nominally-typed wrapper (`JobId`, `StageId`, `TaskId`) around a plain `string` id, generated as part of the OpenAPI types. Its purpose is to catch a job/stage/task id being passed where a different kind of id is expected — a compile-time guard against mixing up ids, not a runtime check that the id exists or is well-formed (that's the OpenAPI request validator's job).
_Avoid_: validated ID, typed ID

**API model**:
A type derived directly from the OpenAPI spec (`components['schemas'][...]`), describing the wire contract of a request or response.
_Avoid_: DTO, schema type

**Persistence model**:
The Prisma-derived shape of a row as stored in the database. Deliberately not required to mirror the API model — the two are distinct representations of the same entity, and Prisma is expected to be replaced later.
_Avoid_: DB model, entity (when meaning the Prisma type specifically)
