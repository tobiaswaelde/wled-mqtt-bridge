# WLED MQTT Bridge

[![CI](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/ci.yml) [![Docs](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/pages.yml/badge.svg)](https://tobiaswaelde.github.io/wled-mqtt-bridge/) [![Deploy](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/deploy.yml/badge.svg)](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/deploy.yml)

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-tobiaswaelde-FFDD00?style=for-the-badge&logo=buymeacoffee)](https://www.buymeacoffee.com/tobiaswaelde)

NestJS bridge between multiple WLED controllers and MQTT. Full documentation: [tobiaswaelde.github.io/wled-mqtt-bridge](https://tobiaswaelde.github.io/wled-mqtt-bridge/).

## Quick start

```bash
cp config/config.example.yml config/config.yml
# edit config/config.yml
docker compose up -d
```

Minimal configuration:

```yaml
mqtt:
  host: mqtt.example.net
  clientId: wled-mqtt-bridge
  username: mqtt-user
  password: change-me
http:
  port: 3000
logging:
  level: log
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

`mqtt.clientId` may be empty; the bridge then generates a UUID for the running process.

Example command:

```bash
mosquitto_pub -h mqtt.example.net -t 'home/wled/desk/cmd' -m '{"on":true,"bri":180}'
```

See the [configuration](https://tobiaswaelde.github.io/wled-mqtt-bridge/configuration), [MQTT contract](https://tobiaswaelde.github.io/wled-mqtt-bridge/mqtt), [authentication](https://tobiaswaelde.github.io/wled-mqtt-bridge/authentication), and [deployment guide](https://tobiaswaelde.github.io/wled-mqtt-bridge/deployment).
