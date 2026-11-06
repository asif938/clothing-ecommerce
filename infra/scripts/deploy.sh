#!/usr/bin/env bash
# Single-command VPS deploy: pull, migrate, build, restart.
# docs/PROJECT_SPEC.md §15.3.
#
# M9 note: this is NOT true zero-downtime — `docker compose up -d --build`
# briefly drops connections while it swaps each container (plain Compose
# has no rolling-restart primitive; that needs Swarm mode or a blue/green
# setup in front of Caddy, both real infra projects of their own). Decided
# against building either for a single-VPS early-stage deployment
# (docs/DECISIONS.md): Caddy's clients reconnect within the gap, and
# checkout's idempotency-key handling already makes a request that lands
# mid-restart safe to retry rather than double-order/double-charge.
set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../compose" && pwd)"
cd "$COMPOSE_DIR"

git pull --ff-only
docker compose -f docker-compose.vps.yml build
docker compose -f docker-compose.vps.yml run --rm api pnpm --filter @clothing/db migrate:deploy
docker compose -f docker-compose.vps.yml up -d
echo "Deploy complete."
