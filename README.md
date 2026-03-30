<div align="center">
  <img src="docs/public/logo.svg" alt="WLED MQTT Bridge" width="120" />

  # WLED MQTT Bridge

  [![Rust CI](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/rust-ci.yml/badge.svg)](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/rust-ci.yml)
  [![Docker Build](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/test-build.yml/badge.svg)](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/test-build.yml)
  [![Docker Deploy](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/deploy.yml/badge.svg)](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/deploy.yml)
  [![Version](https://img.shields.io/badge/version-2.0.3-blue.svg)](https://github.com/tobiaswaelde/wled-mqtt-bridge/blob/main/Cargo.toml)
  [![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/tobiaswaelde/wled-mqtt-bridge/blob/main/LICENSE.txt)

  Rust bridge between WLED controllers and MQTT topics.

  [Documentation](https://tobiaswaelde.github.io/wled-mqtt-bridge/) |
  [Getting Started](https://tobiaswaelde.github.io/wled-mqtt-bridge/getting-started) |
  [Configuration](https://tobiaswaelde.github.io/wled-mqtt-bridge/configuration) |
  [Deployment](https://tobiaswaelde.github.io/wled-mqtt-bridge/deployment)
</div>

## Table of Contents

- [Why this project](#why-this-project)
- [Features](#features)
- [Quick start](#quick-start)
- [Topic contract](#topic-contract)
- [Minimal configuration](#minimal-configuration)
- [Run locally (without Docker)](#run-locally-without-docker)
- [Documentation](#documentation)
- [Project files](#project-files)
- [Changelog](#changelog)
- [License](#license)

## Why this project

`wled-mqtt-bridge` polls one or more WLED controllers and publishes state, info, effects, and palettes to predictable MQTT topics. It also listens for command payloads per controller and forwards them to WLED.

Use it when you want one stable integration layer between WLED devices and systems like Home Assistant, Node-RED, or custom MQTT consumers.

## Features

- Multi-controller polling with independent runtime loops
- Predictable MQTT topic contract (`cmd`, `state`, `info`, `effects`, `palettes`, `online`)
- Typed config validation with startup invariants
- Dead-letter publishing for invalid commands
- Optional Prometheus metrics endpoint
- Docker-ready with multi-arch images (`linux/amd64`, `linux/arm64`)

## Quick start

### 1. Run with Docker Compose (recommended)

```bash
git clone https://github.com/tobiaswaelde/wled-mqtt-bridge.git
cd wled-mqtt-bridge
cp config/config.example.yml config/config.yml
# edit config/config.yml for your broker and controllers

docker compose up -d
```

### 2. Verify data flow

```bash
mosquitto_sub -h <mqtt-host> -t 'wled/#' -v
```

Optional command test:

```bash
mosquitto_pub -h <mqtt-host> -t 'wled/living-room/cmd' -m '{"on":true}'
```

## Topic contract

For:

- `mqtt.base_topic = wled`
- `controller.id = living-room`

Topics:

- Commands: `wled/living-room/cmd`
- Online: `wled/living-room/online`
- State: `wled/living-room/state`
- Info: `wled/living-room/info`
- Effects: `wled/living-room/effects`
- Palettes: `wled/living-room/palettes`

Bridge-level topics:

- `wled/bridge_online`
- `wled/dead_letter` (default suffix, configurable)

## Minimal configuration

```yaml
mqtt:
  host: localhost
  base_topic: wled

wled:
  controllers:
    - id: living-room
      host: 192.168.1.50
```

Full config reference: https://tobiaswaelde.github.io/wled-mqtt-bridge/configuration

## Run locally (without Docker)

```bash
cargo run -- --config config/config.yml
```

## Documentation

Docs are built with VitePress from `docs/`.

```bash
cd docs
npm install
npm run dev
```

Production docs are published via GitHub Pages:

- https://tobiaswaelde.github.io/wled-mqtt-bridge/

## Project files

- `src/` runtime and bridge logic
- `config/config.example.yml` starter config template
- `docs/` VitePress documentation source
- `Dockerfile` multi-stage Rust build with scratch runtime
- `compose.yml` local deployment template

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the MIT License.
See [LICENSE.txt](LICENSE.txt).
