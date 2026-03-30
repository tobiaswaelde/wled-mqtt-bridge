# Changelog

<!-- Changelog created using the [Simple Changelog](https://marketplace.visualstudio.com/items?itemName=tobiaswaelde.vscode-simple-changelog) extension for VS Code. -->

## [Unreleased]

## [2.0.2] - 2026-03-30
### Changed
- Release workflow now builds multi-arch Docker images and pushes them to GitHub Container Registry (`ghcr.io`)
- Release workflow now grants `packages: write` permission for GHCR publishing

## [2.0.1] - 2026-03-30
### Added
- Optional WLED HTTP timeout (`wled.http_timeout_ms`, per-controller override) for GET/POST requests

### Changed
- MQTT reconnect handling improved with exponential backoff and max delay (`mqtt.reconnect_max_delay_secs`)
- MQTT command wildcard subscription is re-applied after reconnect (`ConnAck`)
- Config parsing is now strict (`deny_unknown_fields`) and includes stronger runtime validation for reconnect/polling/timeout fields

## [2.0.0] - 2026-03-29
### Added
- Docker Compose improvements (healthcheck override, log rotation, resource limits, image tag pinning support)
- Optional Prometheus-style metrics endpoint
- Dead-letter topic for invalid command and routing errors
- Rust CI workflow (`fmt`, `clippy`, `check`, `test`)
- Multi-architecture container image publishing (`linux/amd64`, `linux/arm64`)
- Container SBOM generation and artifact upload
- Cosign keyless image signing plus provenance/SBOM attestations
- CI container smoke test using MQTT healthcheck

### Changed
- Release workflow now skips when Cargo version is not higher than latest release tag and writes a summary
- Per-controller polling overrides via `wled.controllers[]`
- MQTT QoS/retain now configurable per topic class
- Bridge module refactor: split orchestration and core helper logic

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
