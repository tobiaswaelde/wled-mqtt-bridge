# Troubleshooting

## Container is not healthy

- Check logs: `docker compose logs wled-mqtt-bridge`
- Verify `config/config.yml` exists and is valid YAML
- Confirm MQTT broker is reachable from Docker host

## No MQTT updates

- Verify `mqtt.host`, credentials, and port
- Check broker ACL permissions for `<base_topic>/#`
- Confirm clients subscribe to the correct controller topics

## WLED controller stays offline

- Ensure `wled.controllers[].host` points to the correct device IP
- Verify `http://<wled-host>/json/state` is reachable
- Check if controller ID in config matches expected topic namespace
