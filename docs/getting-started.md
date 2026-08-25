# Getting started

1. Copy `config/config.example.yml` to `config/config.yml`.
2. Enter the broker and device/account data.
3. Start the service with `docker compose up -d`.
4. Watch `<instance.topic>/#` with Mosquitto.

The container exposes `GET /health` on the configured HTTP port. It only needs a host port mapping when a health probe or browser authentication must reach it.
