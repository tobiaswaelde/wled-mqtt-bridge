# Changelog

<!-- Changelog created using the [Simple Changelog](https://marketplace.visualstudio.com/items?itemName=tobiaswaelde.vscode-simple-changelog) extension for VS Code. -->

## [Unreleased]
### Added
- Docker Compose improvements (healthcheck override, log rotation, resource limits, image tag pinning support)
- Optional Prometheus-style metrics endpoint
- Dead-letter topic for invalid command and routing errors
- Rust CI workflow (`fmt`, `clippy`, `check`, `test`)

### Changed
- Release workflow now skips when Cargo version is not higher than latest release tag and writes a summary
- Per-controller polling overrides via `wled.controllers[]`
- MQTT QoS/retain now configurable per topic class

## [1.0.2] - 2025-09-09
### Added
- load effects & palettes on start

### Fixed
- fix stringification of values & objects

## [1.0.1] - 2025-09-09
### Changed
- do not stringify numbers & booleans when publishing to MQTT

## [1.0.0] - 2025-09-08
### Added
- implement bridge between WLED controller & MQTT broker
