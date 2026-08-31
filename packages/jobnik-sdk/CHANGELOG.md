# Changelog

## [1.1.0](https://github.com/MapColonies/jobnik/compare/jobnik-sdk-v1.0.1...jobnik-sdk-v1.1.0) (2026-08-31)


### 🎉 Features

* **jobnik-manager:** gate pull requests on an unused-code report ([#13](https://github.com/MapColonies/jobnik/issues/13)) ([6334789](https://github.com/MapColonies/jobnik/commit/63347897ed50d87758a7c44e62c172d8d79fe19f))
* **jobnik-openapi:** make the specification exist exactly once ([#6](https://github.com/MapColonies/jobnik/issues/6)) ([9e20b8e](https://github.com/MapColonies/jobnik/commit/9e20b8ec22897d57360cbc900459649149d19559))
* **jobnik-sdk:** publish from its own tag with packaging and type validation ([#12](https://github.com/MapColonies/jobnik/issues/12)) ([b0261e8](https://github.com/MapColonies/jobnik/commit/b0261e851eb9591015cd5e2c0fc162392a29c7fe))

## [1.0.1](https://github.com/MapColonies/jobnik-sdk/compare/v1.0.0...v1.0.1) (2026-07-28)


### Bug Fixes

* remove pagination parameters from stages API and update response schema ([#73](https://github.com/MapColonies/jobnik-sdk/issues/73)) ([bd55184](https://github.com/MapColonies/jobnik-sdk/commit/bd55184bd19aca99c38f66c550130b34fcd05ac4))

## [1.0.0](https://github.com/MapColonies/jobnik-sdk/compare/v0.3.0...v1.0.0) (2026-07-28)


### ⚠ BREAKING CHANGES

* changed logger interface and modernized deps ([#69](https://github.com/MapColonies/jobnik-sdk/issues/69))

### Features

* update OpenAPI specification to include pagination parameters and responses MAPCO-9304 ([#72](https://github.com/MapColonies/jobnik-sdk/issues/72)) ([b1bd9ce](https://github.com/MapColonies/jobnik-sdk/commit/b1bd9ce19263df118425e8a5b4e0ddc562d97403))


### Bug Fixes

* changed logger interface and modernized deps ([#69](https://github.com/MapColonies/jobnik-sdk/issues/69)) ([06f5a66](https://github.com/MapColonies/jobnik-sdk/commit/06f5a662554b0b8aafa37be14d089175fd9fc48e))

## [0.3.0](https://github.com/MapColonies/jobnik-sdk/compare/v0.2.0...v0.3.0) (2025-12-18)


### Features

* update API paths to include versioning MAPCO-9289 ([#65](https://github.com/MapColonies/jobnik-sdk/issues/65)) ([9056334](https://github.com/MapColonies/jobnik-sdk/commit/90563344157538e1861dba50f5a523c6a4982e78))


### Bug Fixes

* changed InitParam to solve typedoc problems ([#62](https://github.com/MapColonies/jobnik-sdk/issues/62)) ([3d90cfa](https://github.com/MapColonies/jobnik-sdk/commit/3d90cfa82c387cbc8ab72cba9f2d90cf88b446b3))

## [0.2.0](https://github.com/MapColonies/jobnik-sdk/compare/v0.1.0...v0.2.0) (2025-11-30)


### Features

* added option to create stage with waiting status MAPCO-9034 ([#54](https://github.com/MapColonies/jobnik-sdk/issues/54)) ([e747bcd](https://github.com/MapColonies/jobnik-sdk/commit/e747bcd4e2b8fbda2f95861b3b95ccb4e5106fc7))

## 0.1.0 (2025-11-19)


### Features

* add OpenAPI types for job manager ([1dae45e](https://github.com/MapColonies/jobnik-sdk/commit/1dae45e7957b5b0900664cfc56ddc61694dcea55))
* add OpenTelemetry and read-pkg dependencies; implement tracer in trace.ts ([0eb6d06](https://github.com/MapColonies/jobnik-sdk/commit/0eb6d0613af82089e8d4857b412548c1d9ed7e14))
* add worker class ([#36](https://github.com/MapColonies/jobnik-sdk/issues/36)) ([ae9ecea](https://github.com/MapColonies/jobnik-sdk/commit/ae9eceacc17899614f0be6f44ab57e9ee06d9c6d))
* added dequeue backoff ([#50](https://github.com/MapColonies/jobnik-sdk/issues/50)) ([0845332](https://github.com/MapColonies/jobnik-sdk/commit/08453322eadd266d6cd516ca0934080980aa6db8))
* added metrics support for the sdk ([#49](https://github.com/MapColonies/jobnik-sdk/issues/49)) ([340bd8d](https://github.com/MapColonies/jobnik-sdk/commit/340bd8d00fd72fad1606e89cad95d8dba5bcacfa))
* added the producer class MAPCO-7816 ([#33](https://github.com/MapColonies/jobnik-sdk/issues/33)) ([21589c8](https://github.com/MapColonies/jobnik-sdk/commit/21589c8419e403d218bd0fb7781b6f61bb364edc))
* added traces to the api ([#14](https://github.com/MapColonies/jobnik-sdk/issues/14)) ([b2396bd](https://github.com/MapColonies/jobnik-sdk/commit/b2396bd302bedde666e0077d1c33dfbb961eafdc))
* consumer ([#34](https://github.com/MapColonies/jobnik-sdk/issues/34)) ([84af924](https://github.com/MapColonies/jobnik-sdk/commit/84af9247abf078a5fa5b50cdf06a7cc9e3db1f7f))
* implement JobnikSDKError and specific error classes for SDK ([9d1c721](https://github.com/MapColonies/jobnik-sdk/commit/9d1c7212aa202280bce7c0192d3bfa3a0802f33e))
* implemented api with error handling ([#10](https://github.com/MapColonies/jobnik-sdk/issues/10)) ([7f1900c](https://github.com/MapColonies/jobnik-sdk/commit/7f1900cebb07bd54276270d3e8c1905b4ef1e0a8))
* implemented api with error handling ([#5](https://github.com/MapColonies/jobnik-sdk/issues/5)) ([7c1dca1](https://github.com/MapColonies/jobnik-sdk/commit/7c1dca1d91b252c364b52d84302fcc26758858ef))
* implemented basic http client ([#4](https://github.com/MapColonies/jobnik-sdk/issues/4)) ([1b129e7](https://github.com/MapColonies/jobnik-sdk/commit/1b129e7bee41bfde343e4e33c621462226efac7a))
* **logger:** add Logger interface and NoopLogger implementation ([59ff245](https://github.com/MapColonies/jobnik-sdk/commit/59ff245dba777f4dbaaf6e0b67c86b94f5f5c93a))
* sdk finalization ([#47](https://github.com/MapColonies/jobnik-sdk/issues/47)) ([50e3a18](https://github.com/MapColonies/jobnik-sdk/commit/50e3a18361f5fdc664a6e939c30a7d88d260960b))
* worker trace improvement ([#52](https://github.com/MapColonies/jobnik-sdk/issues/52)) ([3b8b39e](https://github.com/MapColonies/jobnik-sdk/commit/3b8b39e010c607ff1c21428185035af1425c656b))


### Miscellaneous Chores

* release 0.1.0 ([2a217b6](https://github.com/MapColonies/jobnik-sdk/commit/2a217b66963ace6655729d19cafc1a7aa667c78c))
