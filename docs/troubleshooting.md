# Troubleshooting

## No MQTT updates

- Verify `mqtt.host` and credentials
- Check broker ACL permissions for read/write on `<base_topic>/#`

## WLED offline

- Ensure each `wled.controllers[].host` points to the correct device IP
- Verify `http://<wled-host>/json/state` is reachable
