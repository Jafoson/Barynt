#!/bin/sh
# Entrypoint of the app image: apply pending database migrations, then start
# the app (the image's CMD) — so changing the image tag is the whole update.
#
#   MIGRATE_ON_START=false   skip it (the database is migrated elsewhere,
#                            e.g. the separate barynt-migrate image/job)
#   MIGRATE_DATABASE_URL     connect with this instead of DATABASE_URL — for a
#                            database user that may change the schema while the
#                            app's own user may not
#
# `prisma migrate deploy` takes a database-wide advisory lock, so replicas
# starting at the same time wait for each other and apply each migration
# once; with nothing pending it only reads the migrations table.
set -e

if [ "${MIGRATE_ON_START:-true}" != "false" ]; then
  cd /opt/migrate
  export DATABASE_URL="${MIGRATE_DATABASE_URL:-$DATABASE_URL}"
  attempt=1
  # The database may still be coming up (compose, a fresh cluster).
  until bun prisma migrate deploy; do
    if [ "$attempt" -ge 10 ]; then
      echo "[entrypoint] migrations failed after $attempt attempts" >&2
      exit 1
    fi
    echo "[entrypoint] migrate deploy failed, retrying ($attempt/10)" >&2
    attempt=$((attempt + 1))
    sleep 3
  done
  bun prisma/bootstrap.ts
  cd /app
fi

exec "$@"
