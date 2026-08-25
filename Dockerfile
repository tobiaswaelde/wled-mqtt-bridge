FROM node:25-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.24.0
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY docs/package.json docs/package.json
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm build && rm -f dist/*.map

FROM node:25-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production CONFIG_FILE=/app/config/config.yml
COPY --from=build /app/dist ./dist
COPY config/config.example.yml /app/config/config.example.yml
RUN useradd --system --uid 10001 bridge && chown -R bridge:bridge /app
USER bridge
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
