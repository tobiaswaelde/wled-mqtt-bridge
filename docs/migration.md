# Migrating from the Rust bridge

Version 3 replaces the Rust runtime with NestJS and uses explicit instance topics from `config/config.yml`.

| Previous Rust topic | New topic |
| --- | --- |
| `wled/living-room/cmd` | `home/wled/living-room/cmd` |
| `wled/living-room/state` | `home/wled/living-room/state/...` |
| `wled/living-room/info` | `home/wled/living-room/info/...` |
| `wled/bridge_online` | one `home/wled/<instance>/connected` topic per configured instance |

There are no compatibility aliases. Update subscriptions and automations before replacing the container. The new configuration declares every controller in `instances[]`, so distinct devices can use unrelated MQTT roots.
