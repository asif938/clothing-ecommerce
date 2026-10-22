# Deployment

**Status: draft — full version written in Milestone 9 (§16 M9).** This is a
placeholder covering what exists today; do not treat it as a complete runbook
yet.

## Local development

```
cp .env.example .env            # fill in APP_ENCRYPTION_KEY at minimum
docker compose -f infra/compose/docker-compose.dev.yml up -d
pnpm install
pnpm dev
```

Starts Postgres, MinIO (S3-compatible storage) and MailHog on the ports in
`infra/compose/docker-compose.dev.yml`, then all three apps via Turborepo
(storefront :3000, admin :3001, api :4000).

**Not yet verified end-to-end** (see `docs/PROGRESS.md`, Milestone 0 known
issues) — the compose file and app wiring are written to spec but the
implementation environment had no Docker available to confirm the full
local stack boots.

## Free-tier hosting (§15.2)

Planned, not yet deployed anywhere: Vercel (storefront + admin), Render
free web service (API, Docker), Neon or Supabase (Postgres), pg-boss on the
same Postgres (job queue, no Redis required), Cloudflare R2 (file storage),
Brevo or SMTP (email), GitHub Actions scheduled workflow or cron-job.org
(external cron for `/public/cron/:task` and keep-alive pings).

**Important caveat to carry into the real runbook:** Vercel's Hobby plan is
for non-commercial personal use only. A live commercial store needs Vercel
Pro, or VPS mode below. The admin System Health page must surface this
warning when `NODE_ENV=production` and `HOSTING_TIER=free` (tracked for
Milestone 1/9).

## VPS mode (§15.3)

`infra/compose/docker-compose.vps.yml` + `infra/compose/Caddyfile.example` +
`infra/docker/Dockerfile.{api,storefront,admin}` are scaffolded but
untested. `infra/scripts/deploy.sh` runs build → migrate → restart but is
not yet zero-downtime (see `docs/DECISIONS.md`).

## Backups (§15.4)

`infra/scripts/backup.sh` / `restore.sh` work standalone against any
`DATABASE_URL`. R2 upload, 30-day retention and a scheduled restore test are
not implemented yet (due Milestone 9).
