#!/bin/sh
set -e

# Docker volumes for /app/uploads are often root-owned; appuser must write avatars/QR/proofs.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/uploads/avatars /app/uploads/payment-qr /app/uploads/entry-proofs
  chown -R appuser:appuser /app/uploads
  exec gosu appuser "$0" "$@"
fi

cd /app

echo "[entrypoint] Checking required environment..."
python - <<'PY' || exit 1
import os
import sys

errors: list[str] = []

if not os.getenv("DATABASE_URL"):
    errors.append("DATABASE_URL is not set")

if os.getenv("APP_ENV", "").strip().lower() == "production":
    for key in ("JWT_SECRET_KEY", "JWT_REFRESH_SECRET"):
        value = os.getenv(key, "").strip()
        if len(value) < 43:
            errors.append(
                f"{key} must be set in Dokploy environment (length >= 43). "
                "Generate with: python backend/scripts/generate_secrets.py"
            )
    access = os.getenv("JWT_SECRET_KEY", "").strip()
    refresh = os.getenv("JWT_REFRESH_SECRET", "").strip()
    if access and refresh and access == refresh:
        errors.append("JWT_REFRESH_SECRET must differ from JWT_SECRET_KEY")

if errors:
    print("[entrypoint] FATAL: invalid production environment:", file=sys.stderr)
    for msg in errors:
        print(f"  - {msg}", file=sys.stderr)
    sys.exit(1)
PY

echo "[entrypoint] Running alembic upgrade head..."
if ! alembic upgrade head; then
  echo "[entrypoint] FATAL: alembic upgrade head failed (see traceback above)" >&2
  exit 1
fi

echo "[entrypoint] Starting application..."
exec "$@"
