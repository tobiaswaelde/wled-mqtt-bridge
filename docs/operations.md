# Operations

## Day-to-day commands

Start:

```bash
docker compose up -d
```

Status:

```bash
docker compose ps
```

Logs:

```bash
docker compose logs -f wled-mqtt-bridge
```

Update image:

```bash
docker compose pull
docker compose up -d
```

## Healthcheck

The container runs an internal healthcheck using:

```text
wled-mqtt-bridge --config /app/config/config.yml --healthcheck
```

## Failure And Recovery Flow

```mermaid
sequenceDiagram
  participant B as Bridge
  participant M as MQTT Broker
  participant W as WLED Controller

  Note over B,M: Normal operation
  B->>M: connect + subscribe <base_topic>/+/cmd
  B->>M: publish <base_topic>/bridge_online=true
  B->>W: poll /json/state + /json/info
  B->>M: publish <base_topic>/<controller_id>/state|info
  B->>M: publish <base_topic>/<controller_id>/online=true

  alt MQTT connection drops
    M--xB: connection lost
    Note over M: Last Will sets <base_topic>/bridge_online=false
    B->>B: eventloop retries reconnect
    B->>M: reconnect (ConnAck)
    B->>M: publish <base_topic>/bridge_online=true
  else WLED controller unreachable
    W--xB: HTTP request failures
    B->>M: publish <base_topic>/<controller_id>/online=false
    B->>B: switch to timeout_duration_ms after timeout_ms
    W-->>B: HTTP responses recover
    B->>M: publish <base_topic>/<controller_id>/online=true
    B->>B: return to interval_ms
  end
```
