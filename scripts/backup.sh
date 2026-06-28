#!/usr/bin/env bash
# Planly database + uploads backup script.
# Run via cron: 0 * * * * /path/to/backup.sh >> /var/log/planly-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups/planly}"
DB_CONTAINER="${DB_CONTAINER:-planly-db-1}"
UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DEST="$BACKUP_DIR/$TIMESTAMP"

mkdir -p "$DEST"

echo "[$(date)] Starting backup → $DEST"

# ── Database dump ──────────────────────────────────────────────────────────────
echo "[$(date)] Dumping database..."
docker exec "$DB_CONTAINER" pg_dump -U planly planly \
  | gzip > "$DEST/db.sql.gz"
echo "[$(date)] Database dump complete ($(du -sh "$DEST/db.sql.gz" | cut -f1))"

# ── Uploads snapshot ───────────────────────────────────────────────────────────
if [ -d "$UPLOADS_DIR" ]; then
  echo "[$(date)] Archiving uploads..."
  tar -czf "$DEST/uploads.tar.gz" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")"
  echo "[$(date)] Uploads archive complete ($(du -sh "$DEST/uploads.tar.gz" | cut -f1))"
fi

# ── Optional: sync to S3 ──────────────────────────────────────────────────────
if [ -n "${S3_BUCKET:-}" ]; then
  echo "[$(date)] Syncing to s3://$S3_BUCKET/planly/"
  aws s3 cp "$DEST/db.sql.gz" "s3://$S3_BUCKET/planly/$TIMESTAMP/db.sql.gz"
  [ -f "$DEST/uploads.tar.gz" ] && aws s3 cp "$DEST/uploads.tar.gz" "s3://$S3_BUCKET/planly/$TIMESTAMP/uploads.tar.gz"
fi

# ── Prune old local backups ────────────────────────────────────────────────────
echo "[$(date)] Pruning backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} + || true

echo "[$(date)] Backup complete."
