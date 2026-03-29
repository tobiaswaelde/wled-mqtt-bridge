# Configuration

Runtime configuration is loaded from YAML or JSON.

Default path: `config/config.yml`

## Example

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
