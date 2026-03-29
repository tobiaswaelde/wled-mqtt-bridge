# WLED MQTT Bridge

Rust bridge that polls multiple WLED controllers and publishes them to MQTT.

## What it does

- Polls `/json/state` and `/json/info` continuously for each controller
- Loads `/json/eff` and `/json/pal` on startup for each controller
- Executes MQTT commands from `<base_topic>/<controller_id>/cmd`
- Publishes online/offline status to `<base_topic>/<controller_id>/online`

## Next

- [Getting Started](./getting-started)
- [Configuration](./configuration)
- [Topic Contract](./topic-contract)
