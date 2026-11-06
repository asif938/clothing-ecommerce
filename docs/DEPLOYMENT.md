# Deployment

Everything infra-level the project needs lives as code in `infra/` and
`.github/workflows/`; this page is the runbook that ties it together.
Nothing here is verified end-to-end against a real cloud account — the
environment this project was built in has no Docker, no live Postgres,
and no real merchant/courier/cloud credentials (see `docs/PROGRESS.md`'s
"Not verified in this environment" note on every milestone). Everything
below is written to spec and self-consistent; treat the first real deploy
as the actual test, not this document.

## Local development

```
cp .env.example .env            # fill in APP_ENCRYPTION_KEY at minimum
docker compose -f infra/compose/docker-compose.dev.yml up -d
pnpm install
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed              # roles, permissions, BD locations
pnpm db:seed:demo         # + "Demo Fashion" brand + a small browsable catalog
pnpm dev
```

Starts Postgres 16 (with `citext`/`pg_trgm`), MinIO (S3-compatible
storage) and MailHog on the ports in `infra/compose/docker-compose.dev.yml`,
then all three apps via Turborepo (storefront `:3000`, admin `:3001`, api
`:4000`). Generate `APP_ENCRYPTION_KEY` with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Free-tier hosting (§15.2 — start here)

| Component | Service | Notes |
| --- | --- | --- |
| Storefront + Admin | Vercel Hobby (dev/staging) or Pro (live) | Hobby is for non-commercial personal use only — a live commercial store needs Pro. Set `API_URL` to the Render API's public URL, `STOREFRONT_URL`/`ADMIN_URL` to each app's own Vercel URL. |
| API | Render free web service, `infra/docker/Dockerfile.api` | Spins down after ~15 min idle; first request after that can take ~30s. The external cron below also serves as a keep-alive ping. |
| PostgreSQL | Neon or Supabase free tier | Use the *pooled* connection string for `DATABASE_URL`; `DATABASE_DIRECT_URL` is the direct (non-pooled) one, used only for migrations. Enable `pg_trgm` if the provider doesn't already (the init migration does `CREATE EXTENSION IF NOT EXISTS`, so a normal `migrate deploy` handles it). |
| Job queue | pg-boss, same Postgres | No Redis required (`WORKER_MODE=embedded`). |
| Cache | In-memory | Lost on restart — acceptable for facet counts, public-config, usage-check caches, all of which recompute cheaply. |
| Search | Postgres full-text + trigram | Switch to Meilisearch later via `MEILI_URL`/`MEILI_KEY`, no code change. |
| File storage | Cloudflare R2 | `STORAGE_DRIVER=s3`, `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, public bucket behind a custom domain for `S3_PUBLIC_URL`. |
| Email | Brevo free tier or SMTP | Configure as a provider instance in Integrations, not an env var — mind Brevo's daily send limit. |
| External cron | GitHub Actions scheduled workflow or cron-job.org | Hits `GET /health` every 10 min (keep-alive) and `POST /public/cron/:task` every 5 min with header `X-Cron-Secret: $CRON_SECRET` (releases expired stock reservations, polls courier status, runs scheduled CMS publishing). |
| Backups | `.github/workflows/backup.yml` | Needs repo secrets `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `API_URL`, `CRON_SECRET` — see below. |
| Monitoring | Sentry free tier (`SENTRY_DSN`, optional) + UptimeRobot (optional) | |

Deploy steps once accounts exist: create the Neon/Supabase database, run
`pnpm db:migrate:deploy` and `pnpm db:seed` against it from a machine with
network access to it (a one-off GitHub Actions run or a local `.env`
pointed at the pooled URL both work), set every app's env vars on its
host, deploy all three apps, then fill in the admin setup wizard (`/setup`
on the admin app) to create the Super Admin and confirm 2FA.

**Hosting-tier warning**: the admin's System Health page should surface
"Vercel Hobby is non-commercial" when `NODE_ENV=production` and
`HOSTING_TIER=free` — tracked as a real gap in `docs/PROGRESS.md`
(M1's System Health page doesn't carry this specific warning yet).

## VPS mode (§15.3 — later, for real traffic)

```
infra/compose/docker-compose.vps.yml   # Caddy, storefront, admin, api, worker, postgres, backup sidecar, optional redis/meilisearch
infra/compose/Caddyfile.example        # copy to Caddyfile, fill in the real domains
infra/docker/Dockerfile.{api,storefront,admin}
infra/scripts/deploy.sh                # pull → migrate → build → restart
```

```
cp infra/compose/Caddyfile.example infra/compose/Caddyfile   # edit domains
cp .env.example infra/compose/.env                           # fill in every value, HOSTING_TIER=vps
bash infra/scripts/deploy.sh
```

Switching from free to VPS mode is env-only (`HOSTING_TIER=vps`,
`WORKER_MODE=separate` to run the job worker as its own process instead of
embedded in the API, plus `REDIS_URL`/`MEILI_URL` if adopting either) — no
application code changes. Recommended starting point: a Singapore-region
VPS, 2–4 vCPU, 4–8 GB RAM, with Cloudflare in front for DNS/CDN/WAF.

`deploy.sh`'s restart is **not** true zero-downtime (plain Docker Compose
has no rolling-restart primitive) — see the comment in the script itself
for why that's an accepted trade-off at this scale rather than an
oversight, and what would actually be needed (Swarm mode or a blue/green
setup) if request volume ever justifies it.

### Migrating free → VPS

1. `pg_dump` the Neon/Supabase database (`infra/scripts/backup.sh`),
   restore it into the new VPS Postgres (or managed Postgres) with
   `infra/scripts/restore.sh`.
2. File storage stays on R2 regardless of mode — no migration needed.
3. Point DNS at the VPS (Caddy handles TLS via Let's Encrypt
   automatically once the domains resolve).
4. Update `DATABASE_URL`/`HOSTING_TIER`/`WORKER_MODE` and redeploy.

## Backups and restore (§15.4)

- **Free mode**: `.github/workflows/backup.yml` runs daily, dumps the
  production database, uploads it to R2 under `db-backups/`, and reports
  success to `POST /public/cron/backup-heartbeat` (which the admin
  **Launch checklist** page checks — "backups running" goes green once a
  backup has reported within the last 48 hours). Set a lifecycle rule on
  the R2 bucket for 30-day expiry of objects under `db-backups/`.
- **VPS mode**: the `backup` sidecar in `docker-compose.vps.yml` runs
  `infra/scripts/backup-cron.sh` daily — same dump, same R2 upload, same
  heartbeat call, plus local 30-day pruning in the container's own
  `/backups` volume.
- **Restore**: `DATABASE_URL=<target> infra/scripts/restore.sh <file>` — always
  test a restore into a *throwaway* database first, never directly into
  production. **Run this monthly** against the latest backup as the
  actual restore-test the spec calls for; there's no automated job for
  it, deliberately — restoring into a scratch DB and diffing row counts
  isn't something to run unattended with production credentials.

## Launch checklist

The admin panel's **Launch checklist** page (`/launch-checklist`,
`launch_checklist.read`) checks real system state for: policy pages
filled in, a live (non-mock) payment/courier/SMS provider enabled,
tracking configured and actually firing, a backup reported in the last 48
hours, and every staff account past 2FA setup. The one item it can't
check itself is submitting `sitemap.xml` to Google/Bing Search Console —
mark that done on the same page once you have.

## Environment variables

See `.env.example` for the full, current list with comments — this file
is the one source of truth for infra-only env vars (`DATABASE_URL`,
`APP_ENCRYPTION_KEY`, the app URLs, storage/backup credentials, optional
Redis/Meilisearch/Sentry). Everything else (brand, theme, shipping rates,
payment rules, message templates, every integration's own credentials) is
configured from the admin panel and stored in the `settings` /
`provider_instances` tables, never in env vars.
