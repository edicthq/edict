# syntax=docker/dockerfile:1
# docs.edict.dev: the static export of the docs site behind nginx, as Dokploy
# runs it on the project's VPS. Built from the repository root:
#   docker build -f apps/docs/Dockerfile .
FROM node:22-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/docs/package.json apps/docs/
RUN pnpm install --frozen-lockfile --filter @edicthq/docs
COPY apps/docs ./apps/docs
RUN pnpm --filter @edicthq/docs run build

FROM nginx:1.29-alpine
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/docs/out /usr/share/nginx/html
