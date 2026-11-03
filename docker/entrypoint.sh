#!/bin/sh
set -eu

attempts="${MIGRATE_ATTEMPTS:-30}"
i=1
until node --experimental-strip-types lib/db/migrate.mts; do
  if [ "$i" -ge "$attempts" ]; then
    echo "database migrations failed" >&2
    exit 1
  fi
  i=$((i + 1))
  sleep 2
done

exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
