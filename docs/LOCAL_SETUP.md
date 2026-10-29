# Local setup

Exact, copy-pasteable steps to run this project on your own machine (Windows
or Mac). Each step below was actually run against this repository while
writing this doc — see **What was verified here** at the bottom for exactly
what that did and didn't cover.

## 1. Prerequisites

| Tool | Version | Check with |
|---|---|---|
| Node.js | ≥ 22 | `node -v` |
| pnpm | 11.18.0 (pinned via `packageManager` in `package.json`) | `pnpm -v` |
| Docker Desktop | any recent version | `docker -v` |
| Git | any recent version | `git -v` |

Install pnpm if you don't have it:

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
```

**Windows note:** use Git Bash, WSL, or PowerShell — all commands below work
in PowerShell too, but use Unix path separators as written if you're in Git
Bash/WSL. Docker Desktop must be running (its whale icon shows "running")
before step 3.

## 2. Clone and install dependencies

```bash
git clone <your-fork-or-remote-url> clothing-ecommerce
cd clothing-ecommerce
pnpm install
```

This installs dependencies for all three apps (`apps/api`, `apps/admin`,
`apps/storefront`) and all shared packages in one pnpm workspace — there is
nothing to install per-app.

## 3. Start infrastructure (Postgres, MinIO, MailHog)

```bash
docker compose -f infra/compose/docker-compose.dev.yml up -d
```

This starts:
- **Postgres 16** on `localhost:5432` (db `clothing_ecommerce`, user/pass
  `postgres`/`postgres`)
- **MinIO** (S3-compatible local storage) on `localhost:9000`
  (console on `:9001`, login `minioadmin`/`minioadmin`) — optional, only
  needed if you set `STORAGE_DRIVER=s3` later; the default `local` driver
  needs none of this
- **MailHog** (catches outgoing emails) on `localhost:8025` (web UI)

Confirm all three are healthy:

```bash
docker compose -f infra/compose/docker-compose.dev.yml ps
```

Redis is **not** started by default — it's optional (`--profile redis`);
the system runs on an in-memory cache + pg-boss queue without it.

## 4. Configure environment variables

Everything brand-specific (name, theme, shipping fees, payment rules, text)
lives in the database and is edited from the admin panel — these env vars
are infrastructure-only (`docs/PROJECT_SPEC.md` §4.1).

Generate an encryption key (used to encrypt secrets/provider credentials at
rest):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copy that value, then create four env files from the one template:

```bash
cp .env.example .env
cp .env.example apps/api/.env
```

Edit **both** `.env` and `apps/api/.env`, filling in the
`APP_ENCRYPTION_KEY=` line with the key you generated (keep the two files
identical — see **Why four env files** below).

Then create the two Next.js apps' env files (these only need one line each
— everything else they need is in the admin panel):

```bash
echo "API_URL=http://localhost:4000" > apps/admin/.env.local
echo "API_URL=http://localhost:4000" > apps/storefront/.env.local
```

All of `.env`, `apps/api/.env`, `apps/admin/.env.local`, and
`apps/storefront/.env.local` are git-ignored — nothing you put in them gets
committed.

### Why four env files

- `packages/db` (Prisma) and the root `turbo.json` read the **root** `.env`.
- `apps/api` runs via NestJS's `ConfigModule`, which loads `.env` relative
  to its own working directory — so it needs its own copy at
  `apps/api/.env`.
- `apps/admin` and `apps/storefront` are Next.js apps that only need to know
  where the API is (`API_URL`); they proxy every browser call to it
  server-side via a `rewrites()` rule in each app's `next.config.mjs`, so
  the browser never talks to the API directly and no `NEXT_PUBLIC_*`
  variable or CORS setup is needed for local dev.

## 5. Set up the database

```bash
pnpm db:migrate:deploy
pnpm db:seed
```

`db:seed` creates base data only (roles/permissions, Bangladesh divisions/
districts/areas, default settings). If you want a fully populated demo
brand (sample catalog, orders, etc.) instead:

```bash
pnpm db:seed:demo
```

(`pnpm db:migrate` — note: no `:deploy` — is the one to use later if you
change `schema.prisma` and want to generate a new dev migration instead of
applying existing ones.)

## 6. Run everything

```bash
pnpm dev
```

This starts all three apps in parallel via Turborepo:

| App | URL |
|---|---|
| Storefront | http://localhost:3000 |
| Admin panel | http://localhost:3001 |
| API | http://localhost:4000 (Swagger docs at `/api/docs`) |

Or run just one app at a time (each still needs the others' env vars/DB set
up if you're exercising cross-app flows):

```bash
pnpm dev:api
pnpm dev:admin
pnpm dev:storefront
```

First run ever: open http://localhost:3001 — the admin app will walk you
through creating the Super Admin account and store setup (no seed data
needed for this step; `pnpm db:seed` just gives you BD locations/roles to
build on).

## 7. Quick sanity checks

```bash
curl http://localhost:4000/health   # -> {"status":"ok",...}
curl http://localhost:4000/ready    # -> {"status":"ok",...} once Postgres is reachable
```

If `/ready` reports `"database":{"status":"down",...}` with a "can't reach
database server" message, Postgres isn't reachable yet — check
`docker compose -f infra/compose/docker-compose.dev.yml ps` and that
`DATABASE_URL` in both `.env` files matches the compose file's credentials.

## 8. Common commands

```bash
pnpm build         # build all apps/packages
pnpm lint           # ESLint, whole workspace
pnpm typecheck       # tsc --noEmit, whole workspace
pnpm test             # Vitest unit tests, whole workspace
pnpm test:integration  # API integration tests (needs the Postgres container running)
pnpm db:seed           # re-seed base data (safe to re-run; it's idempotent)
```

To stop infrastructure when you're done:

```bash
docker compose -f infra/compose/docker-compose.dev.yml down
```

Add `-v` to also delete the Postgres/MinIO volumes (full reset — you'll
need to re-run `db:migrate:deploy` + `db:seed` after).

## Troubleshooting

- **`pnpm install` fails on a native module** — make sure you're on Node
  ≥ 22 (`node -v`); this project does not support older Node versions.
- **Port already in use (3000/3001/4000/5432)** — something else on your
  machine is bound to it; stop that process or change the port (API: `PORT`
  env var; admin/storefront: edit the `--port` flag in that app's
  `package.json` `dev`/`start` scripts, and update `API_URL`/`STOREFRONT_URL`/
  `ADMIN_URL` accordingly).
- **Admin/storefront pages 404 or show stale data** — they call the API
  through a server-side proxy; if the API isn't up yet (or Postgres isn't
  reachable), pages that need data from it will fail even though the
  Next.js dev server itself is running. Check `/health` and `/ready` first.
- **`DATABASE_URL`/`DATABASE_DIRECT_URL` mismatch** — both must point at the
  same Postgres instance for local dev (they only differ on platforms like
  Supabase/Neon that need a separate direct/pooled connection string).

---

## What was verified here

Run on 2026-10-24, on this machine, against the actual commands above
(Docker was unavailable in earlier work on this project — this was the
first pass with it on hand):

- ✅ `pnpm install` — workspace already installed, dependency tree intact.
- ✅ Generated a real `APP_ENCRYPTION_KEY`, created all four env files as
  described, confirmed all four are git-ignored (`git check-ignore -v`).
- ✅ `pnpm db:generate` — Prisma client regenerated cleanly from
  `packages/db/prisma/schema.prisma`.
- ✅ `pnpm dev:api` boots cleanly with no live database: `/health` → `200`,
  `/ready` → `503` with a clean "can't reach database server" message (not
  a crash), `/api/docs` (Swagger) → `200`, `/api/v1/store/auth/me` → `200`.
  Confirms the API's documented graceful-degradation behavior.
- ✅ `pnpm dev:admin` and `pnpm dev:storefront` both boot cleanly, pick up
  their own `.env.local`, and serve a locale-prefixed page
  (`http://localhost:3001/en/login` → `200`).
- ⚠️ **Not run in this pass:** `docker compose ... up -d` against a real
  Postgres/MinIO/MailHog, `pnpm db:migrate:deploy`/`pnpm db:seed`, and the
  full click-through (setup wizard → login → browse → add to cart →
  checkout). This machine's sandbox does not have the Docker daemon
  reachable from the tool that wrote this doc. **If you're reading this and
  have Docker Desktop actually running, that gap is exactly steps 3 and 5
  above — please run them once and open an issue/note in
  `docs/DECISIONS.md` if anything in this doc doesn't match what you see.**

This mirrors the same caveat already recorded in `docs/PROGRESS.md` for
Milestones 0–1: every piece of the stack has been exercised individually
(unit tests, a live boot with no DB), but the single end-to-end run with a
real Postgres container has not yet happened in this working environment.
