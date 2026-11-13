#!/usr/bin/env bash
# Pencadangan database PostgreSQL (format kustom pg_dump).
# Pemakaian: DATABASE_URL="postgresql://..." ./scripts/backup.sh [/folder/tujuan]
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL wajib diset}"
DEST="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${DEST}/instaprint-monitor-${STAMP}.dump"

mkdir -p "$DEST"
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$FILE"
echo "Backup tersimpan: $FILE"
echo "Restore: pg_restore --clean --if-exists --no-owner --dbname=\"\$DATABASE_URL\" \"$FILE\""

# Simpan 14 backup terakhir
ls -1t "${DEST}"/instaprint-monitor-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
