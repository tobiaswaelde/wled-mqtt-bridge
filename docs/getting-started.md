# Getting Started

This guide is for users who want to run the bridge with Docker Compose.

## 1. Prepare files

```bash
git clone https://github.com/tobiaswaelde/wled-mqtt-bridge.git
cd wled-mqtt-bridge
cp config/config.example.yml config/config.yml
```

## 2. Configure your environment

Edit `config/config.yml` and set:

- `mqtt.host`
- `mqtt.username` / `mqtt.password` (if required)
- `wled.controllers[]` (all controllers you want to bridge)

## 3. Start with Docker Compose

```bash
docker compose up -d
```

Optional: run a pinned image version

```bash
IMAGE_TAG=v1.0.2 docker compose up -d
```

## 4. Verify it is running

```bash
docker compose ps
```

Optional: watch logs

```bash
docker compose logs -f wled-mqtt-bridge
```
