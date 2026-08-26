# Docker deployment

Create a writable local configuration directory. Cloud bridges need it to persist authentication files safely.

```yaml
services:
  wled-mqtt-bridge:
    image: ghcr.io/tobiaswaelde/wled-mqtt-bridge:latest
    restart: unless-stopped
    volumes:
      - ./config:/app/config
    ports:
      - "${PORT:-3000}:${PORT:-3000}"
```

Run `docker compose up -d`. Compose runs the container as the local `UID:GID`, so cloud-authentication files can be written back to the mounted `config/` directory. Export those values on systems where Docker does not provide them automatically. For bridges without browser authentication, the port can be removed when health checks run inside the Docker network. Use a fixed image version in production.
