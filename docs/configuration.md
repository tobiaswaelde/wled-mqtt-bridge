# Configuration

All bridges use the same top-level shape:

```yaml
mqtt:
  host: mqtt.example.net
  clientId: wled-mqtt-bridge
instances:
  - id: unique-instance-name
    enabled: true
    topic: home/example
    # device-specific fields
```

- `mqtt` configures the single shared broker connection.
- `mqtt.clientId` may be empty; the bridge generates a UUID for the running process.
- HTTP settings are environment variables: `HOST` defaults to `0.0.0.0`, `PORT` defaults to `3000`, and `CORS_ORIGIN` defaults to `*`. Dotenv loads `.env` from the working directory; Docker Compose environment values take precedence.
- Every `instances[].id` and `instances[].topic` must be unique.

## WLED MQTT Bridge example

```yaml
mqtt:
  host: mqtt.example.net
  clientId: wled-mqtt-bridge
  username: mqtt-user
  password: change-me
instances:
  - id: desk
    topic: home/wled/desk
    host: 192.168.1.30
    pingInterval: 15000
    pongTimeout: 5000
    reconnectInterval: 15000
  - id: kitchen
    topic: home/wled/kitchen
    host: 192.168.1.31
```

Do not commit passwords, API usernames, or generated `*.auth.json` files.
