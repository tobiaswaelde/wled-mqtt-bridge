# Architecture

- Rust async runtime (`tokio`)
- MQTT client (`rumqttc`)
- WLED HTTP client (`reqwest`)
- YAML/JSON config loader with validation

Main loop:

1. Subscribe to `<base_topic>/cmd`
2. Poll WLED state/info on interval
3. Publish to MQTT topics
4. Process commands and reset cmd topic
