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
  dead_letter_suffix: dead_letter

wled:
  controllers:
    - id: living-room
      host: 192.168.1.50
    - id: office
      host: 192.168.1.51
```

## Important fields

- `mqtt.base_topic`: topic root used by all bridge topics
- `mqtt.dead_letter_suffix`: topic suffix for invalid command/error payloads
- `mqtt.reconnect_delay_secs`: initial reconnect delay after MQTT event-loop errors
- `mqtt.reconnect_max_delay_secs`: max delay for exponential MQTT reconnect backoff
- `wled.controllers[].id`: unique topic segment per controller
- `wled.controllers[].host`: controller address
- `wled.controllers[].interval_ms|timeout_ms|timeout_duration_ms`: optional per-controller polling override
- `wled.http_timeout_ms`: optional global timeout for WLED HTTP requests
- `wled.controllers[].http_timeout_ms`: optional per-controller override for WLED HTTP request timeout
- `polling.interval_ms`: normal polling interval
- `polling.timeout_ms`: failure duration before slow polling starts
- `polling.timeout_duration_ms`: polling interval during degraded mode

## Optional advanced sections

- `publish.qos.*`: QoS per topic class (0, 1, 2)
- `publish.retain.*`: retain flag per topic class
- `metrics.*`: optional Prometheus endpoint (`enabled`, `host`, `port`, `path`)

## Validation rules

- `wled.controllers[]` is required
- each controller ID must be unique
- controller IDs must not contain `/`
- unknown config keys are rejected
- `mqtt.protocol` must be `mqtt` or `mqtts`
- important duration/interval values must be greater than `0`
