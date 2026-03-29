# Developer

This page collects development and contribution details.

## Local development (without Docker)

```bash
cargo run -- --config config/config.yml
```

## Quality checks

```bash
cargo fmt --all
cargo check
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

## Project structure

- `src/main.rs`: CLI, bootstrap, logging
- `src/config.rs`: config model + validation
- `src/bridge.rs`: MQTT event loop, polling loops, command routing

## CI and release

- `rust-ci.yml`: fmt, clippy, check, tests
- `pages.yml`: docs build + GitHub Pages deploy
- `release.yml`: GitHub release on pushed `v*` tags (+ changelog seed on manual dispatch)
- `deploy.yml`: Docker publish on pushed tags

## Runtime additions

- Dead-letter topic: `<base_topic>/<dead_letter_suffix>`
- Optional metrics endpoint: `metrics.enabled` + `metrics.path`
- Per-controller polling overrides via `wled.controllers[]`
- QoS/retain tuning via `publish.qos.*` and `publish.retain.*`

## Notes for contributors

- Keep MQTT topic contract stable unless explicitly changed
- Update docs and `config/config.example.yml` with config changes
- Keep commits focused and logically separated
