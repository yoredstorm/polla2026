#!/bin/sh
# Daily backup: PostgreSQL dump + avatar uploads archive.
set -eu

STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p /backups/db /backups/uploads

export PGPASSWORD="${POSTGRES_PASSWORD}"

echo "[backup] ${STAMP} — dumping database ${POSTGRES_DB}..."
pg_dump -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  | gzip > "/backups/db/polla_db_${STAMP}.sql.gz"

if [ -d /uploads/avatars ] && [ -n "$(ls -A /uploads/avatars 2>/dev/null || true)" ]; then
  echo "[backup] ${STAMP} — archiving avatar uploads..."
  tar -czf "/backups/uploads/avatars_${STAMP}.tar.gz" -C /uploads avatars
else
  echo "[backup] ${STAMP} — no custom avatars to archive (skipping)."
fi

RETENTION="${BACKUP_RETENTION_DAYS:-30}"
if [ "${RETENTION}" -gt 0 ] 2>/dev/null; then
  find /backups/db -name '*.sql.gz' -mtime +"${RETENTION}" -delete 2>/dev/null || true
  find /backups/uploads -name '*.tar.gz' -mtime +"${RETENTION}" -delete 2>/dev/null || true
  echo "[backup] pruned files older than ${RETENTION} days."
fi

echo "[backup] ${STAMP} — finished at $(date -Iseconds 2>/dev/null || date)"
