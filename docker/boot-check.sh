#!/bin/sh
# Boots an image against an empty Postgres and waits for /health, which
# answers once migrations have run. CI runs it on every build of the image,
# and the release on each platform's image before tagging it.
#   docker/boot-check.sh <image>
set -eu
image="$1"
docker network create edict-boot >/dev/null
docker run -d --name edict-boot-db --network edict-boot \
  -e POSTGRES_USER=edict -e POSTGRES_PASSWORD=edict -e POSTGRES_DB=edict postgres:18-alpine >/dev/null
# Over TCP, which Postgres only opens once its first-start setup is done.
for _ in $(seq 1 30); do
  if docker exec edict-boot-db pg_isready -q -h 127.0.0.1 -U edict -d edict; then break; fi
  sleep 1
done
docker run -d --name edict-boot-app --network edict-boot -p 3000:3000 \
  -e DATABASE_URL=postgres://edict:edict@edict-boot-db:5432/edict \
  -e BETTER_AUTH_URL=http://localhost:3000 \
  "$image" >/dev/null
for _ in $(seq 1 60); do
  if curl -fsS http://localhost:3000/health; then
    echo
    exit 0
  fi
  sleep 2
done
docker logs edict-boot-app
exit 1
