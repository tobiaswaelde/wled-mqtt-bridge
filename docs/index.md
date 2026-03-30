---
layout: home
hero:
  name: WLED MQTT Bridge
  text: Reliable WLED ↔ MQTT integration
  tagline: Poll multiple WLED controllers, publish structured MQTT topics, and forward JSON commands back to devices.
  image:
    src: /logo.svg
    alt: WLED MQTT Bridge logo
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Configuration Reference
      link: /configuration
    - theme: alt
      text: Deployment Guide
      link: /deployment
features:
  - title: Deterministic Topic Contract
    details: "Each controller publishes to predictable MQTT paths: state, info, effects, palettes, online, and command topics."
  - title: Built for Operations
    details: Includes dead-letter handling, resilient reconnect loops, optional metrics endpoint, and healthcheck mode for runtime monitoring.
  - title: Production-Ready Containers
    details: Multi-stage Docker build with small runtime image, GHCR publishing for linux/amd64, and CI container smoke tests.
  - title: Fast Integration
    details: Use with Home Assistant, Node-RED, or custom MQTT consumers without writing custom WLED polling glue code.
---

## Quick links

- [Getting Started](/getting-started)
- [Configuration](/configuration)
- [Topic Contract](/topic-contract)
- [Operations](/operations)
- [Troubleshooting](/troubleshooting)
- [Developer](/developer)
