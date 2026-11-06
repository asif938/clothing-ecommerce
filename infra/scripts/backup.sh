#!/usr/bin/env bash
# Logical backup (pg_dump) to a local file. In VPS mode the `backup`
# sidecar (backup-cron.sh) runs this daily, then uploads the result to R2
# and prunes local copies older than 30 days; in free mode
# .github/workflows/backup.yml does the equivalent against the managed
# Postgres URL. docs/PROJECT_SPEC.md §15.4. The monthly restore-test is a
# runbook step (docs/DEPLOYMENT.md), not automated — restoring into a
# scratch database and diffing row counts isn't something to run
# unattended against production credentials.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
FILE="$OUT_DIR/backup-$TIMESTAMP.sql.gz"

pg_dump "$DATABASE_URL" | gzip > "$FILE"
echo "Backup written to $FILE"
