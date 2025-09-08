# WLED-MQTT bridge

![Docker Build](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/test-build.yml/badge.svg)
![Docker Deploy](https://github.com/tobiaswaelde/wled-mqtt-bridge/actions/workflows/deploy.yml/badge.svg)
![Version](https://img.shields.io/github/v/tag/tobiaswaelde/wled-mqtt-bridge?label=version)

A lightweight Node.js service that connects a [WLED](https://kno.wled.ge/) instance with MQTT.

It polls WLED for **state**, **info**, **effects**, and **palettes**, then publishes updates to MQTT.
You can also send commands via MQTT to control WLED (set state, fetch info, etc.).

## 📚 Table Of Contents <!-- omit in toc -->
- [✨ Features](#-features)
- [⚙️ Configuration](#️-configuration)
  - [🌍 Environment Variables](#-environment-variables)
- [🚀 Deployment](#-deployment)
  - [🐋 Docker](#-docker)
- [📡 API](#-api)
  - [Commands](#commands)
- [📦 Changelog](#-changelog)


## ✨ Features
- 🔌 Simple bridge between **WLED** and **MQTT**
- 📡 Publishes:
  - State (`/json/state`) → `${TOPIC}/state`
  - Info (`/json/info`) → `${TOPIC}/info`
  - Effects (`/json/eff`) → `${TOPIC}/effects`
  - Palettes (`/json/pal`) → `${TOPIC}/palettes`
- 🕒 Adaptive polling:
  - Polls at `WLED_POLL_INTERVAL` while healthy
  - Falls back to `WLED_TIMEOUT_DURATION` polling if WLED is unreachable for `WLED_TIMEOUT`
- 🎛️ Supports MQTT commands:
  - `set_state`, `get_state`, `get_info`, `get_effects`, `get_palettes`
- 🐳 Ready-to-use **Docker image**

## ⚙️ Configuration

### 🌍 Environment Variables
| Variable              | Type   | Required | Default Value | Description                                                       |
| --------------------- | ------ | -------- | ------------- | ----------------------------------------------------------------- |
| MQTT_PROTOCOL         | string | no       | `'mqtt'`      | Protocol for MQTT connection                                      |
| MQTT_HOST             | string | yes      |               | MQTT broker hostname or IP                                        |
| MQTT_PORT             | number | no       | `1883`        | MQTT broker port                                                  |
| MQTT_USERNAME         | string | yes      |               | MQTT username                                                     |
| MQTT_PASSWORD         | string | yes      |               | MQTT password                                                     |
| MQTT_CLIENTID         | string | no       | random UUID   | MQTT client ID                                                    |
| WLED_HOST             | string | yes      |               | Hostname or IP of the WLED device (e.g., `http://192.168.1.50`)   |
| TOPIC                 | string | yes      |               | MQTT topic prefix for WLED messages                               |
| WLED_POLL_INTERVAL    | number | no       | `1000`        | Poll interval in ms when WLED is available                        |
| WLED_TIMEOUT          | number | no       | `30000`       | Time (ms) of consecutive failures before increasing poll interval |
| WLED_TIMEOUT_DURATION | number | no       | `30000`       | Poll interval in ms after timeout                                 |
| PUSH_JSON_OBJECT      | bool   | no       | `true`        | If `true`, publish WLED state/info as full JSON objects           |
| PUSH_JSON_KEYS        | bool   | no       | `true`        | If `true`, also publish individual JSON keys as MQTT topics       |

## 🚀 Deployment

### 🐋 Docker

```yaml
services:
  wled-mqtt-bridge:
    container_name: wled-mqtt-bridge
    image: ghcr.io/tobiaswaelde/wled-mqtt-bridge
    restart: always
    environment:
      MQTT_PROTOCOL: mqtt
      MQTT_HOST: 192.168.1.10
      MQTT_PORT: 1883
      MQTT_USERNAME: username
      MQTT_PASSWORD: password
      WLED_HOST: 192.168.178.11
      TOPIC: wled
```

## 📡 API

### Commands

Commands are sent via the MQTT topic:

```bash
${TOPIC}/cmd
```

After a command is executed, the value is reset to `null`.

#### Set state
Update WLED state and automatically publish the new state to `${TOPIC}/state`.

##### Command
```jsonc
// ${TOPIC}/cmd
{
  "cmd": "set_state",
  "state": {
    "on": "t"
  }
}
```

#### Get state
Fetch current state and publish to `${TOPIC}/state`.

##### Command
```jsonc
// ${TOPIC}/cmd
{ "cmd": "get_state" }
```

##### Response
```jsonc
// ${TOPIC}/state
{
  "on": true,
  "bri": 127,
  "transition": 7,
  "ps": -1,
  "pl": -1,
  "nl": {
    "on": false,
    "dur": 60,
    "fade": true,
    "tbri": 0
  },
  "udpn": {
    "send": false,
    "recv": true
  },
  "seg": [{
    "start": 0,
    "stop": 20,
    "len": 20,
    "col": [
      [255, 160, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ],
    "fx": 0,
    "sx": 127,
    "ix": 127,
    "pal": 0,
    "sel": true,
    "rev": false,
    "cln": -1
  }]
}
```

#### Get info
Fetch WLED controller information and publish to `${TOPIC}/info`.

##### Command
```jsonc
// ${TOPIC}/cmd
{ "cmd": "get_info" }
```

##### Response
```jsonc
// ${TOPIC}/info
{
  "ver": "0.8.4",
  "vid": 1903252,
  "leds": {
    "count": 20,
    "rgbw": true,
    "pin": [2],
    "pwr": 0,
    "maxpwr": 65000,
    "maxseg": 1
  },
  "name": "WLED Light",
  "udpport": 21324,
  "live": false,
  "fxcount": 80,
  "palcount": 47,
  "arch": "esp8266",
  "core": "2_4_2",
  "freeheap": 13264,
  "uptime": 17985,
  "opt": 127,
  "brand": "WLED",
  "product": "DIY light",
  "btype": "src",
  "mac": "60019423b441"
}
```

#### Get effects
Fetch WLED effects array and publish to `${TOPIC}/effects`

##### Command
```jsonc
// ${TOPIC}/cmd
{ "cmd": "get_effects" }
```

##### Response
```jsonc
// ${TOPIC}/effects
[
  "Solid", "Blink", "Breathe", "Wipe", "Wipe Random", "Random Colors", "Sweep", "Dynamic", "Colorloop", "Rainbow", "Scan", "Dual Scan", "Fade", "Chase", "Chase Rainbow", "Running", "Saw", "Twinkle", "Dissolve", "Dissolve Rnd", "Sparkle", "Dark Sparkle", "Sparkle+", "Strobe", "Strobe Rainbow", "Mega Strobe", "Blink Rainbow", "Android", "Chase", "Chase Random", "Chase Rainbow", "Chase Flash", "Chase Flash Rnd", "Rainbow Runner", "Colorful", "Traffic Light", "Sweep Random", "Running 2", "Red & Blue","Stream", "Scanner", "Lighthouse", "Fireworks", "Rain", "Merry Christmas", "Fire Flicker", "Gradient", "Loading", "In Out", "In In", "Out Out", "Out In", "Circus", "Halloween", "Tri Chase", "Tri Wipe", "Tri Fade", "Lightning", "ICU", "Multi Comet", "Dual Scanner", "Stream 2", "Oscillate", "Pride 2015", "Juggle", "Palette", "Fire 2012", "Colorwaves", "BPM", "Fill Noise", "Noise 1", "Noise 2", "Noise 3", "Noise 4", "Colortwinkle", "Lake", "Meteor", "Smooth Meteor", "Railway", "Ripple"
]
```

#### Get palettes
Fetch WLED palatte names array and publish to `${TOPIC}/palettes`.

##### Command
```jsonc
// ${TOPIC}/cmd
{ "cmd": "get_palettes" }
```

###### Response
```jsonc
// ${TOPIC}/palettes
[
  "Default", "Random Cycle", "Primary Color", "Based on Primary", "Set Colors", "Based on Set", "Party", "Cloud", "Lava", "Ocean", "Forest", "Rainbow", "Rainbow Bands", "Sunset", "Rivendell", "Breeze", "Red & Blue", "Yellowout", "Analogous", "Splash", "Pastel", "Sunset 2", "Beech", "Vintage", "Departure", "Landscape", "Beach", "Sherbet", "Hult", "Hult 64", "Drywet", "Jul", "Grintage", "Rewhi", "Tertiary", "Fire", "Icefire", "Cyane", "Light Pink", "Autumn", "Magenta", "Magred", "Yelmag", "Yelblu", "Orange & Teal", "Tiamat", "April Night"
]
```

## 📦 Changelog

See the [CHANGELOG.md](./CHANGELOG.md) for details on what’s new in recent versions.