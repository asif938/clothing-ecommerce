#!/usr/bin/env bash
# Entry point for the `backup` sidecar in docker-compose.vps.yml: runs
# backup.sh once a day, uploads the result to R2, and prunes local copies
# older than 30 days (docs/PROJECT_SPEC.md §15.4). Runs on the
# `postgres:16-alpine` image (see docker-compose.vps.yml), which has
# neither `aws` nor `curl` preinstalled — installed once here instead of
# baking a custom image, since this container only runs once a day.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID must be set}"
: "${R2_BUCKET:?R2_BUCKET must be set}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID must be set}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY must be set}"
: "${API_URL:?API_URL must be set}"
: "${CRON_SECRET:?CRON_SECRET must be set}"

apk add --no-cache aws-cli curl >/dev/null

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

while true; do
  if bash "$SCRIPT_DIR/backup.sh" /backups; then
    LATEST=$(ls -t /backups/backup-*.sql.gz | head -n1)
    if aws s3 cp "$LATEST" "s3://$R2_BUCKET/db-backups/$(basename "$LATEST")" --endpoint-url "$R2_ENDPOINT"; then
      curl -fsS -X POST "$API_URL/api/v1/public/cron/backup-heartbeat" -H "X-Cron-Secret: $CRON_SECRET" || echo "heartbeat call failed (backup itself still succeeded)"
    else
      echo "R2 upload failed — not reporting a heartbeat for this backup"
    fi
    # 30-day local retention; R2's own bucket lifecycle rule prunes the remote copies (docs/DEPLOYMENT.md).
    find /backups -name 'backup-*.sql.gz' -mtime +30 -delete
  else
    echo "backup failed, will retry tomorrow"
  fi
  sleep 86400
done
