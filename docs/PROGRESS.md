# Progress log

Updated after every milestone. See `docs/PROJECT_SPEC.md` §16 for the full
milestone plan and acceptance criteria, and `docs/DECISIONS.md` for the
reasoning behind choices made along the way.

---

## Milestone 0 — Repository and tooling

**Status: in progress.**

### Built

- Monorepo layout per §3.2: `apps/{storefront,admin,api}`, `packages/{db,
  shared,sdk,ui,blocks,email-templates,config}`, `infra/{docker,compose,
  scripts,loadtest}`, `docs/`, `e2e/`.
- `pnpm-workspace.yaml`, `turbo.json`, root `package.json` with workspace
  scripts (`dev`, `build`, `lint`, `typecheck`, `test`, `db:*`, `sdk:generate`,
  `e2e`).
- Shared config package (`packages/config`): ESLint flat configs
  (base/next/nest), Prettier config, TS base configs (base/nextjs/nestjs),
  Tailwind preset driven by CSS variables (no hardcoded brand colors).
- `apps/api` (NestJS): bootstraps with Pino logging, Swagger at `/api/docs`
  (non-production only), global prefix `/api/v1` excluding `/health` and
  `/ready`. `HealthModule` implements liveness (`/health`) and readiness
  (`/ready`, checks DB via `SELECT 1`) using `@nestjs/terminus`, with a unit
  test covering up/down/liveness cases (Vitest + SWC, see DECISIONS.md).
- `apps/storefront` and `apps/admin` (Next.js 15 / React 19 App Router):
  single placeholder home page each, Tailwind wired to the shared preset and
  CSS-variable theme tokens, `transpilePackages` set for workspace packages.
- `packages/db`: Prisma schema with datasource/generator only (no models
  yet — intentional, see DECISIONS.md), seed script stub (`--demo` flag
  recognized, not implemented).
- `packages/shared`, `packages/ui`, `packages/sdk`, `packages/blocks`,
  `packages/email-templates`: package scaffolding only (package.json,
  tsconfig, a placeholder export, and for `shared` a passing Vitest smoke
  test) — real content starts Milestone 1/3/7.
- `infra/compose/docker-compose.dev.yml`: Postgres 16 (with `pg_trgm`,
  `citext`, best-effort `unaccent`), MinIO, MailHog; Redis behind an opt-in
  `redis` profile.
- `infra/compose/docker-compose.vps.yml` + `Caddyfile.example` +
  `infra/docker/Dockerfile.{api,storefront,admin}`: VPS-mode scaffolding
  (§15.3) — builds are wired, but this has **not been run or tested** (no
  Docker available in the implementation environment; see Known issues).
- `infra/scripts/{backup,restore,backup-cron,deploy}.sh`: basic versions:
  `backup.sh`/`restore.sh` work standalone against any `DATABASE_URL`;
  R2 upload, 30-day retention, monthly restore test, and zero-downtime
  deploy are TODO (tracked in DECISIONS.md, due Milestone 9).
- `.env.example` covering every infrastructure variable from §15.5.
- `e2e/`: Playwright config with `mobile-360` and `desktop-1280` projects
  against `STOREFRONT_URL`; one skipped placeholder spec (nothing to test
  yet).
- `.github/workflows/ci.yml`: install (pnpm, cached), lint, typecheck, unit
  test, build — across the whole workspace via Turborepo.
- `CLAUDE.md` at repo root (project summary, golden rules, commands, pointer
  to `docs/PROJECT_SPEC.md`).
- Git repository initialized; this is the first commit.

### Verified

- `pnpm install` completes cleanly at the workspace root (after allowlisting
  native postinstall scripts for Prisma/SWC/esbuild/unrs-resolver in
  `pnpm-workspace.yaml`'s `allowBuilds` — a one-time pnpm security gate, not
  a project issue).
- `pnpm db:generate`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
  all pass across every package. `pnpm --filter api test` passes the health
  controller unit tests (up/down/liveness).
- **Ran all three dev servers for real** (`pnpm --filter api run dev`,
  `pnpm --filter storefront run dev`, `pnpm --filter admin run dev`) and hit
  them with curl:
  - API `/health` → `200 {"status":"ok",...}` (liveness, no dependencies).
  - API `/ready` → `503`, `database: down`, with a clean Prisma "DATABASE_URL
    not found" message — correct graceful-degradation behavior with no
    `.env` present, not a crash. `/api/docs` (Swagger) → `200`.
  - Storefront `/` and Admin `/` → `200`, correct placeholder HTML with
    Tailwind classes applied (confirms the Tailwind v4 `@theme`/`@source`
    pipeline actually compiles).
  - This also empirically confirmed NestJS 12's core packages (which ship as
    ESM) work correctly when `require()`'d from our CommonJS build, including
    `@nestjs/terminus` and the "native ESM" `@nestjs/swagger` — the risk
    flagged in `docs/DECISIONS.md` did not materialize.
- **Not verified in this environment:** the actual `docker-compose.dev.yml`
  stack (Postgres/MinIO/MailHog containers) — Docker is not available in the
  sandbox this was built in, so `/ready` has only been confirmed *against a
  missing database* (graceful down), not against a real one. The compose
  file and health/readiness checks are written to spec but need one real run
  with Docker/Docker Desktop to fully close this out.

### Known issues / explicitly deferred (not oversights — see DECISIONS.md)

- Docker was unavailable in the implementation environment, so
  `docker-compose.dev.yml` and the VPS compose file are untested against
  real containers. **Next session: run
  `docker compose -f infra/compose/docker-compose.dev.yml up -d`, copy
  `.env.example` to `.env` (fill in `APP_ENCRYPTION_KEY`), then `pnpm dev`,
  and confirm `/ready` returns 200 against the real Postgres container.**
- No CI run has actually executed yet (no GitHub remote connected in this
  environment) — the workflow file is written and the exact same commands
  it runs were verified locally, but it is unverified on GitHub Actions
  infrastructure itself.
- Every dependency version in every `package.json` was checked against the
  live npm registry during this milestone (not guessed) — see
  `docs/DECISIONS.md` for the specific deviations from "latest" and why
  (TypeScript 7.0, Prisma 7/8, NestJS version risk that turned out fine).
- `packages/sdk` generation, `packages/db` models/migrations, i18n, settings
  registry, RBAC, media library, provider framework — all Milestone 1+ as
  planned; not started.

### Note for next session

`next dev`/`next build` auto-generate `apps/{storefront,admin}/AGENTS.md`,
pointing at `node_modules/next/dist/docs/` for Next.js 16-specific breaking
changes versus older training data. Minimal App Router usage (layout, page,
globals.css, next.config.mjs) built and ran fine as-is, but **read that
guide before writing real routing/data-fetching/image/revalidation code**
in Milestone 1/3/4 — Next 16 is a full major ahead of whatever's familiar.

### Next up

Milestone 1 — platform foundations (§4, §16 M1). **First task of M1: decide
whether to move `packages/db` from Prisma 6.19.3 to Prisma 7 (driver
adapters, `prisma.config.ts`) before migrating the real schema in — see
`docs/DECISIONS.md`.** Then: Prisma schema for system/
staff/settings/ui_strings/locations/media/audit, settings registry +
generated settings UI, secret encryption, provider framework + mock drivers
+ Integrations UI, queue (pg-boss) + cache + scheduler + external-cron
endpoint, storage provider (local + S3), media library, i18n (next-intl,
LocalizedText, UI strings table/editor), staff auth (password + TOTP 2FA),
RBAC + permission matrix UI, audit log + viewer, setup wizard, admin shell,
BD location seed + area management.
