---
layout: home

hero:
  name: WLED MQTT Bridge
  text: Instant MQTT control for WLED controllers
  tagline: One persistent WebSocket per controller, predictable MQTT topics, and Docker-ready deployment.
  image:
    src: /logo.svg
    alt: WLED MQTT Bridge logo
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: MQTT contract
      link: /mqtt

features:
  - title: Low-latency state
    details: State and device information arrive over WLED's persistent WebSocket instead of repeated polling.
  - title: Predictable commands
    details: Send JSON to one command topic and receive the resulting WLED state immediately.
  - title: Multiple controllers
    details: Define independent controllers and MQTT topics in one configuration file.
---

Every installation is defined in `config/config.yml`. Continue with [configuration](/configuration), the [MQTT contract](/mqtt), or [Docker deployment](/deployment).
