# MQTT contract

Each controller keeps one persistent WebSocket and publishes `<topic>/connected`, `json`, flattened `state/... ` and `info/... `, plus `effects` and `palettes`. The complete WLED segment array is additionally published as JSON to `<topic>/state/seg`.

Publish a WLED JSON state object to `<topic>/cmd`:

```json
{ "on": true, "bri": 180 }
```

The bridge adds WLED's `v: true` flag and receives the resulting state from the existing socket.

All command publications must be non-retained. The bridge clears a successfully received command topic with an empty payload.
