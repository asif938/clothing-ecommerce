#!/usr/bin/env bash
# Restores a gzipped pg_dump produced by backup.sh. Destructive — always
# confirm the target DATABASE_URL before running. docs/PROJECT_SPEC.md §15.4.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
FILE="${1:?Usage: restore.sh <backup.sql.gz>}"

echo "About to restore $FILE into:"
echo "  $DATABASE_URL"
read -r -p "Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

gunzip -c "$FILE" | psql "$DATABASE_URL"
echo "Restore complete."
