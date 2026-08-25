# Authentication

WLED has no bridge-level authentication flow. Restrict access to the controller network with VLANs, firewall rules, and MQTT broker credentials. The configured WLED host must be reachable from the container.

This Node/Nest version intentionally replaces the previous Rust contract; update consumers to the explicit per-instance `topic` paths below.
