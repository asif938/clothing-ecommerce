#!/usr/bin/env bash
# Logical backup (pg_dump) to a local file. In VPS mode the `backup` sidecar
# runs this on a schedule and uploads to R2; in free mode a GitHub Actions
# workflow runs the same command against the managed Postgres URL.
# docs/PROJECT_SPEC.md §15.4. TODO (Milestone 9): wire up R2 upload + 30-day
# retention + monthly restore-test job.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
FILE="$OUT_DIR/backup-$TIMESTAMP.sql.gz"

pg_dump "$DATABASE_URL" | gzip > "$FILE"
echo "Backup written to $FILE"
