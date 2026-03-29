# Deployment

## Recommended: Docker Compose

The repository includes `compose.yml` for standard operation.

Start:

```bash
docker compose up -d
```

Stop:

```bash
docker compose down
```

Restart:

```bash
docker compose restart wled-mqtt-bridge
```

## Image

Default image:

```text
ghcr.io/tobiaswaelde/wled-mqtt-bridge:latest
```

For fixed rollouts, pin a version tag instead of `latest`.
