#!/usr/bin/env bash
# Deploy Card Collection to VPS (rsync + build + pm2 restart).
# Usage: ./deploy/rsync-deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${DEPLOY_HOST:-root@213.199.59.71}"
DEST="${DEPLOY_PATH:-/var/www/card-collection}"

# IMPORTANT: exclude only the root uploads data dir (/uploads).
# A bare "uploads" pattern also drops src/app/api/uploads (image serving routes).
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude '.env*' \
  --exclude '/uploads' \
  --exclude '/uploads/**' \
  --exclude '/backups' \
  --exclude '/backups/**' \
  --exclude '.DS_Store' \
  --exclude 'bimat' \
  "$ROOT/" "$REMOTE:$DEST/"

ssh "$REMOTE" "set -e
cd '$DEST'
npm ci
npx prisma generate
npm run build
pm2 restart card-collection
pm2 save
"
