### ####################
### BUILDER
### ####################
FROM rust:1.87-alpine AS build

RUN apk add --no-cache musl-dev pkgconfig openssl-dev

WORKDIR /app

COPY Cargo.toml .
COPY src ./src
COPY config ./config

RUN cargo build --release

### ####################
### RUNNER
### ####################
FROM alpine:3.21 AS runtime

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=build /app/target/release/wled-mqtt-bridge /app/wled-mqtt-bridge
COPY --from=build /app/config/config.example.yml /app/config/config.example.yml

CMD ["/app/wled-mqtt-bridge", "--config", "/app/config/config.yml"]
