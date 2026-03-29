# Getting Started

## 1. Create config

```bash
cp config/config.example.yml config/config.yml
```

## 2. Edit runtime values

- `mqtt.host`
- `mqtt.username` / `mqtt.password`
- `wled.controllers`

## 3. Run locally

```bash
cargo run -- --config config/config.yml
```
