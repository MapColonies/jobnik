# Job Manager Server

This server provides a management interface for job trees and includes a RESTful API for interacting with a PostgreSQL database.

**Key Features:**

- Manages job trees.
- Provides a RESTful API for database management.
- Paginated list endpoints for jobs, stages, and tasks.

## Pagination

The `GET /v1/jobs`, `GET /v1/stages`, and `GET /v1/tasks` list endpoints support `page` (1-based, default `1`) and `page_size` (1–100, default `10`) query parameters.

Responses are wrapped in `{ total, items }` instead of a plain array — `total` is the full match count regardless of page.

```
GET /v1/jobs?page=2&page_size=5
→ { "total": 15, "items": [...5 jobs...] }
```

Requesting beyond the last page returns `items: []`, not an error.

`GET /v1/jobs/:jobId/stages` is scoped to a single job and returns a plain array — a job's stages are bounded in number, so pagination isn't needed there.

**Requirements:**

- **PostgreSQL:** Version 13 or higher is required.

---

## Migration

Migrations are managed with [drizzle-kit](https://orm.drizzle.team/docs/kit-overview). The table definitions in `src/db/entities` are the source of truth, and the generated SQL lives in `src/db/migrations`.

<ins>**How to create a new migration**</ins>

1. Edit the table definitions in `src/db/entities`.
2. `npm run migration:create <migration name>` - Generates a new migration from the difference between the table definitions and the latest migration snapshot.

<ins>**Running migrations**</ins>

Migrations are applied by a standalone command, `node ./db/runMigrations.js`, compiled into the build output and the Docker image. The service never migrates on startup, so run the command before deploying a new version. It reads the same `db` configuration (and environment variables, including the SSL ones) as the service.

- Locally: `npm run migration:run` (or `npm run migration:run:dev` with `CONFIG_OFFLINE_MODE=true`).
- Using Docker:

  ```bash
  docker run --network=host \
    -e CONFIG_OFFLINE_MODE=true \
    -e DB_HOST=<db_host> -e DB_PORT=<db_port> -e DB_NAME=<db_name> \
    -e DB_USERNAME=<db_user_name> -e DB_PASSWORD=<db_password> \
    jobnik-manager node ./db/runMigrations.js
  ```

  For an SSL connection, mount the certificates and add `-e DB_ENABLE_SSL_AUTH=true -e DB_CA_PATH=... -e DB_KEY_PATH=... -e DB_CERT_PATH=...`.

---

## API Versioning

The manager takes its OpenAPI specification, and the request/response types generated from
it, from the `jobnik-openapi` workspace package (`packages/jobnik-openapi`) as a runtime
dependency — resolved through the module system rather than through a copy of the file living
here. The specification's versioned source files, its build, and how to add a new API
version are documented in that package's `README.md`.
