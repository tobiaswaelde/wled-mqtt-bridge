# Configuration

Runtime configuration is loaded from `config/config.yml`.

## Minimal user example

```yaml
mqtt:
  protocol: mqtt
  host: 192.168.1.10
  port: 1883
  username: mqtt-user
  password: mqtt-password
  base_topic: wled

wled:
  controllers:
    - id: living-room
      host: 192.168.1.50
    - id: office
      host: 192.168.1.51
```

## Important fields

- `mqtt.base_topic`: topic root used by all bridge topics
- `wled.controllers[].id`: unique topic segment per controller
- `wled.controllers[].host`: controller address
- `polling.interval_ms`: normal polling interval
- `polling.timeout_ms`: failure duration before slow polling starts
- `polling.timeout_duration_ms`: polling interval during degraded mode

## Validation rules

- `wled.controllers[]` is required
- each controller ID must be unique
- controller IDs must not contain `/`
