#!/bin/sh
set -e
cd /app
echo "[entrypoint] Running alembic upgrade head..."
alembic upgrade head
echo "[entrypoint] Starting application..."
exec "$@"
