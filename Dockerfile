## syntax=docker/dockerfile:1.7

### ####################
### BUILDER
### ####################
FROM rust:1.87-alpine AS build

RUN apk add --no-cache musl-dev pkgconfig openssl-dev ca-certificates

WORKDIR /app

ARG TARGETARCH

COPY Cargo.toml .
COPY Cargo.lock .
COPY src ./src
COPY config ./config

# Build a fully static binary for a scratch runtime for the current target arch.
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/app/target,sharing=locked \
    set -eux; \
    case "${TARGETARCH}" in \
      amd64) RUST_TARGET="x86_64-unknown-linux-musl" ;; \
      arm64) RUST_TARGET="aarch64-unknown-linux-musl" ;; \
      *) echo "unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    rustup target add "${RUST_TARGET}"; \
    cargo build --release --locked --target "${RUST_TARGET}"; \
    cp "/app/target/${RUST_TARGET}/release/wled-mqtt-bridge" /app/wled-mqtt-bridge

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
