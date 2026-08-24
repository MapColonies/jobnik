# Jobnik E2E Test Suite

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Vitest-3.2.4-green.svg)](https://vitest.dev/)

> End-to-end testing suite for the Jobnik job management platform

## Overview

Jobnik E2E is a comprehensive test suite for validating the Jobnik platform, a distributed job management system that orchestrates multi-stage workflows with scheduling, priority management, retry mechanisms, and state management.

**Key Features:**

- Multi-stage workflow testing
- Retry & recovery logic validation
- Priority queue management
- Pause/resume and abort operations
- OpenTelemetry distributed tracing
- Docker-based isolated test environment

## Prerequisites

- **Node** v24+

## Quick Start

This suite is a workspace in the [jobnik](https://github.com/MapColonies/jobnik) monorepo, not a standalone repository.

```bash
# Clone the monorepo
git clone https://github.com/MapColonies/jobnik.git
cd jobnik

# Install dependencies for every workspace
pnpm install

# Run tests (requires jobnik-manager running separately or via Docker)
pnpm --filter jobnik-e2e run e2e
```

**For Docker setup**: the manager image is built from this monorepo's own checkout, so no other repository needs to be cloned. From the repository root:

```bash
pnpm --filter jobnik-e2e run e2e
```

or, to manage the services directly:

```bash
docker compose -f e2e/docker-compose.yaml up -d --build
```

## Usage

Run these from `e2e/`, or prefix with `pnpm --filter jobnik-e2e run` from the repository root.

```bash
# Run all tests
pnpm run e2e

# Watch mode (auto-rerun on changes)
pnpm run e2e:watch

# Interactive UI
pnpm run e2e:ui

# Run specific test
pnpm run e2e -- simple.spec.ts

# Run tests matching pattern (by test name)
pnpm run e2e -- -t "retry"
```

## Docker Services

The test suite uses Docker Compose to orchestrate services. The `manager` and `migrator` services build the manager image from this repository's own checkout (`docker/backend.Dockerfile`), so no other repository needs to be cloned.

**Services:**

- **jobnik-manager** - Job management API (port 8080)
- **db** - PostgreSQL 14 database (port 5432)
- **migrator** - Prisma database migrations

```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f manager

# Stop services
docker compose down

# Clean environment (remove volumes)
docker compose down -v
```

**Alternative**: You can also run the jobnik-manager server locally instead of using Docker. See [`apps/jobnik-manager`](../apps/jobnik-manager/README.md) for local development setup instructions.

### Turbo wiring

`package.json` lists `jobnik-manager` as a devDependency even though nothing here imports it. It's not dead weight: turbo derives which packages a change "affects" from the workspace dependency graph, and this suite's only real link to the manager is the Docker image built above, which turbo can't see. The unused dependency gives turbo that edge, so `turbo run e2e --affected` (and CI's e2e job) actually run when the manager changes.

## Test Suites

| Test File                        | Description               |
| -------------------------------- | ------------------------- |
| `simple.spec.ts`                 | Basic job execution       |
| `multipleStagesWorkflow.spec.ts` | Multi-stage pipelines     |
| `retry.spec.ts`                  | Retry mechanisms          |
| `pause.spec.ts`                  | Pause/resume operations   |
| `abort.spec.ts`                  | Job abortion              |
| `priority.spec.ts`               | Priority queue management |
| `deleteJob.spec.ts`              | Job deletion              |
| `sharedStageTypes.spec.ts`       | Shared stage definitions  |
| `wait.spec.ts`                   | Asynchronous operations   |

## Configuration

### Environment Variables

```bash
# Jobnik Manager URL (default: http://localhost:8080)
export JOBNIK_MANAGER_BASE_URL=http://localhost:8080
```

### Database Configuration

Database settings are managed via Docker Compose. See `docker-compose.yaml` for details.

## Project Structure

```
e2e/
├── tests/              # E2E test specifications
├── infrastructure/     # Test utilities and SDK setup
│   ├── sdk.ts         # Jobnik SDK initialization
│   ├── data.ts        # Test data generators
│   └── constants.ts   # Configuration constants
├── docker-compose.yaml
└── vitest.config.mts
```

## Troubleshooting

### Connection Issues

```bash
# Check service status
docker compose ps

# View manager logs
docker compose logs manager

# Test manager health
curl http://localhost:8080/liveness
```

### Database Issues

```bash
# Check database health
docker compose exec db pg_isready -U postgres

# Restart database
docker compose restart db
```

### Port Conflicts

```bash
# Find process using port
lsof -i :8080

# Stop services and try again
docker compose down
```

### Docker Build Failures

**Prisma Binary Download Issues:**

If `docker compose up` fails during the build with Prisma-related errors:

```bash
# Option 1: Use cached layers and retry
docker compose build --no-cache

# Option 2: Check network connectivity
curl -I https://binaries.prisma.sh

# Option 3: Build with verbose output to see the actual error
docker compose up --build
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-test`)
3. Commit your changes (`git commit -m 'Add test scenario'`)
4. Push to the branch (`git push origin feature/amazing-test`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/MapColonies/jobnik/issues)
- **Repository**: [github.com/MapColonies/jobnik](https://github.com/MapColonies/jobnik)
- **Team**: MapColonies Infrastructure Team

---

Built with [Vitest](https://vitest.dev/), [TypeScript](https://www.typescriptlang.org/), and [OpenTelemetry](https://opentelemetry.io/)
