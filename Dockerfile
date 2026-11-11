# syntax=docker/dockerfile:1

# ---- Build: install the workspace, build the widget, the app and the migrator.
FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/widget/package.json packages/widget/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @tattle/widget build \
 && pnpm --filter web build \
 && pnpm --filter web build:migrate

# ---- Run: only the bundled server, the migrator and the SQL migrations.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STORAGE_DIR=/data/storage \
    MIGRATIONS_DIR=/app/drizzle
COPY --from=build /repo/apps/web/.output ./.output
COPY --from=build /repo/apps/web/dist/migrate.mjs ./migrate.mjs
COPY --from=build /repo/apps/web/drizzle ./drizzle
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 3000
# Hosting panels may set PORT themselves: the check follows it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" >/dev/null || exit 1
CMD ["sh", "-c", "node migrate.mjs && exec node .output/server/index.mjs"]
