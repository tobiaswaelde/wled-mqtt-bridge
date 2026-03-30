# Changelog

<!-- Changelog created using the [Simple Changelog](https://marketplace.visualstudio.com/items?itemName=tobiaswaelde.vscode-simple-changelog) extension for VS Code. -->

## [Unreleased]

## [2.0.8] - 2026-03-30
### Changed
- Correct the Docker patch release so the publish tag points to the commit that removes the slow emulated multi-architecture build

## [2.0.7] - 2026-03-30
### Changed
- Publish only a native `linux/amd64` Docker image to remove the slow emulated `linux/arm64` build path
- Simplify the Docker publish workflow to match the faster single-architecture pattern used in `modbus-mqtt-bridge`

## [2.0.6] - 2026-03-30
### Changed
- Cut a fresh patch release to publish updated release artifacts and Docker image tags
- No functional application changes in this patch beyond release publication

## [2.0.5] - 2026-03-30
### Changed
- Speed up Docker image publishing by excluding large local build artifacts and repository metadata from the Docker build context
- Reuse cached Cargo dependencies and build outputs across Docker builds in GitHub Actions to reduce repeat build time

## [2.0.4] - 2026-03-30
### Changed
- Simplify release workflows by separating responsibilities: `deploy.yml` only publishes the multi-arch container image, and `release.yml` only packages binaries and creates the GitHub Release
- Remove SBOM generation, image signing, provenance attestation, duplicate Docker publishing, and extra workflow permissions from the tag release path

## [2.0.3] - 2026-03-30
### Fixed
- Isolate command handling per controller so one offline or timing-out controller does not block commands to other configured controllers

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
