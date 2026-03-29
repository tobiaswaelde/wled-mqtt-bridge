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

Example:

```bash
IMAGE_TAG=v1.0.2 docker compose up -d
```

## Runtime limits and logs

`compose.yml` already includes:

- container healthcheck
- log rotation (`max-size`, `max-file`)
- CPU and memory limits
