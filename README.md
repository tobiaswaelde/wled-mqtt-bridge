# WLED-MQTT bridge

![Docker Build](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/test-build.yml/badge.svg)
![Docker Deploy](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/deploy.yml/badge.svg)
![Version](https://img.shields.io/github/v/tag/tobiaswaelde/wled-mqtt-bridge?label=version)

A lightweight Rust service that connects a [WLED](https://kno.wled.ge/) instance with MQTT.

## Features

- Supports multiple WLED controllers in one bridge process
- Polls each WLED controller for:
  - `/json/state` -> `<base_topic>/<controller_id>/state`
  - `/json/info` -> `<base_topic>/<controller_id>/info`
  - `/json/eff` -> `<base_topic>/<controller_id>/effects`
  - `/json/pal` -> `<base_topic>/<controller_id>/palettes`
- Supports MQTT commands on `<base_topic>/<controller_id>/cmd`:
  - `set_state`, `get_state`, `get_info`, `get_effects`, `get_palettes`
- Adaptive polling:
  - normal poll interval while healthy
  - timeout interval after consecutive failures
- Publishes online status to `<base_topic>/online`
- Docker-ready runtime

## Quick Start

```bash
cp config/config.example.yml config/config.yml
# edit config/config.yml
cargo run -- --config config/config.yml
```

## Docker

```bash
docker build -t wled-mqtt-bridge .
```

```bash
docker run --rm -v $(pwd)/config:/app/config wled-mqtt-bridge
```

## Configuration

Configuration is loaded from `config/config.yml` (YAML or JSON).

Example structure:

```yaml
mqtt:
  protocol: mqtt
  host: 127.0.0.1
  port: 1883
  base_topic: wled

wled:
  controllers:
    - id: living-room
      host: 192.168.1.50
    - id: office
      host: 192.168.1.51

polling:
  interval_ms: 1000
  timeout_ms: 30000
  timeout_duration_ms: 30000

publish:
  json_object: true
  json_keys: true
```

## Commands

Command payloads are JSON on `<base_topic>/<controller_id>/cmd`.

Get state:

```json
{ "cmd": "get_state" }
```

Set state:

```json
{ "cmd": "set_state", "state": { "on": true } }
```

## Docs

A VitePress docs structure is available in `docs/`.

```bash
cd docs
npm install
npm run dev
```

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
