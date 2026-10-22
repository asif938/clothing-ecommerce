#!/usr/bin/env bash
# Single-command VPS deploy: pull, migrate, build, zero-downtime restart.
# docs/PROJECT_SPEC.md §15.3. TODO (Milestone 9): make the restart actually
# zero-downtime (currently a plain `up -d --build`, which briefly drops
# connections during the swap).
set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../compose" && pwd)"
cd "$COMPOSE_DIR"

git pull --ff-only
docker compose -f docker-compose.vps.yml build
docker compose -f docker-compose.vps.yml run --rm api pnpm --filter @clothing/db migrate:deploy
docker compose -f docker-compose.vps.yml up -d
echo "Deploy complete."
