# Progress log

Updated after every milestone. See `docs/PROJECT_SPEC.md` §16 for the full
milestone plan and acceptance criteria, and `docs/DECISIONS.md` for the
reasoning behind choices made along the way.

---

## Milestone 0 — Repository and tooling

**Status: complete**, with one caveat carried forward: the Docker Compose
stack (`docker-compose.dev.yml`) has still never been run against real
containers — Docker isn't available in this implementation environment. All
other acceptance criteria met; see "Known issues" below.

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

---

## Milestone 1 — Platform foundations

**Status: complete**, with the same Docker/live-Postgres caveat as M0 — see
"Known issues" below. Prisma 6→7 was re-evaluated at the start of this
milestone as planned and deferred again (docs/DECISIONS.md: moving to v7
means moving `apps/api` to ESM, a bigger, separate change).

### Built

- **Prisma schema** (`packages/db/prisma/schema.prisma`): `Setting`,
  `UiString`, `StaffUser`/`StaffSession`/`Role`/`RolePermission`/
  `StaffRole`, `AuditLog`, `ProviderInstance`/`ProviderLog`,
  `ScheduledTask`, `Division`/`District`/`Area`, `MediaFolder`/`Media`/
  `MediaUsage` — one hand-written init migration
  (`prisma/migrations/20261022102633_init`, generated via `prisma migrate
  diff --from-empty` since no live DB was available to run `migrate dev`
  against; includes `CREATE EXTENSION citext`).
- **`packages/db/src/seed.ts`**: seeds the "Super Admin" system role with
  every permission in the catalog, every default UI string, and the full
  BD locations tree from `seed-data/bd-locations.json` (8 divisions, 64
  districts, 541 areas — see DECISIONS.md for source/license/verification
  scope). Settings rows are deliberately *not* seeded (missing keys fall
  back to the registry default, so seeding them would be redundant).
  `--demo` additionally sets a few "Demo Fashion" brand settings; full demo
  catalog/pages/orders wait for the milestones that create that data.
- **`packages/shared`**: settings registry (`defineSetting`/
  `validateSettingValue`/registry) + the actual M1 setting definitions
  (brand, locale, theme-minimal, security groups); the permission catalog
  (`PERMISSIONS`); `LocalizedText`/`t()`/UI-string defaults; AES-256-GCM
  encryption + Argon2 password hashing + TOTP (otplib v13) helpers; the
  provider framework's capability types + static driver catalog, with real
  `local`/`s3` storage drivers and `mock`/`smtp` email + `mock` SMS drivers.
  40 unit tests.
- **`apps/api`** — new modules: `PrismaModule` (global, lazy-connect),
  `CacheModule` (in-memory, tag-based invalidation), `AuditModule` (global,
  append-only), `SettingsModule` (registry-backed CRUD + public
  `GET /store/config`, cached+invalidated), `AuthModule` (password + TOTP
  2FA login/logout/session, httpOnly cookie), `StaffModule`/`RbacModule`
  (staff CRUD, role + permission-matrix CRUD), `UiStringsModule`,
  `LocationsModule`, `StorageModule` (env-driven driver selection),
  `MediaModule` (upload with `sharp`-generated thumb/md/lg WEBP variants,
  blur-placeholder data URL, default-center focal point, folders, usage
  tracking, local-file serving route), `ProvidersModule`
  (`provider_instances` CRUD + encrypted config + test-connection +
  `provider_logs`), `QueueModule` (pg-boss, non-fatal if unreachable) +
  `SchedulerService` (handler registry, embedded `setInterval` tick when
  `WORKER_MODE=embedded`, external `POST /public/cron/:task` with
  `CRON_SECRET` for free-tier hosts that spin down), `SetupModule`
  (bootstrap-only Super Admin creation + mandatory first-login 2FA
  confirmation). `PermissionsGuard` + `@RequirePermissions` +
  `StaffAuthGuard` + `ZodValidationPipe` in `common/`. 25 unit tests.
- **`apps/admin`**: next-intl locale routing (`bn` unprefixed, `en` at
  `/en/...`, per §4.5) via `proxy.ts` (Next 16 renamed `middleware.ts`);
  `next.config.mjs` rewrites `/api/*` to the real API server-side (no
  `NEXT_PUBLIC_*` env, no CORS, "config only" per golden rule 8); setup
  wizard (Super Admin creation → QR/TOTP confirm → done), login (password →
  TOTP when enabled), authenticated shell (sidebar, per-locale nav, logout),
  generated Settings page (reads the registry metadata, renders
  per-widget controls), Staff & Roles page (permission-matrix role
  creation, staff creation/role-assignment/disable), Media Library page
  (upload, grid, delete), Integrations page (provider-instance create +
  test-connection, email/sms capabilities), Audit Log page (paginated
  table).
- **`apps/storefront`**: same next-intl locale routing + `/api/*` rewrite,
  wired but not yet used for anything beyond the existing placeholder home
  page (real storefront content is M3/M4, unchanged from the M0 scope
  boundary).

### Verified

- `pnpm db:generate`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
  all pass across all 11 workspace packages (72 unit tests total:
  40 `@clothing/shared`, 7 `@clothing/db`, 25 `apps/api`).
- **Ran the real API dev server with no database available** and confirmed:
  the full module graph resolves (no DI errors) and every route maps
  correctly; `/health` is 200; `/ready` is a clean 503; `GET /store/config`,
  `/setup/status`, `POST /public/cron/:task` (with the right secret) all
  fail with the actual "can't reach database" error rather than crashing
  the process; `POST /auth/login` validation errors return the expected
  zod issue list; `GET /admin/providers/catalog` (requires auth) is a clean
  401; `GET /media/*path` resolves through the Express-5 named-wildcard
  route correctly (confirmed via a standalone Express 5 probe before
  relying on it, then against the real route). The queue backend logs a
  warning and the app still starts when pg-boss can't reach Postgres.
- **Ran the real admin + storefront dev servers together with the API**,
  hit them with curl, and confirmed: `/` on each app redirects correctly
  (admin: to `/setup` when no Super Admin exists yet); the setup wizard page
  renders real Bangla copy at `/setup` and real English copy at `/en/setup`
  (confirms the `bn` default-unprefixed / `en`-prefixed locale strategy
  actually works end-to-end, not just in config); the admin app's `/api/*`
  rewrite correctly proxies to the real API (reaches it, gets the same
  "can't reach database" error as calling the API directly — confirms the
  proxy, not just the API, is wired correctly).
- **Not verified in this environment** (same root cause as M0): the setup
  wizard → Super Admin login-with-2FA → setting-change-is-audited →
  image-upload-generates-sizes → role-denies-elsewhere flow described in
  §16 M1's acceptance line has never been run against a real Postgres
  instance, because none is available here. Every piece of it was
  exercised individually against the real (schema-validated, DI-correct)
  code wherever that didn't require a live database (see above and the
  unit test suite); the one thing that's never happened is the full flow,
  live, end to end. **Next session with Docker/a real Postgres available:
  run `docker compose -f infra/compose/docker-compose.dev.yml up -d`, copy
  `.env.example` to `.env` + `apps/api/.env` (fill in `APP_ENCRYPTION_KEY`
  and `apps/admin/.env.local`'s `API_URL`), `pnpm db:migrate:deploy &&
  pnpm db:seed`, then actually click through the M1 acceptance scenario in
  a browser.**

### Known issues / explicitly deferred (see docs/DECISIONS.md for the reasoning)

- Docker still unavailable in this environment — same caveat as M0, now
  also blocking the one live end-to-end run described above.
- Deferred from §5.1's table: `approval_requests`, `notifications_admin`,
  `saved_views`, `api_keys`, `outbound_webhooks`/`webhook_events`,
  `courier_area_mappings` — added with the milestone that needs them.
- Settings UI: `json`/`image` widgets use a generic JSON textarea / plain
  media-ID text field in M1, not bespoke editors or a media-picker modal.
- Provider-call wrapper has timing + logging only; retries/backoff/circuit
  breaking (§4.3 rule 3) wait for the first real network-calling driver
  (M5/M6 payment/courier).
- Config export/import (§4.4 item 5) not built — nothing worth exporting
  exists yet (no CMS/menus/templates/categories until later milestones).
- `MediaService` has no "set as my avatar" endpoint yet (the
  `staff_users.avatar_media_id` relation exists; nothing writes to it).
- No git remote is configured in this environment, so this milestone's
  commit could not be pushed (same situation flagged at the end of M0,
  still unresolved — needs the project owner to add one).

---

## Cloudinary media provider (change request, pre-Milestone 2)

**Status: complete.** R2/S3 (env-configured) stays the default; Cloudinary
is now a real alternative, switchable from the admin panel with no code
change. See docs/DECISIONS.md (2026-10-22 entry) for the reasoning behind
every non-obvious call below.

### Built

- **`packages/shared`**: `cloudinaryStorageDriverDefinition` (capability
  `storage`, driver `cloudinary`) — REST calls via plain `fetch` + a
  hand-rolled signature (no `cloudinary` SDK dependency), `config.mock` for
  the required mock mode, `usage()` hook (new, optional, on
  `ProviderDriverDefinition`) backed by Cloudinary's usage API. New
  isomorphic subpath `@clothing/shared/media` (`src/media/url.ts`):
  `getMediaUrl(ref, options)` — the one place either app builds a media
  delivery URL, for either provider family, with zero Node imports (kept
  out of `@clothing/shared/providers`, which pulls in `node:fs`/aws-sdk and
  would be unsafe in a browser bundle). New settings `media.defaultProvider`
  (`"env"` or a `provider_instances.id`) and
  `media.fallbackToEnvOnProviderLimit`. 18 new unit tests (URL builder +
  Cloudinary driver, both exact-string/mock-mode since no live Cloudinary
  account exists in this environment).
- **`packages/db`**: non-destructive migration adding
  `media.provider_instance_id`/`external_id`/`resource_type`/`version` +
  a new `MediaMigrationJob` table/enum (`media_migration_jobs`).
- **`apps/api`**: `MediaDriver` abstraction (`media/media-driver.ts`) with
  two implementations — the env-backed one (unchanged sharp
  thumb/md/lg/blur pre-generation, now also used for direct-upload
  finalize) and the Cloudinary one (uploads the original only, sizes on
  the fly, still a cheap local/on-the-fly blur placeholder).
  `MediaProvidersService` resolves which driver backs a new upload
  (`media.defaultProvider`, with automatic fallback to env past 95% usage)
  versus an *existing* asset (always from the row's own stored fields —
  switching providers never strands old assets); handles delete-with-retry
  (failed remote delete → logged + one scheduled retry, DB never left
  inconsistent). `MediaService` gained the direct-upload flow
  (`POST /admin/media/direct-upload-ticket` → browser uploads straight to
  S3 (presigned PUT) or Cloudinary (signed POST) → `POST
  /admin/media/finalize`; local correctly reports unsupported and the
  admin UI falls back to the existing multipart upload).
  `MediaMigrationService`/`MediaMigrationController` — "move media to
  provider X," resumable (stored cursor) and chunked (20/tick), dry-run
  count, Super Admin only (`SuperAdminGuard`, new — checks
  `staffUser.roles[].role.isSystem`, not a permission string).
  `ProviderRegistryService.getUsage()` — 1h-cached usage, audit-logs once
  per 80%/95% threshold crossing. `ProviderInstancesController` now blocks
  deleting a storage instance that still has media on it. 36 new unit
  tests (media-driver, media-providers, media-migration, super-admin
  guard, provider-registry usage/caching).
- **`apps/admin`**: Integrations page gained a `storage` capability tab
  (Cloudinary, configured through the existing generic instance-create
  UI) + a "check usage" action; Settings page special-cases
  `media.defaultProvider` as a live dropdown of real provider instances;
  Media page now uses `next/image` + a custom loader
  (`lib/media-image-loader.ts`, wrapping `getMediaUrl`) instead of a raw
  `<img>`, shows a provider badge per asset, does the direct-upload dance
  with a multipart fallback, and (Super Admin only) a migration panel
  (target picker, dry-run count, start, polled progress). New System
  Health page (`/system-health`) — deliberately minimal: Cloudinary
  credit-usage bar + 80%/95% banners, with a comment marking it as the
  extension point for a fuller dashboard later, not the finished thing.
  New `--color-warning` design-system token (preset.css) for those
  banners.
- **`apps/storefront`**: `lib/media-image-loader.ts` added as the same
  ready extension point — unused until real product imagery exists
  (M3/M4).

### Verified

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass across
  the whole workspace (new totals: 58 `@clothing/shared`, 7 `@clothing/db`,
  53 `apps/api` unit tests).
- **Ran the real API dev server with no database available**: full DI
  graph resolves (MediaModule/ProvidersModule/MediaMigrationController all
  wire cleanly), every new route maps
  (`/admin/media/direct-upload-ticket`, `/admin/media/finalize`,
  `/admin/media-migrations[/:id]`, `/admin/providers/:id/usage`), `/health`
  stays 200, DB-dependent routes fail with the real "can't reach database"
  error rather than crashing — same graceful-degradation property as M0/M1.
- **Not verified in this environment** (no Cloudinary credentials, no live
  Postgres — same root cause flagged in M0/M1): an actual Cloudinary
  account's response shapes/signature acceptance, and the full live
  acceptance scenario (switch default provider → upload → render sized
  WebP/AVIF from Cloudinary on real pages → switch back → run a real
  migration job). The Cloudinary mock driver and the URL-builder's
  exact-string tests are the next best thing available here; re-verify
  against a real account and a real Postgres in the same session Docker
  becomes available.

### Known issues / explicitly deferred

- Cloudinary's AI tools (background removal, auto-tagging, etc.) — Phase 2
  with the other AI features (M13). `createCloudinaryMediaDriver` is the
  extension point.
- Usage-threshold alerts reach the Audit page only, not an actual
  notification to Super Admin — waits for the general staff-notification
  system already flagged as deferred in M1 (`notifications_admin`).
- Migration-job "verification" is "upload succeeded with sane dimensions,"
  not a byte-for-byte checksum.
- A fuller System Health dashboard (queue depth, DB status, per-provider
  error rates) is its own future milestone.

---

### Next up

Milestone 2 — catalog and inventory (§16 M2): categories tree, attributes,
size systems/charts, options & variant matrix, products editor, collections,
price schedules, product versions, stock locations/levels/adjustments,
CSV/Excel import-export with dry run, barcode labels, search provider
(Postgres FTS + trigram + editable Banglish synonyms table).
