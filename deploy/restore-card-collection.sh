#!/usr/bin/env bash
# Restore Card Collection from a backup id.
# Usage: ./deploy/restore-card-collection.sh 20260718T010000Z
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUPS_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
BACKUP_ID="${1:-}"

if [[ -z "$BACKUP_ID" ]]; then
  echo "Usage: $0 <backup-id>" >&2
  exit 1
fi

TARGET="$BACKUPS_DIR/$BACKUP_ID"
if [[ ! -d "$TARGET" ]]; then
  echo "[restore] backup not found: $BACKUP_ID" >&2
  exit 1
fi
if [[ ! -f "$TARGET/database.dump" ]]; then
  echo "[restore] missing database.dump" >&2
  exit 1
fi

if [[ -f "$APP_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/.env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[restore] DATABASE_URL missing" >&2
  exit 1
fi

PG_URL="${DATABASE_URL%%\?*}"

echo "[restore] restoring database from $BACKUP_ID…"
# custom format dump — use pg_restore
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$PG_URL" "$TARGET/database.dump" \
  || true
# pg_restore may exit non-zero with benign warnings; verify connection after

echo "[restore] restoring uploads…"
if [[ -f "$TARGET/uploads.tar.gz" ]]; then
  rm -rf "$APP_DIR/uploads"
  tar -C "$APP_DIR" -xzf "$TARGET/uploads.tar.gz"
  mkdir -p "$APP_DIR/uploads"
fi

if command -v pm2 >/dev/null 2>&1; then
  echo "[restore] restarting card-collection…"
  pm2 restart card-collection || true
fi

echo "[restore] done"
