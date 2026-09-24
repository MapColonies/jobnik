# Changelog

## [0.3.0](https://github.com/MapColonies/jobnik/compare/jobnik-v0.2.1...jobnik-v0.3.0) (2026-09-24)


### 🎉 Features

* **jobnik-e2e:** lint and format the e2e suite for the first time ([#14](https://github.com/MapColonies/jobnik/issues/14)) ([681bb2a](https://github.com/MapColonies/jobnik/commit/681bb2a6a44c221854e9207029d6faac0f5ad9ba))
* **jobnik-manager:** gate pull requests on an unused-code report ([#13](https://github.com/MapColonies/jobnik/issues/13)) ([6334789](https://github.com/MapColonies/jobnik/commit/63347897ed50d87758a7c44e62c172d8d79fe19f))
* **jobnik-openapi:** make the specification exist exactly once ([#6](https://github.com/MapColonies/jobnik/issues/6)) ([9e20b8e](https://github.com/MapColonies/jobnik/commit/9e20b8ec22897d57360cbc900459649149d19559))
* **jobnik-sdk:** publish from its own tag with packaging and type validation ([#12](https://github.com/MapColonies/jobnik/issues/12)) ([b0261e8](https://github.com/MapColonies/jobnik/commit/b0261e851eb9591015cd5e2c0fc162392a29c7fe))
* publish the helm chart under the product name ([#9](https://github.com/MapColonies/jobnik/issues/9)) ([662e23d](https://github.com/MapColonies/jobnik/commit/662e23d72366ef488d9b5f768f5b497dd8cbf4d9))
* **release:** configure release-please and enforce commit scopes ([#10](https://github.com/MapColonies/jobnik/issues/10)) ([7d1f12f](https://github.com/MapColonies/jobnik/commit/7d1f12f5a94bbe2f055f3611867f402a9652caf0))


### 🐛 Bug Fixes

* **deps:** catalog prettier and typescript, close catalog-membership gap ([#44](https://github.com/MapColonies/jobnik/issues/44)) ([8398dd0](https://github.com/MapColonies/jobnik/commit/8398dd0bd0016c482293e05b0adc8da4f139be49))
* **deps:** drop redundant prettier deps resolved from root, keep openapi's real prettier import ([#45](https://github.com/MapColonies/jobnik/issues/45)) ([f56e25b](https://github.com/MapColonies/jobnik/commit/f56e25ba4e537cbf2d0f829b26df69ae67c39a66))
* **jobnik-e2e:** align shared deps to the catalog, fix manifest inconsistencies ([#40](https://github.com/MapColonies/jobnik/issues/40)) ([68a74ad](https://github.com/MapColonies/jobnik/commit/68a74ad865a6fc9008c3d6e48f028019a76868ea))
* **jobnik-manager:** align shared deps to the catalog, fix @types/node to the Node 24 line ([#41](https://github.com/MapColonies/jobnik/issues/41)) ([1d2972b](https://github.com/MapColonies/jobnik/commit/1d2972b8d9c8cc6132200041c1d116014e2fc80b))
* **jobnik-openapi:** align shared deps to the catalog, fix @types/node to the Node 24 line ([#38](https://github.com/MapColonies/jobnik/issues/38)) ([f96c756](https://github.com/MapColonies/jobnik/commit/f96c7564ffc59f7bf0689509540d858fea0fdfb6))
* **jobnik-sdk:** catch up eslint two majors, complete catalog coverage ([#42](https://github.com/MapColonies/jobnik/issues/42)) ([232bc64](https://github.com/MapColonies/jobnik/commit/232bc64305aefced1a8d323638f7cc2da5dd3c68))
