#!/bin/sh
# Reinicia todas las tablas de la polla (usuarios, apuestas, pollas, retos, etc.).
# Uso: CONFIRM_RESET=yes docker compose --profile tools run --rm db-reset
#
# Solo para marcha blanca / entornos de prueba. Haz backup antes en producción.

set -eu

if [ "${CONFIRM_RESET:-}" != "yes" ]; then
  echo "ERROR: Debes definir CONFIRM_RESET=yes para ejecutar este script."
  echo "Ejemplo: CONFIRM_RESET=yes docker compose --profile tools run --rm db-reset"
  exit 1
fi

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-polla_user}"
PGDATABASE="${PGDATABASE:-polla_db}"

echo "==> Vaciamiento de tablas en ${PGHOST}/${PGDATABASE}..."
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f /scripts/reset.sql

if [ "${SKIP_REDIS:-}" != "1" ]; then
  REDIS_HOST="${REDIS_HOST:-redis}"
  REDIS_PORT="${REDIS_PORT:-6379}"
  if [ -n "${REDIS_PASSWORD:-}" ]; then
    echo "==> Limpiando Redis (${REDIS_HOST})..."
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" FLUSHDB
  else
    echo "WARN: REDIS_PASSWORD no definido; omitiendo FLUSHDB."
  fi
else
  echo "==> SKIP_REDIS=1: Redis no modificado."
fi

echo "==> Listo. Reinicia el backend para auto-cargar fixtures y claves JWT si hace falta."
echo "    1) Registra un usuario nuevo"
echo "    2) Promueve admin: docker compose exec postgres psql -U polla_user -d polla_db -c \"UPDATE users SET is_admin = true WHERE username = 'TU_USUARIO';\""
echo "    3) Crea la polla en /admin/groups"
echo "    (Opcional) Borra uploads: docker volume rm sistema_polla_uploads_data"
