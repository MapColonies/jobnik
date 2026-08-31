# Changelog

## [0.2.1](https://github.com/MapColonies/jobnik-manager/compare/v0.2.0...v0.2.1) (2026-06-01)


### ⚠ BREAKING CHANGES

* squash database migrations into a single migration and added performance indexes ([#242](https://github.com/MapColonies/jobnik-manager/issues/242))

### Features

* implement race condition handling for task dequeue and status updates ([#237](https://github.com/MapColonies/jobnik-manager/issues/237)) ([e05f283](https://github.com/MapColonies/jobnik-manager/commit/e05f283f478ee97ccb4458e5760def14fe2793e2))
* squash database migrations into a single migration and added performance indexes ([#242](https://github.com/MapColonies/jobnik-manager/issues/242)) ([3054003](https://github.com/MapColonies/jobnik-manager/commit/305400380a170b51a48b15b2817daffcb0585ce3))


### Miscellaneous Chores

* force alignment to rc track ([dcbc8ed](https://github.com/MapColonies/jobnik-manager/commit/dcbc8ed4fa94616a9211787e7a39d182d02c2d32))

## [0.2.0](https://github.com/MapColonies/jobnik-manager/compare/v0.1.0...v0.2.0) (2026-02-03)


### Features

* introduce v1 API structure with jobs, stages, and tasks endpoints MAPCO-8959 ([#205](https://github.com/MapColonies/jobnik-manager/issues/205)) ([dad0bd3](https://github.com/MapColonies/jobnik-manager/commit/dad0bd3b7844346dad9754ed77ec2af42728890a))
* modernized ([#233](https://github.com/MapColonies/jobnik-manager/issues/233)) ([0afb5ca](https://github.com/MapColonies/jobnik-manager/commit/0afb5ca8518959a37d81c21cbe8270a0ccbae93d))

## 0.1.0 (2025-11-16)


### Features

* add comprehensive error handling from OpenAPI spec (MAPCO-7927) ([#89](https://github.com/MapColonies/jobnik-manager/issues/89)) ([225789d](https://github.com/MapColonies/jobnik-manager/commit/225789d6f16a96df96d7a92fe07a055557aad0e2))
* add cron job functionality for task cleanup (MAPCO-8350) ([#94](https://github.com/MapColonies/jobnik-manager/issues/94)) ([8de6cca](https://github.com/MapColonies/jobnik-manager/commit/8de6cca114ca076470663b10be037f95c43df02c))
* add isWaiting flag to stage creation for conditional status handling (MAPCO-7905) ([#40](https://github.com/MapColonies/jobnik-manager/issues/40)) ([e92d6a0](https://github.com/MapColonies/jobnik-manager/commit/e92d6a0efb8bb1127d1f473f2e0e3b05c04af218))
* add metrics for tracking in-progress jobs, stages, and tasks MAPCO-8206 ([#119](https://github.com/MapColonies/jobnik-manager/issues/119)) ([4105597](https://github.com/MapColonies/jobnik-manager/commit/4105597bfa229a7d233fe780a2a060de374466a8))
* add order field to stages for maintaining execution sequence and update related logic (MAPCO-7897) ([#72](https://github.com/MapColonies/jobnik-manager/issues/72)) ([1667e27](https://github.com/MapColonies/jobnik-manager/commit/1667e27a73c0512884cbf5be831069544b059936))
* add Prisma instrumentation for enhanced tracing and update related logic ([#76](https://github.com/MapColonies/jobnik-manager/issues/76)) ([b35aff9](https://github.com/MapColonies/jobnik-manager/commit/b35aff9c55963c770478091c7a8c8f2d97ee63de))
* add startTime and endTime fields to task model (MAPCO-8349) ([#93](https://github.com/MapColonies/jobnik-manager/issues/93)) ([2c17e42](https://github.com/MapColonies/jobnik-manager/commit/2c17e426aec4c9c56730d8985d7c4710a3846014))
* add userMetadata, creationTime, and updateTime to task and stage schemas as mandatory MAPCO-8576 ([#170](https://github.com/MapColonies/jobnik-manager/issues/170)) ([f26268e](https://github.com/MapColonies/jobnik-manager/commit/f26268e68d0196aff546a6c2dc0aa2507f4d2627))
* enhance job, stage and task status update descriptions and validations in OpenAPI spec  MAPCO-8783 ([#171](https://github.com/MapColonies/jobnik-manager/issues/171)) ([bd1c50b](https://github.com/MapColonies/jobnik-manager/commit/bd1c50bebc4a654a7d2b855ac6dea547e397c968))
* enhance tracing attributes in job, stage and task managers  MAPCO-8341 ([#169](https://github.com/MapColonies/jobnik-manager/issues/169)) ([3107027](https://github.com/MapColonies/jobnik-manager/commit/3107027db577bc277225e95d47c6247d6b4fc23a))
* enhance tracing support with traceparent and tracestate fields in jobs, stages, and tasks (MAPCO-8340) ([#78](https://github.com/MapColonies/jobnik-manager/issues/78)) ([b1c78f5](https://github.com/MapColonies/jobnik-manager/commit/b1c78f5ca15a2731d1554d9037241fddbc6190b4))
* implement automatic status propagation across job-stage-task hierarchy MAPCO-8785  MAPCO-8784 ([#153](https://github.com/MapColonies/jobnik-manager/issues/153)) ([7f80168](https://github.com/MapColonies/jobnik-manager/commit/7f8016811d65adeaa75f2491ca5c0a51b55a6fd2))
* implement stage status transition validation and update logic (MAPCO-8803) ([#146](https://github.com/MapColonies/jobnik-manager/issues/146)) ([1201f90](https://github.com/MapColonies/jobnik-manager/commit/1201f90dd0f7d6c6ec3bd738f2520583afcf70d0))
* integrate jobnik manager with config manager & schemas (MAPCO-7924) ([#116](https://github.com/MapColonies/jobnik-manager/issues/116)) ([4c3e716](https://github.com/MapColonies/jobnik-manager/commit/4c3e716a12edf020c6c8f6982d514cd46fee9a42))
* Jobnik Manager: project skeleton & core functions ([#34](https://github.com/MapColonies/jobnik-manager/issues/34)) ([099bc8d](https://github.com/MapColonies/jobnik-manager/commit/099bc8d12c81b18f1d8f76d7658b23bed561e976))


### Bug Fixes

* remove unused previewFeatures from prisma client generator ([2159346](https://github.com/MapColonies/jobnik-manager/commit/2159346088de43d409472bcd018f115245798e43))
