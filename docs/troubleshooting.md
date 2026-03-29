# Troubleshooting

## No MQTT updates

- Verify `mqtt.host` and credentials
- Check broker ACL permissions for read/write on `<base_topic>/#`

## WLED offline

- Ensure `wled.host` points to the device IP
- Verify `http://<wled-host>/json/state` is reachable
