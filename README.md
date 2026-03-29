# WLED-MQTT bridge

![Docker Build](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/test-build.yml/badge.svg)
![Docker Deploy](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/deploy.yml/badge.svg)
![Version](https://img.shields.io/github/v/tag/tobiaswaelde/wled-mqtt-bridge?label=version)

A lightweight Rust service that connects multiple [WLED](https://kno.wled.ge/) controllers with MQTT.

## Quick Start (Docker Compose)

```bash
git clone https://github.com/tobiaswaelde/wled-mqtt-bridge.git
cd wled-mqtt-bridge
cp config/config.example.yml config/config.yml
# edit config/config.yml

docker compose up -d
```

## Daily Use

Status:

```bash
docker compose ps
```

Logs:

```bash
docker compose logs -f wled-mqtt-bridge
```

Update:

```bash
docker compose pull
docker compose up -d
```

Optional: pin an image version

```bash
IMAGE_TAG=v1.0.2 docker compose up -d
```

## Configuration (for users)

Main fields in `config/config.yml`:

- `mqtt.host`, `mqtt.port`, `mqtt.username`, `mqtt.password`
- `mqtt.base_topic`
- `mqtt.dead_letter_suffix`
- `wled.controllers[]` with `id` + `host`

Example:

```yaml
mqtt:
  protocol: mqtt
  host: 192.168.1.10
  port: 1883
  username: mqtt-user
  password: mqtt-password
  base_topic: wled
  dead_letter_suffix: dead_letter

wled:
  controllers:
    - id: living-room
      host: 192.168.1.50
    - id: office
      host: 192.168.1.51
```

## MQTT Topics

For controller `living-room`:

- `wled/living-room/cmd`
- `wled/living-room/online`
- `wled/living-room/state`
- `wled/living-room/info`
- `wled/living-room/effects`
- `wled/living-room/palettes`

Bridge availability:

- `wled/bridge_online`

Dead-letter (default):

- `wled/dead_letter`

## Optional Metrics

Enable in config:

```yaml
metrics:
  enabled: true
  host: 0.0.0.0
  port: 9090
  path: /metrics
```

Then scrape:

```text
http://<host>:9090/metrics
```

## Container Images

- Multi-arch images are published for `linux/amd64` and `linux/arm64`
- Images are signed with Cosign (keyless)
- SPDX SBOM artifacts are generated during image publish

## Documentation

Full docs are in `docs/` and published via GitHub Pages.

- User docs start at [`docs/index.md`](docs/index.md)
- Developer details are on [`docs/developer.md`](docs/developer.md)

## For Developers (moved down intentionally)

Local run:

```bash
cargo run -- --config config/config.yml
```

Checks:

```bash
cargo fmt --all
cargo check
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
