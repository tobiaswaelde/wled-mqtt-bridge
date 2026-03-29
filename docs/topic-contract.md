# Topic Contract

With `mqtt.base_topic: wled`:

For controller `living-room`:

- Command topic: `wled/living-room/cmd`
- Online status: `wled/living-room/online`
- State object: `wled/living-room/state`
- Info object: `wled/living-room/info`
- Effects list: `wled/living-room/effects`
- Palettes list: `wled/living-room/palettes`

## Commands

Payload on `wled/living-room/cmd`:

```json
{ "cmd": "get_state" }
```

```json
{ "cmd": "set_state", "state": { "on": true } }
```
