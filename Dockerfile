# =============================================================================
# Build stage
# =============================================================================

# Bundle the application in a disposable build stage.
FROM node:25-bookworm-slim AS build
WORKDIR /app

# -----------------------------------------------------------------------------
# Build dependencies
# -----------------------------------------------------------------------------

# Keep the package manager version deterministic for local and CI builds.
RUN npm install --global pnpm@11.24.0

# Copy manifests first so dependency installation remains cacheable.
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY docs/package.json docs/package.json
RUN pnpm install --frozen-lockfile=false

# -----------------------------------------------------------------------------
# Application bundle
# -----------------------------------------------------------------------------

# Build the production bundle and discard source maps from the runtime artifact.
COPY . .
RUN pnpm build && rm -f dist/*.map

# =============================================================================
# Runtime stage
# =============================================================================

# Run only the compiled bridge and its example configuration in the final image.
FROM node:25-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production CONFIG_FILE=/app/config/config.yml

COPY --from=build /app/dist ./dist
COPY config/config.example.yml /app/config/config.example.yml

# The mounted config directory stays writable by the unprivileged bridge user.
RUN useradd --system --uid 10001 bridge && chown -R bridge:bridge /app
USER bridge

# -----------------------------------------------------------------------------
# Health check
# -----------------------------------------------------------------------------

# Node provides fetch natively; probe Nest's local liveness endpoint on the configured HTTP port.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? '3000') + '/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
