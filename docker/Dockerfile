# syntax=docker/dockerfile:1

FROM node:22-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/client/package.json packages/client/
COPY packages/db/package.json packages/db/
COPY packages/schema/package.json packages/schema/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile
COPY apps ./apps
COPY packages ./packages
RUN pnpm turbo run build --filter=@edicthq/server --filter=@edicthq/web
RUN pnpm deploy --filter=@edicthq/server --prod /srv

FROM node:22-slim AS app
WORKDIR /srv
COPY --from=build /srv /srv
COPY --from=build /repo/apps/web/dist /srv/web
ENV NODE_ENV=production
ENV WEB_DIR=/srv/web
# Attachments (ADR 0020). The compose file mounts a volume here; the image
# creates it for the node user, so a fresh volume starts writable.
ENV DATA_DIR=/srv/data
RUN mkdir -p /srv/data && chown node:node /srv/data
EXPOSE 3000
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]
