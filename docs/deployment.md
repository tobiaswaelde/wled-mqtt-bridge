# Deployment

## Docker

```bash
docker build -t wled-mqtt-bridge .
```

```bash
docker run --rm -v $(pwd)/config:/app/config wled-mqtt-bridge
```
