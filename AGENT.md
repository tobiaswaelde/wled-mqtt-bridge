# AGENT.md

Guidance for AI coding agents working in `wled-mqtt-bridge`.

## Project Snapshot

- Language: Rust (`edition = 2021`)
- Runtime: async Tokio service
- Purpose: bridge one MQTT broker to multiple WLED controllers
- Binary: `wled-mqtt-bridge`
- Default runtime config: `config/config.yml`

Core behavior:

- Poll each configured WLED controller for:
  - `/json/state`
  - `/json/info`
  - `/json/eff`
  - `/json/pal`
- Publish data to controller-scoped MQTT topics.
- Listen for JSON commands per controller and forward to WLED.
- Publish dead-letter entries for invalid command topics/payloads.
- Optionally expose Prometheus-style metrics.

## Repository Layout

- `src/main.rs`
  - CLI (`--config`, `--healthcheck`)
  - bootstraps missing config from `config/config.example.yml`
  - logging init
- `src/config.rs`
  - typed config model, defaults, validation
  - enforces `wled.controllers[]` invariants
- `src/bridge.rs`
  - MQTT event loop
  - per-controller polling loops
  - command handling and topic routing
- `src/metrics.rs`
  - runtime counters
  - optional metrics endpoint server
- `config/config.example.yml`
  - checked-in template config
- `docs/`
  - VitePress documentation source
- `.github/workflows/`
  - Docker build/publish, docs pages, release workflows

## MQTT Topic Contract

For `mqtt.base_topic = wled` and `controller_id = living-room`:

- Commands in: `wled/living-room/cmd`
- Online status: `wled/living-room/online`
- State object: `wled/living-room/state`
- Info object: `wled/living-room/info`
- Effects list: `wled/living-room/effects`
- Palettes list: `wled/living-room/palettes`

Bridge-level availability topic:

- `wled/bridge_online`
- `wled/dead_letter` (default suffix configurable)

Do not change topic paths or payload shape unless explicitly requested.

## Config Rules

Required structure (no legacy `wled.host` fallback):

- `mqtt.*`
- `wled.controllers[]` with:
  - unique `id`
  - non-empty `id` and `host`
  - `id` must not contain `/`
- Optional per-controller polling overrides:
  - `interval_ms`
  - `timeout_ms`
  - `timeout_duration_ms`
- Optional per-topic publish tuning:
  - `publish.qos.*`
  - `publish.retain.*`
- Optional metrics endpoint:
  - `metrics.enabled`, `metrics.host`, `metrics.port`, `metrics.path`

If config schema changes:

1. Update `src/config.rs` model + validation.
2. Update `config/config.example.yml`.
3. Update `README.md` and docs pages (`docs/configuration.md`, `docs/topic-contract.md`).

## Runtime Expectations

- Keep loops resilient: errors should log and continue when possible.
- Avoid panics in normal runtime paths.
- Keep command handling idempotent where practical.
- Preserve adaptive polling behavior:
  - normal interval while healthy
  - timeout interval after sustained failures

## Build, Test, and Dev Commands

Primary checks before finishing work:

- `cargo fmt --all`
- `cargo check`

Optional (when available/needed):

- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test`

Docs:

- `cd docs && npm install && npm run dev`
- `cd docs && npm run build`

## CI / Release Model

- `test-build.yml`: validates Docker image builds on pushes.
- `pages.yml`: builds and deploys docs to GitHub Pages from `docs/.vitepress/dist`.
- `release.yml`: release workflow on tag pushes (`v*`):
  - builds musl release tarball + sha256
  - extracts release notes from the matching `CHANGELOG.md` version section
  - creates GitHub release for the pushed tag
  - supports manual `workflow_dispatch` to seed an `Unreleased` changelog section
- `deploy.yml`: publishes Docker image on tag pushes (`v*`), including `latest` and version tag.

Important coupling:

- both `release.yml` and `deploy.yml` are triggered by pushed version tags.

## Docker Notes

- Multi-stage Dockerfile builds Rust binary and ships minimal Alpine runtime.
- Runtime expects config at `/app/config/config.yml`.
- Template config is copied as `/app/config/config.example.yml`.

## Editing Guardrails

- Do not commit real credentials or environment-specific secrets.
- `config/config.yml` is local-only and gitignored.
- `.codex` is gitignored.
- Keep commit history logical (small, focused commits).
- If behavior changes, update docs in same change set.

## High-Value Future Improvements

- Add Rust unit/integration tests around:
  - command parsing/routing
  - topic extraction
  - JSON key flattening behavior
- Add CI job for `cargo fmt --check` and `cargo check`.
- Add configurable MQTT QoS/retain policy per topic class.
- Add controller-level timeout/poll overrides.
