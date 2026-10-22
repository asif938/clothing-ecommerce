#!/usr/bin/env bash
# Entry point for the `backup` sidecar in docker-compose.vps.yml: runs
# backup.sh once a day. TODO (Milestone 9): upload the result to R2 and
# prune anything older than 30 days.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while true; do
  bash "$SCRIPT_DIR/backup.sh" /backups || echo "backup failed, will retry tomorrow"
  sleep 86400
done
