#!/usr/bin/env bash
# Backup Card Collection: Postgres + uploads/
# Usage: ./deploy/backup-card-collection.sh [--force]
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUPS_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
CONFIG_FILE="$BACKUPS_DIR/config.json"
FORCE="${1:-}"

mkdir -p "$BACKUPS_DIR"

if [[ ! -f "$CONFIG_FILE" ]]; then
  cat >"$CONFIG_FILE" <<'EOF'
{
  "autoEnabled": true,
  "keepCount": 14,
  "label": "daily"
}
EOF
fi

if [[ "$FORCE" != "--force" ]]; then
  AUTO_ENABLED="$(python3 - <<'PY' "$CONFIG_FILE"
import json,sys
with open(sys.argv[1]) as f:
    cfg=json.load(f)
print("1" if cfg.get("autoEnabled", True) else "0")
PY
)"
  if [[ "$AUTO_ENABLED" != "1" ]]; then
    echo "[backup] auto disabled — skip"
    exit 0
  fi
fi

if [[ -f "$APP_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/.env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[backup] DATABASE_URL missing" >&2
  exit 1
fi

# Prisma URLs often include ?schema=public — strip for libpq tools.
PG_URL="${DATABASE_URL%%\?*}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUPS_DIR/$STAMP"
mkdir -p "$TARGET"

echo "[backup] dumping database…"
pg_dump --no-owner --no-acl --format=custom --file="$TARGET/database.dump" "$PG_URL"

echo "[backup] archiving uploads…"
if [[ -d "$APP_DIR/uploads" ]]; then
  tar -C "$APP_DIR" -czf "$TARGET/uploads.tar.gz" uploads
else
  tar -czf "$TARGET/uploads.tar.gz" --files-from /dev/null
fi

DB_SIZE="$(stat -c%s "$TARGET/database.dump" 2>/dev/null || stat -f%z "$TARGET/database.dump")"
UP_SIZE="$(stat -c%s "$TARGET/uploads.tar.gz" 2>/dev/null || stat -f%z "$TARGET/uploads.tar.gz")"
TOTAL=$((DB_SIZE + UP_SIZE))
TRIGGER="auto"
if [[ "$FORCE" == "--force" ]]; then
  TRIGGER="manual"
fi

python3 - <<PY
import json
meta = {
  "id": "$STAMP",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "trigger": "$TRIGGER",
  "databaseBytes": $DB_SIZE,
  "uploadsBytes": $UP_SIZE,
  "totalBytes": $TOTAL,
  "appDir": "$APP_DIR",
}
with open("$TARGET/meta.json", "w") as f:
    json.dump(meta, f, indent=2)
print(json.dumps(meta))
PY

KEEP_COUNT="$(python3 - <<'PY' "$CONFIG_FILE"
import json,sys
with open(sys.argv[1]) as f:
    cfg=json.load(f)
print(int(cfg.get("keepCount", 14)))
PY
)"

echo "[backup] pruning — keep last $KEEP_COUNT…"
mapfile -t ALL < <(find "$BACKUPS_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r)
if ((${#ALL[@]} > KEEP_COUNT)); then
  for OLD in "${ALL[@]:KEEP_COUNT}"; do
    rm -rf "$BACKUPS_DIR/$OLD"
    echo "[backup] removed $OLD"
  done
fi

echo "[backup] done → $TARGET"
