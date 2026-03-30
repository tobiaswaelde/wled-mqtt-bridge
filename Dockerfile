## syntax=docker/dockerfile:1.7

### ####################
### BUILDER
### ####################
FROM rust:1.87-alpine AS build

RUN apk add --no-cache musl-dev pkgconfig openssl-dev ca-certificates

WORKDIR /app

COPY Cargo.toml .
COPY Cargo.lock .
COPY src ./src
COPY config ./config

# Build a fully static amd64 binary so the publish workflow can run natively.
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/app/target,sharing=locked \
    set -eux; \
    rustup target add x86_64-unknown-linux-musl; \
    cargo build --release --locked --target x86_64-unknown-linux-musl; \
    cp /app/target/x86_64-unknown-linux-musl/release/wled-mqtt-bridge /app/wled-mqtt-bridge

### ####################
### RUNNER
### ####################
FROM scratch AS runtime

WORKDIR /app

COPY --from=build /app/wled-mqtt-bridge /app/wled-mqtt-bridge
COPY --from=build /app/config/config.example.yml /app/config/config.example.yml
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/app/wled-mqtt-bridge", "--config", "/app/config/config.yml", "--healthcheck"]

USER 10001:10001

CMD ["/app/wled-mqtt-bridge", "--config", "/app/config/config.yml"]
