# syntax=docker/dockerfile:1
# The telemetry collector (ADR 0026), built from the repository root:
#   docker build -f apps/telemetry/Dockerfile .
FROM node:22-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/telemetry/package.json apps/telemetry/
COPY packages/schema/package.json packages/schema/
RUN pnpm install --frozen-lockfile --filter @edicthq/telemetry...
COPY apps/telemetry ./apps/telemetry
COPY packages/schema ./packages/schema
RUN pnpm --filter @edicthq/schema run build && pnpm --filter @edicthq/telemetry run build
RUN pnpm deploy --filter=@edicthq/telemetry --prod /srv

FROM node:22-slim AS app
WORKDIR /srv
COPY --from=build /srv /srv
ENV NODE_ENV=production
EXPOSE 3000
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]
