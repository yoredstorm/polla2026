#!/bin/sh
set -e

# Docker volumes for /app/uploads are often root-owned; appuser must write avatars/QR/proofs.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/uploads/avatars /app/uploads/payment-qr /app/uploads/entry-proofs
  chown -R appuser:appuser /app/uploads
  exec runuser -u appuser -- "$0" "$@"
fi

cd /app
echo "[entrypoint] Running alembic upgrade head..."
alembic upgrade head
echo "[entrypoint] Starting application..."
exec "$@"
