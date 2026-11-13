# Progress log

Updated after every milestone. See `docs/PROJECT_SPEC.md` §16 for the full
milestone plan and acceptance criteria, and `docs/DECISIONS.md` for the
reasoning behind choices made along the way.

## Current status (2026-11-13)

| Phase (§16) | Milestones | State |
| --- | --- | --- |
| Phase 1 — MVP | M0–M9 | Complete |
| Phase 2 — Growth and operations automation | M10–M13 | Complete |
| Phase 3 — Advanced and intelligence | M14–M17 | M14–M16 complete — **M17 is next** |

- Latest milestone: M16 (loyalty extensions). The repository has no git
  remote, so milestone commits are local only.
- Unit tests: `packages/shared` 258, `packages/blocks` 13, `apps/api` 598,
  `apps/storefront` 10 — all passing.
- Database: migrations up to `20261116090000_loyalty_extensions` (M16)
  are committed, but the configured dev database was last known at M11;
  run `pnpm db:generate`, `pnpm db:migrate:deploy`, `pnpm db:seed` before
  using M12–M16 features (code from M16 on needs the new cart/order
  columns to serve carts at all).
- Cross-cutting caveat: no milestone has been clicked through in a
  browser or run against live third-party providers here — each section's
  "Not verified" list says what remains.
- Remaining plan: M17 advanced analytics and procurement.

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

## Milestone 2 — Catalog and inventory

Status: complete (§16 M2). All acceptance criteria met at the code/test
level; search and the CSV import job's live-Postgres behavior are not
exercised against a real database in this environment (see "Not verified"
below) — same limitation as M0/M1.

### Built

- **`packages/db`**: full catalog/inventory schema (hand-written migration
  `20261023090000_catalog_inventory_search`, same reasoning as the
  Cloudinary change — no live DB/shadow DB here to run `prisma migrate
  dev`): `attributes`/`attribute_values`, `size_systems`, `size_charts`,
  `categories` (self-referencing tree), `products` +
  `product_categories`/`product_attribute_values`/`product_options`/
  `product_option_values`/`product_variants`/`product_media`/
  `product_relations`/`product_versions`, `collections` +
  `collection_products`, `price_schedules`, `stock_locations` +
  `inventory_levels` (with a real Postgres `GENERATED ALWAYS AS (on_hand -
  reserved) STORED` `available` column) + `stock_movements`,
  `search_synonyms`, `catalog_import_jobs`. `products.search_document` is
  a trigger-maintained `tsvector` (`'simple'` config) plus `pg_trgm`
  trigram indexes on title — see docs/DECISIONS.md for why it's a trigger
  and not a generated column. `pnpm db:seed` now also creates one default
  "Main warehouse" stock location (§16 M2: "stock locations (one
  seeded)").
- **`packages/shared`**: `slugify`/`uniqueSlug` (`src/catalog/slug.ts`) —
  isomorphic slug helpers shared by categories/products/collections.
- **`apps/api`** — one NestJS module per bounded context, all wired into
  `AppModule`:
  - `CatalogModule`: categories (tree, image/banner/SEO/size-chart/
    attribute-set, cycle-safe reparenting), attributes & values, size
    systems, size charts.
  - `ProductsModule`: products (localized title/description, category +
    additional categories, tags, status/scheduling, SEO, attribute
    values), options & values, variants (the matrix generator —
    `variant-matrix.ts`'s `generateVariantCombinations`, additive, zero
    options → one "free size" variant — plus inline update, bulk-fill,
    delete), product media (gallery, per-color assignment via
    `optionValueId`), product relations (similar/complete-the-look/
    upsell/cross-sell), product version history + restore, and a
    recurring publish/unpublish sweep. `cost_price` is filtered out of
    API responses without `catalog.cost.read` (`cost-price.filter.ts`).
  - `CollectionsModule`: manual (drag-sort via a `position` field) and
    automatic (typed rule tree → Prisma `where`, `collection-rules.ts`,
    with a live preview-count endpoint) collections.
  - `PriceSchedulesModule`: scheduled price changes on a
    variant/product/collection/category/tag, applied/reverted by a
    recurring sweep, with an exact-revert snapshot
    (`price-schedules.service.ts`, `price-math.ts`).
  - `InventoryModule`: stock locations, inventory levels (auto-
    provisioned per variant per active location), adjustments (with a
    full audit trail via `stock_movements`, blocking a decrease that
    would go negative), low-stock list, barcode label data.
  - `ImportExportModule`: CSV/Excel upload → dry-run validation report
    (`row-schema.ts`) or a resumable, chunked background job (same
    `cursor`/`CHUNK_SIZE=20` pattern as the Cloudinary change's media
    migration job) that upserts products/variants/options by SKU and
    sets initial stock, with a per-row JSON error list rendered to CSV on
    download; export streams the catalog back out in the same template.
  - `SearchModule`: `/store/search` (Postgres FTS + trigram + Banglish
    synonym expansion, `search-query.ts`) and the admin synonyms CRUD
    (`search_synonyms`).
  - `queue/scheduler.service.ts` gained `registerRecurring()` — a second,
    simpler mechanism (alongside the existing tracked-`scheduled_tasks`
    one) for cheap idempotent sweeps with no job row of their own; used by
    the product publish sweep and the price-schedule sweep.
  - `media/media-usage.service.ts` (new, shared) — a single diff-based
    `sync()` call that every catalog entity with an image uses to keep
    `media_usages` accurate, extending M1's "media delete blocked while
    in use" rule across the whole catalog.
  - New dependency: `xlsx` (SheetJS) for CSV/Excel parsing and writing.
- **`apps/admin`**: `/catalog` (tabbed: categories, attributes, size
  systems, size charts), `/products` (list) + `/products/[id]` (full
  editor: details, options & values, variants table with inline edit +
  generate + bulk-fill, media gallery via the existing media library,
  relations, version history with restore), `/collections` (manual
  product list + automatic rule preview), `/price-schedules`,
  `/inventory` (locations, stock levels with inline adjust, low-stock
  list, barcode-label print view), `/import-export` (upload, dry-run
  report, job progress polling, error-report download, CSV export), and
  `/search` (Banglish synonym editor). New nav entries in the dashboard
  sidebar; new `catalog`/`products`/`collections`/`priceSchedules`/
  `inventory`/`importExport`/`search` message namespaces (bn + en).

### Verified

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass across
  the whole workspace (new totals: 64 `@clothing/shared`, 7 `@clothing/db`,
  101 `apps/api` unit tests — 37 of them new this milestone: variant
  matrix generation incl. the free-size and size×color cases, collection
  rule→query mapping, price schedule apply/revert/rounding, the CSV
  import row validator and chunked job processing, the search synonym
  expansion/tsquery builder covering the exact "punjabi/panjabi/পাঞ্জাবি"
  scenario, inventory adjustment arithmetic incl. the insufficient-stock
  guard, the export row flattener, and the new scheduler recurring-handler
  mechanism).
- **Ran the real API dev server with no database available**: the full DI
  graph resolves (every new module wires cleanly, no circular-dependency
  or missing-provider errors), every new route maps correctly
  (`/admin/categories`, `/admin/attributes[/:id/values]`,
  `/admin/size-systems`, `/admin/size-charts`, `/admin/products[...]`
  (options/variants/media/relations/versions), `/admin/collections[...]`,
  `/admin/price-schedules`, `/admin/stock-locations`,
  `/admin/inventory[...]`, `/admin/catalog/import[...]`,
  `/admin/catalog/export`, `/admin/search/synonyms`, `/store/search`),
  `/health` stays 200, and DB-dependent routes (e.g. `/admin/categories`,
  `/store/search`) return the real `PrismaClientInitializationError`
  ("can't reach database server") rather than crashing or 500ing on a
  code bug — same graceful-degradation property verified in M0/M1 and the
  Cloudinary change.
- All three apps (`admin`, `api`, `storefront`) build cleanly together
  (`pnpm build`), including every new admin route.

### Not verified in this environment

- No live Postgres is available here, so: the full-text search path
  (trigger-maintained `search_document`, the synonym-expanded `tsquery`,
  the `pg_trgm` fallback) has not run against a real database — only its
  pure query-building logic is unit-tested (`search-query.spec.ts`). The
  acceptance scenario's search behavior is covered at that level, not
  end-to-end.
- The CSV import job has not been run against a real 500-row file through
  a real database — `CatalogImportService`'s dry-run and chunk-processing
  logic are unit-tested with a mocked Prisma client instead.
- Creating a free-size and a size×color product through the actual admin
  UI in a browser has not been clicked through — the variant-matrix
  generation logic itself is unit-tested, and the admin pages build and
  typecheck cleanly, but no browser session was available to exercise the
  click path end-to-end.
- Re-run all of the above (plus the Cloudinary and live-Postgres items
  already flagged in M0/M1) once a real Postgres instance (and, for the
  Cloudinary change, real Cloudinary credentials) are available.

### Known issues / explicitly deferred

- CSV/Excel import's column-mapping UI is a fixed template, not a
  drag-and-drop mapper; image-by-URL / bulk zip image import is not
  built. See docs/DECISIONS.md.
- Export doesn't round-trip option labels (size/color) or per-location
  stock, only the commerce-critical columns.
- Barcode labels print as plain text, not real Code128 symbology.
- The admin category tree, size chart editor, and product-media picker
  are simple (dropdown/number-field based), not full drag-and-drop/grid/
  modal UIs — functionally complete, visually simpler than §8.1/§8.2.
- Stock transfers, stock takes, suppliers, purchase orders — explicitly
  M12 (phase 2), not built here.
- Storefront catalog pages (category/product listing, PDP) are
  deliberately not built — that's Milestone 4's job.

---

## Milestone 3 — Theme, CMS core and storefront shell

Status: complete (§16 M3). Acceptance criteria met at the code/test level;
the live end-to-end scenario (real storefront process + real Postgres) is
not exercised in this environment — see "Not verified" below, same
limitation as every prior milestone.

### Built

- **`packages/db`**: `pages` (+ `page_versions`), `menus`,
  `announcement_bars`, `popups`, `redirects`, `newsletter_subscribers`
  (hand-written migration `20261023150000_cms_core`, same reasoning as
  every prior milestone's migration — no live DB/shadow DB here). A
  page's blocks live as a JSON array in `blocks_draft`/`blocks_published`
  — two columns, not a status flag, so draft vs. published is structural
  (see docs/DECISIONS.md). `pnpm db:seed` now also creates the `home`,
  `404`, `500` and `maintenance` system pages (home: hero + two
  product-grid blocks; the rest: a bilingual `rich_text` block) and four
  policy placeholders (`needsContent: true`, drives the admin "content
  needed before launch" checklist).
- **`packages/shared`**: new settings —
  `theme.headerVariant`/`footerVariant`/`productCardVariant`/
  `fontBangla`/`fontLatin`, `features.maintenanceMode`/`cookieConsent`,
  `chat.whatsappEnabled`/`whatsappNumber`/`messengerEnabled`/
  `messengerPageUrl`, `seo.titleTemplate` — all `public: true`, so the
  storefront picks every one of them up from `GET /store/config` with no
  new admin UI (the Settings page is generated from the registry). New
  permissions `cms.manage`/`cms.publish`/`settings.features.write`/
  `settings.chat.write`/`settings.seo.write`.
- **`packages/blocks`** (new, real content): a block registry
  (`registry.ts`: schedule/locale/device visibility helpers) plus 10
  block types (`hero`, `rich_text`, `image_text`, `category_tiles`,
  `product_grid`, `banner_strip`, `faq_accordion`, `newsletter_signup`,
  `spacer`, `custom_html`) — a representative MVP subset; the rest of
  §9.1's list depends on systems not built yet (flash sales/reviews are
  M8). Two entry points: `.` (React components, for the storefront) and
  `./schemas` (zod schema + defaults + `validateBlocks()`, no React — for
  the API). `custom_html` is marked Super-Admin-only in the registry.
- **`apps/api`**: `CmsModule` (admin) — pages (create/update, autosave
  `blocksDraft`, publish/schedule, soft delete with a system-page guard,
  version history + "restore as draft," a 2-minute-inactivity edit lock),
  menus, announcement bars, popups, redirects — each audit-logged and
  triggering the new `RevalidationService`. `custom_html` is sanitized
  server-side at save time (`sanitize-html`). `StoreContentModule` (public
  reads: page by slug — published only, menu by key, announcements/popups
  active *now*, computed at read time rather than via a sweep, redirect
  lookup). `StoreCatalogModule` (public, card-sized `/store/catalog/
  categories`+`/products` — what `category_tiles`/`product_grid` need,
  explicitly not Milestone 4's full filterable catalog). `NewsletterModule`
  (public subscribe, minimal capture table). `RevalidationService`
  (new, `@Global`) — the publishing pipeline (§9.6): POSTs `{ tags }` to
  the storefront's `POST /api/revalidate` with a shared secret on every
  settings/page/menu/announcement/popup change; never throws, so a
  revalidation hiccup can't fail the admin mutation that triggered it.
  `SchedulerService.registerRecurring` (M2) is reused for the
  scheduled-page-publish sweep.
- **`apps/admin`**: new `/cms/pages`
  (list, "needs content" banner) + `/cms/pages/[id]` (title, block
  list — friendly fields for `hero`, a JSON textarea for every other
  block type, add/reorder/remove, publish, schedule, version history +
  restore) and `/cms/announcements` (CRUD with a schedule + active
  toggle). New `cms` message namespace (bn + en).
- **`apps/storefront`** (first real content, was M0-scaffold-only before
  this): root layout now injects `--color-brand`/`--color-brand-
  foreground` (computed via a small contrast-pick helper) from settings,
  renders the announcement bar / header (4 layout variants) / footer (2
  variants) / floating WhatsApp+Messenger chat buttons, and short-
  circuits to the `maintenance` system page's content when
  `features.maintenanceMode` is on. `BlockRenderer` maps a page's
  published blocks to their registered components, skipping (not
  crashing on) an unknown type, a failed schema re-check, or a block
  outside its schedule/locale. Home page (`/`) and CMS pages
  (`/pages/[slug]`, with a redirect-table lookup before giving up to a
  404) both just render a page's blocks. `not-found.tsx`/`error.tsx`
  (500, client-side fetch since Next's `error.tsx` can't `await`) render
  the `404`/`500` system pages' content. `/api/revalidate` (the
  publishing pipeline's target) and `/_styleguide` (every non-catalog-
  dependent block, both locales — folder literally named `%5Fstyleguide`,
  Next's escape hatch for a route that must start with `_`).

### Verified

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass across
  the whole workspace (new totals: 119 `apps/api` unit tests — 1 of which,
  "HealthController reports up when the database is reachable," needs a
  real Postgres and fails/times out here, same pre-existing environment
  gap flagged since M0/M1, not a regression; 12 `@clothing/blocks`,
  3 `storefront`, 64 `@clothing/shared`, 7 `@clothing/db`). New tests this
  milestone: block registry visibility/schedule helpers and
  `validateBlocks` (incl. the exact Super-Admin-only `custom_html` case),
  `PagesService` (publish copies draft→published + snapshots a version;
  restore touches `blocksDraft` only; edit-lock expiry; the scheduled-
  publish sweep; `custom_html` sanitization-on-save), `Announcements
  Service.listActiveNow` (every branch of "appears/disappears at its
  times" — before/inside/after a schedule window, inactive regardless of
  schedule — directly matching the M3 acceptance scenario), and
  `RevalidationService` (posts the right payload/header; never throws).
  Running the whole workspace's lint in parallel via Turbo intermittently
  OOMs on this machine (a Windows resource limit, not a code issue — every
  package lints clean run individually, which is how this was verified).
- **Ran the real API dev server with no database available**: the full DI
  graph resolves (every new module wires cleanly), every new route maps
  (`/admin/cms/pages[...]` incl. publish/schedule/versions/lock,
  `/admin/cms/menus`, `/admin/cms/announcements`, `/admin/cms/popups`,
  `/admin/cms/redirects`, `/store/catalog/categories`+`/products`,
  `/store/pages/:slug`, `/store/menus/:key`, `/store/announcements`,
  `/store/popups`, `/store/redirects/lookup`,
  `/store/newsletter/subscribe`), `/health` stays 200, and every
  DB-dependent route returns the real `PrismaClientInitializationError`
  rather than crashing or 500ing on a code bug.
- All three apps build cleanly together, including every new storefront
  route (confirming `/_styleguide`'s `%5F`-escaped folder actually
  resolves to `/_styleguide` in Next's own route table) and every new
  admin route.

### Not verified in this environment

- No live Postgres, so: the full publishing-pipeline round trip (change a
  setting/page/announcement in admin → `RevalidationService` → the
  storefront's `/api/revalidate` → the change visible within 10s) has not
  run end-to-end against a real running storefront process — each piece
  (the HTTP call, the tag-based fetch caching, `revalidateTag` itself) is
  exercised individually (unit tests; a real `next build` confirming the
  route compiles) but not as one live chain.
- Clicking through the acceptance scenario itself (change brand color +
  header variant + home hero text in the admin UI, watch the storefront
  update) in an actual browser — not possible without a database to log
  into the admin with.
- The scheduled-announcement and page-version-restore acceptance points
  are covered by direct unit tests of the exact logic, not a live click-
  through.

### Known issues / explicitly deferred

- Admin UI for menus, popups, redirects, UI text — the API is complete;
  these are documented as a real gap in docs/DECISIONS.md, not silent.
- Per-block-type visual forms beyond `hero`; the generic JSON-textarea
  fallback covers every other type in the meantime.
- A real interactive popup (timed/exit-intent modal) on the storefront.
- Brand logo → URL resolution and actual font loading for
  `theme.fontBangla`/`fontLatin` (settings exist, nothing serves them).
- The live-preview iframe + `postMessage` editing experience (§9.2) — the
  editor writes `blocksDraft` directly instead of a true live preview.
- Global blocks and page templates (§9.2).
- Mega-menu dropdown rendering exists in the storefront `Header`, but
  there's no menu admin UI yet to actually build a 3-level menu with.

---

## Milestone 4 — Storefront catalog experience

Status: complete (§16 M4) at the code/test level. The acceptance
criterion itself — a Lighthouse run against a local production build with
a seeded demo catalog — cannot be executed in this environment at all (no
Postgres, no browser); see "Not verified" below.

### Built

- **`packages/db`**: `notify_me_requests` (variant + contact + channel,
  no customer required), `analytics_events` (append-only, like
  `audit_logs`) — hand-written migration `20261023180000_storefront_
  catalog`, same reasoning as every prior milestone's.
- **`apps/api`**:
  - `StoreCatalogService`/`Controller` grew from M3's CMS-block-only
    helpers into the real public catalog API: category detail (+ root-
    first breadcrumb), collection detail (schedule-aware), a filterable/
    sorted/paginated/faceted product listing (`/store/catalog/listing`),
    full PDP data (`/store/catalog/products/:slug` — options/values with
    swatch URLs, variants with per-variant `available`/`lowStock` summed
    from real inventory, grouped media, size chart, attributes, relations
    by type, root-first breadcrumb), and instant-suggestion search
    (`/store/catalog/suggest`).
  - `SearchService` (M2) now returns the same product-card shape as every
    other listing endpoint, resolving its image URL the same way — a
    consistency fix made while wiring the storefront's `/search` page.
  - `NotifyMeModule`/`AnalyticsModule` (new, public) — "notify me when
    back in stock" and first-party event capture respectively; both
    customer-less by design (no customer model exists before M5).
  - `StoreContentController` gained `/store/sitemap` — one aggregated,
    type-split list (pages/products/categories/collections) for the
    storefront's `app/sitemap.ts`.
- **`apps/storefront`** (the bulk of this milestone):
  - `/c/[...slug]` (category) and `/collections/[slug]` share one
    `CatalogListing` component — breadcrumb, attribute/price/stock
    filters and sort (`CatalogFilters`, URL-driven so every filter state
    is a shareable/bookmarkable link, never client-only state), a
    product grid, and real anchor-tag pagination (`Pagination` — crawlable
    "load more," not a client-only button, per §7.3).
  - `/p/[slug]` (PDP): `ProductDetailView` — color swatches that swap the
    gallery, size buttons disabled exactly when no active/in-stock
    variant exists for the current selection (the acceptance scenario's
    two UI behaviors), a size chart modal, a notify-me form for
    out-of-stock variants, WhatsApp order link (prefilled text + page
    URL), related-products sections by relation type, a reviews summary
    from `Product.ratingAvg`/`ratingCount`, and a sticky mobile
    add-to-cart bar. Product/Offer/AggregateRating/BreadcrumbList JSON-LD;
    Organization + WebSite(`SearchAction`) JSON-LD in the root layout.
  - `/search` (M2's `/store/search`, not the listing endpoint — a
    free-text query isn't a facet/scope filter) with instant suggestions
    wired into the header's new `SearchBox` (debounced, product
    thumbnails + categories).
  - Guest wishlist (`WishlistButton`, `/wishlist`) and "recently viewed"
    (`RecentlyViewedTracker`/`Section`) — both `lib/use-local-list.ts`
    (localStorage), by design (see docs/DECISIONS.md — no customer model
    before M5).
  - `app/sitemap.ts` + `app/robots.ts` (Next's own conventions — real
    `/sitemap.xml`/`/robots.txt` routes, confirmed in the build's route
    table); `hreflang` via each catalog page's `alternates.languages`.
  - `lib/analytics.ts` — `trackEvent()` pushes to `window.dataLayer` *and*
    relays to `/store/events`; wired on the PDP's `view_item`.

### Verified

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass across
  the whole workspace (125 `apps/api` unit tests — 6 new this milestone,
  covering price-sort order/pagination, cross-location stock summing, and
  the category breadcrumb walk incl. a cycle guard; 10 `storefront` tests
  — 7 new, covering the listing search-param parser incl. the
  repeated-query-key/unknown-sort-value edge cases). Running the whole
  workspace's lint in parallel via Turbo still intermittently OOMs on this
  machine (a Windows resource limit, not a code issue, flagged since M3);
  every package lints clean run individually, which is how this was
  re-confirmed again this milestone.
- **Ran the real API dev server with no database available**: the full DI
  graph resolves, every new route maps (`/store/catalog/categories/:slug`,
  `/store/catalog/collections/:slug`, `/store/catalog/listing`,
  `/store/catalog/products/:slug`, `/store/catalog/suggest`,
  `/store/sitemap`, `/store/notify-me`, `/store/events`), a bad
  `notify-me` body correctly 400s from Zod validation *before* touching
  Prisma, `/health` stays 200, and every DB-dependent route returns the
  real `PrismaClientInitializationError` rather than crashing or 500ing
  on a code bug.
- All three apps build cleanly together, including every new storefront
  route (confirmed in the build's own route table: `/c/[...slug]`,
  `/collections/[slug]`, `/p/[slug]`, `/search`, `/wishlist`,
  `/sitemap.xml`, `/robots.txt`).

### Not verified in this environment

- **The acceptance criterion itself cannot run here at all**: a Lighthouse
  mobile performance/SEO audit needs a seeded demo catalog behind a live
  Postgres, a local *production* build actually serving traffic, and a
  real Chrome/Lighthouse run — none of which this sandbox has. Every page
  was built to the spec's named techniques (SSR, pre-sized images via the
  existing media/`getMediaUrl` pipeline, semantic HTML and headings, real
  `<a>`-tag pagination, JSON-LD, minimal client JS — the PDP's option/
  gallery interactivity is the one unavoidably client-rendered piece) but
  the actual score needs that environment to measure.
- "Selecting a color switches images" and "unavailable size combinations
  are disabled" (the acceptance scenario's two concrete UI behaviors) are
  implemented and type/lint/build-clean, but not clicked through in a
  real browser against real seeded variant data — no database to seed.
- The full publishing-pipeline tag set this milestone added
  (`category:*`, `product:*`, `listing`, `search`, `suggest`, `sitemap`)
  hasn't been exercised against a real `RevalidationService` call the
  way M3's page/settings tags were tested — same reasoning, no live stack
  to run it against.

### Known issues / explicitly deferred

- Delivery estimate, delivery fee preview, COD availability on the PDP —
  need M5's shipping zones & rates.
- Add to cart / Buy now are real, reachable buttons with correct pricing,
  but their handler shows a "coming soon" message instead of mutating a
  cart — cart itself is M5.
- Dynamic per-product OG images (image + price, composed + cached) — the
  PDP's OG tags reuse the product's own first photo instead.
- `FAQPage`/`Article` structured data (no FAQ system or blog yet).
- A real search/facet engine's "count as if this facet were also
  selected" — facet counts are scoped to category/collection/tag only.
- The listing's "in stock only" filter is "has an active variant," not a
  real per-location inventory join.
- Account-synced wishlist/recently-viewed (needs M5's customer auth).
- No admin viewer for notify-me requests yet, and nothing actually sends
  the "back in stock" message (needs M7's notification drivers) — the
  requests are captured and that's it.
- `robots.txt` is static code, not a settings-registry entry, despite
  §13.2 naming it as settings-driven — no admin screen would ever edit
  it yet.
- The k6 load-test scripts and the 500-VU load test (§13.1) — a
  deployment-time exercise this environment can't run.

---

## Milestone 5 — Cart, checkout, shipping, payment rules, customer auth

Status: complete (§16 M5) at the code/test level. All four acceptance
scenarios are implemented and reasoned through carefully (see
docs/DECISIONS.md for the stock-reservation race-condition argument in
particular); none could be exercised against a real concurrent HTTP
load or a live Postgres in this environment — see "Not verified" below.

### Built

- **`packages/db`**: `customers`, `customer_sessions`, `otp_codes`,
  `addresses`, `carts`/`cart_items`, `shipping_zones`/`shipping_rates`,
  `payment_rules`, `discounts`/`discount_usages`, `flash_sales`/
  `flash_sale_items`, `blocklist_entries`, `orders`/`order_items`/
  `order_discounts`/`order_events`, `payments` — one hand-written
  migration (`20261024090000_cart_checkout_shipping_payments`), generated
  via `prisma migrate diff` on two schema files (no live DB needed for
  that) and reviewed by hand before being committed, same as every prior
  milestone's migration.
- **`packages/shared`**: BD phone normalize/validate/format/mask
  (`phone/bd-phone.ts`, §6.2); `PaymentDriver`/`CaptchaDriver`/
  `FraudCheckDriver` provider interfaces + drivers — `mock`/`sslcommerz`/
  `bkash`/`nagad` for payment, `turnstile`/`mock` for captcha, `mock` for
  fraud-check (§10.1, §10.6, §6.6); ~25 new settings across `shipping.*`,
  `payment.*`, `risk.*`, `checkout.*`, `orders.*`, `auth.*`,
  `pricing.marginGuard.*`; new permissions (`shipping.manage`,
  `payment_rules.manage`, `discounts.manage`, `blocklist.manage`, plus a
  `settings.<group>.write` per new settings group).
- **`apps/api`** (one module per bounded context, as established):
  - `customers`, `customer-auth` (OTP send/verify, Google sign-in, JWT
    access + rotating refresh cookies, cart-merge-on-login — §6.13),
    `addresses` (customer saved addresses), `locations` (gained a
    `LocationsService.validateChain()` + a public `/store/locations/*`
    read API for checkout's cascading selects).
  - `shipping` (zone/rate matching + fee calculation, §6.4 — fully unit-
    tested: specificity ordering, priority tie-breaks, weight surcharge,
    free-delivery threshold), `discounts` (code + automatic discount
    evaluation, margin guard, basic flash sales — fully unit-tested: 22
    cases covering eligibility, allocation rounding, combinability),
    `payment-rules` (the §6.5 engine — fully unit-tested), `risk` (the
    §6.6 scorer + courier-history/fraud-check driver slot — fully unit-
    tested), `blocklist`.
  - `cart` (`CartService` for CRUD/identity/merge-on-login,
    `CartPricingService` for the full §6.3 pipeline: line resolution with
    flash-sale pricing, stock clamping, discounts, shipping, payment-
    rules preview, free-delivery progress).
  - `checkout` (`CheckoutService.placeOrder()` — idempotency replay,
    full server-side re-pricing, OTP/terms/Turnstile checks, real risk
    scoring, the authoritative payment-rules re-evaluation, atomic stock
    reservation via one conditional `UPDATE ... WHERE available >= :q`
    per line inside the order-creation transaction, order-number
    generation; `OrderExpiryService` — the §6.7 "release expired
    reservations every minute" sweep, registered via `SchedulerService.
    registerRecurring`; `OrdersService` — track by phone+number, mine,
    cancel-while-pending, both release stock on cancel).
  - `payments` (`PaymentsService` — driver resolution, initiate/confirm/
    reconcile; `MockPayController` — the mock driver's stand-in for a
    real gateway's hosted page; `StorePaymentsController` — which
    methods are actually configured).
  - New public store routes: `/store/cart/*`, `/store/checkout/place-
    order`, `/store/orders/*`, `/store/shipping/quote`, `/store/
    locations/*`, `/store/auth/*` (incl. new `GET /store/auth/me`),
    `/store/payments/methods`.
  - New admin routes + pages: `/admin/shipping/*` (zones+rates CRUD) with
    a real admin UI at `/shipping`; `/admin/payment-rules/*` with a real
    admin UI at `/payment-rules` (conditions/actions as JSON — see
    docs/DECISIONS.md); `/admin/discounts/*`, `/admin/flash-sales/*`,
    `/admin/blocklist/*` (API only this milestone — see docs/DECISIONS.md
    for why the admin UI for those is M8's).
- **`apps/storefront`**: header cart link with live item count; `/cart`
  (line items, quantity steppers, coupon codes, free-delivery progress,
  totals); `/checkout` (contact, cascading address selects, delivery-
  rate picker, payment-method picker respecting payment-rules-disabled
  methods, inline OTP step when required, terms checkbox, idempotent
  place-order); `/checkout/success`, `/checkout/failed`; `/track` (guest
  order lookup by phone + order number); `/account`, `/account/login`
  (OTP), `/account/addresses`; the PDP's "Add to cart"/"Buy now" buttons
  (stubbed in M4, explicitly deferred to M5 — see that milestone's
  DECISIONS.md entry) now call the real cart API.

### Verified

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass
  across the whole workspace (202 `apps/api` unit tests — 77 new this
  milestone: 12 shipping-calc, 22 discount-math, 11 payment-rules-engine,
  18 risk-score, 5 stock-reservation, 3 order-expiry, 6 order-number; 10
  `storefront` tests, unchanged this milestone). As with every prior
  milestone, the whole workspace's `lint`/`typecheck` in full parallel
  via Turbo intermittently OOMs on this Windows machine (now observed for
  `typecheck` too, not just `lint`) — every package individually
  typechecks/lints clean, which is the authoritative check.
- **Ran the real API dev server against no database, repeatedly, after
  each major addition**: the full DI graph resolves (caught and fixed two
  real module-wiring bugs this way — `PaymentsModule` and `CheckoutModule`
  were each missing a `ProvidersModule`/module import that only a boot
  attempt surfaces, not `tsc`), every new route maps correctly, a bad
  request body 400s via Zod validation before touching the database, and
  every DB-dependent route returns the real `PrismaClientInitializationError`
  rather than a code-bug 500.
- All three apps build cleanly together, including every new storefront
  route (`/cart`, `/checkout`, `/checkout/success`, `/checkout/failed`,
  `/track`, `/account`, `/account/login`, `/account/addresses`) and both
  new admin routes (`/shipping`, `/payment-rules`).
- Read through `CheckoutService.placeOrder()` line by line specifically
  checking the stock-reservation ordering (reservation happens inside the
  transaction; the payment-gateway network call happens strictly after it
  commits) and the idempotency-replay path (returns the already-created
  order, including its payments, rather than ever creating a second one).

### Not verified in this environment

- **The actual concurrent-request race** — no live Postgres to run two
  real HTTP requests against. Unit-tested at the `StockReservationService`
  level (mocked transaction client asserting the conditional-UPDATE call
  shape and the throw-on-zero-rows behavior) and reasoned through against
  Postgres's real row-locking semantics in a doc comment, but the
  acceptance scenario's literal "two buyers race" has not been run for
  real.
- The full checkout flow end-to-end in a real browser (address cascading
  selects, OTP step, payment-method disabling, successful mock payment
  redirecting back and landing on a `pending` order) — built and
  boot-tested for wiring/DI correctness, not click-tested.
- SSLCommerz/bKash/Nagad against their real sandboxes (no merchant
  credentials exist in this environment — see docs/DECISIONS.md). The
  mock driver is what every path was actually exercised against.
- Lighthouse/visual QA of the new pages; the k6 500-VU load test (§13.1).

### Known issues / explicitly deferred

- Discounts/flash-sales admin UI (API + engine exist; "full UI" is M8's
  named job per §16).
- A visual payment-rules builder (JSON editor for now — see
  docs/DECISIONS.md).
- Full address-book CRUD on the account page (view/remove only; new
  addresses are saved from checkout's own form) and a mounted Google
  Identity Services button (the API side for both is ready).
- OTP delivery has no bilingual message-template system yet (M7's job);
  the SMS text is a plain English string, and the generated code is
  returned in the API response / shown on the storefront in non-
  production environments only, since no real SMS gateway exists here.
- Loyalty/store-credit/gift-card redemption at checkout (§6.3 step 9) —
  none of those features exist before M12/M13/M16, so that step is a
  no-op this milestone.
- Preorder products are not exempted from the stock check (§6.7's
  preorder-limit bypass is deferred to M10, which is also when the rest
  of preorder UX arrives).
- Multi-location stock allocation (§6.7 phase 2) — always reserves
  against the single default location.
- A genuine "count as if this facet were also selected" type precision
  for payment-rules conditions isn't applicable here, but the condition
  vocabulary itself, while broad, doesn't cover segments/tiers (no
  segment model exists before M8).

---

---

## Milestone 6 — Order management and fulfillment

Status: complete (§16 M6) at the code/test level. The acceptance scenario
("confirm → pack (scan) → book → status progresses automatically to
delivered; another order ends as rejected_at_door with delivery fee
collected, stock restocked after QC, refund record created for its
advance minus fee; customer risk count increments") is implemented and
exercised piece-by-piece (state machine, mock courier timing, doorstep
refund math, all unit-tested) but never run as one live sequence against
a real database — see "Not verified" below.

### Built

- **`packages/db`**: `shipments`/`shipment_items`/`shipment_events`,
  `refunds`, `returns`/`return_reasons`, `invoices`,
  `courier_area_mappings`; `orders` gained `possibleDuplicateOrderIds`,
  `deliveredAt`, `totalWeightGrams`; `OrderEventType` gained `assigned`/
  `tag`/`return`/`refund`. One hand-written migration
  (`20261030090000_fulfillment_shipments_returns`), generated the same
  `prisma migrate diff` way as every prior milestone (confirmed byte-
  identical to a fresh diff before committing, including after adding the
  `totalWeightGrams` column in a second pass).
- **`packages/shared`**: `CourierDriver` interface + `mock`/`steadfast`/
  `pathao`/`redx` drivers (§10.2) — "manual" is a built-in option, not a
  driver (see docs/DECISIONS.md, same reasoning as COD for payments); the
  mock driver's status progression is a pure function of elapsed time
  (fake-timer tested) so staff can create several mock instances (one per
  `finalStatus`) to exercise delivered vs. rejected_at_door vs. partially
  delivered side by side. Also fixed a real M5 bug found while reviewing
  the pattern: SSLCommerz's `initiate()` was sending the amount in poisha
  instead of taka (100x overcharge, never caught because no sandbox
  account exists to run it against).
- **`apps/api`**: `couriers` (driver resolution — several instances active
  at once, unlike payment/sms/captcha), `courier-area-mapping` (CRUD +
  lookup), `shipments` (book/cancel/status-update/reconcile-partial/
  receive-at-warehouse, the courier status-poll sweep, a per-driver
  webhook endpoint), `fulfillment` (pick list grouped by product/bin,
  scan-validated packing, handover manifest), `orders` (admin list/
  detail/manual-create/edit-with-re-pricing/notes/call-outcomes/assign/
  tags/duplicates/manual-payments/bulk actions — all under `orders.
  manage`), `returns` (full §6.10 flow: request → approve (reserves +
  creates the linked exchange order right there) → pickup → receive →
  inspect (restocks passed items) → resolve (refund record / store-credit
  balance increment / exchange already done)), `refunds` (the pending-
  refund queue). `OrdersLifecycleService.transition()` now carries the
  full §6.8 `ALLOWED_TRANSITIONS` table plus cancellation's side effects
  (stock release, pending refund, coupon-usage release) — fully unit-
  tested (13 cases). `StockReservationService` gained `fulfill`/`restock`
  alongside M5's `reserve`/`release`. Duplicate detection
  (`RiskScoringService.findPossibleDuplicates`, written in M5, unused
  until now) is wired into `CheckoutService.placeOrder()`, symmetrically.
  New admin routes: `/admin/orders/*`, `/admin/fulfillment/*`,
  `/admin/shipments/*` + `/webhooks/couriers/:driver`,
  `/admin/returns/*` + `/admin/return-reasons/*`, `/admin/refunds/*`,
  `/admin/courier-area-mapping/*`, `/admin/couriers/available`. New store
  routes: `/store/returns/*`, `/store/return-reasons`.
- **`apps/admin`**: `/orders` (list with filters/bulk confirm-cancel/
  duplicate flag) + `/orders/new` (manual order form: customer, cascading
  address, product search, discount, COD/already-paid) + `/orders/:id`
  (timeline, items, payments/refunds, shipments with inline booking,
  returns links, notes, call-outcome buttons, tags, status actions) +
  `/orders/:id/edit` (quantities + shipping-fee override + required
  reason); `/fulfillment` (pick list / packing-with-scan / handover
  manifest as tabs, print via `window.print()` same as M2's barcode
  labels); `/returns` + `/returns/:id` (approve/reject/schedule-pickup/
  receive/inspect/resolve); `/refunds` (complete/reject queue);
  `/courier-area-mapping`; `/blocklist` (M5's backend finally got a UI).
- **`apps/storefront`**: the order-tracking page and account order list
  now show shipment tracking code/status/live-tracking link; new
  `/account/returns` (list) and `/account/returns/new` (item picker +
  type + reason + comment, login-gated like the rest of the account
  area) — the request itself needs an account; the order-tracking page
  links out to login rather than also supporting phone+order-number
  verification for this one flow (see docs/DECISIONS.md).
- `packages/db/src/seed.ts`: seeds the spec's own six example return
  reasons (size too small/large, damaged, wrong item, not as described,
  changed mind), each admin-editable from there on (golden rule 1).

### Verified

- Every package individually typechecks and lints clean
  (`@clothing/db`, `@clothing/shared`, `api`, `admin`, `storefront`,
  `@clothing/ui`, `@clothing/blocks`, `@clothing/sdk`,
  `@clothing/email-templates`) — `pnpm lint`/`pnpm typecheck` in full
  workspace parallel still intermittently OOMs on this Windows machine
  (same known issue since M1/M5); per-package is the authoritative check.
- `pnpm test` across the touched packages: 222 `apps/api` tests (13 new
  for `OrdersLifecycleService.transition()`'s allowed-transitions and
  cancellation side effects, 4 new for the doorstep-rejection refund
  math), 79 `@clothing/shared` tests (4 new for the mock courier driver's
  time-based status progression, fake-timer tested), 7 `@clothing/db`,
  10 `storefront` — all pass.
- **Ran the real API dev server against no database, repeatedly, after
  each major addition** (same ritual as every prior milestone): caught
  and fixed one real module-wiring bug this way (`OrdersLifecycleModule`
  needed `StockReservationModule` once the state machine started
  releasing stock on cancellation — only a boot attempt surfaces this,
  not `tsc`). The final boot confirmed every new route mapped, `/health`
  → 200, `/ready` → 503 (clean "can't reach database," not a crash),
  every DB-dependent route (including the new public
  `/store/return-reasons`) → 500 with the real Prisma error rather than a
  code-bug 500 (confirmed this is the actual, consistent behavior for
  *every* DB-touching route without a live Postgres, M5's included — not
  specific to anything new here), the public courier webhook → 200 with
  a graceful `{ok:false, reason:...}` on an unidentifiable payload, and
  guarded admin routes → 401 with no session.
- Read `ShipmentsService.applyStatus()` and `OrdersLifecycleService.
  transition()` line by line specifically checking: a webhook and the
  poll job hitting the same shipment twice is a no-op past the first
  terminal status (idempotency guard on `TERMINAL_SHIPMENT_STATUSES`);
  cancellation never double-releases stock (`reservationReleasedAt`
  guard, same field M5's `OrderExpiryService` already used); an approved
  exchange return's stock reservation is always backed by a real order
  row created in the same transaction (§6.10 "reserved at approval
  time," reasoned through in docs/DECISIONS.md).

### Not verified in this environment

- The full mock-courier acceptance scenario as one live sequence (confirm
  → process → pack with scan → book → `SchedulerService` ticks actually
  advancing the mock courier through its states → delivered; a second
  order ending at rejected_at_door with a refund record and an
  incremented `rejectedAtDoorCount`) — every piece is unit-tested
  separately (see "Verified" above) but needs a real Postgres and a
  running scheduler tick to see end to end.
- Steadfast/Pathao/RedX against real sandboxes (no merchant accounts
  exist — same caveat already accepted for M5's payment drivers). Their
  webhook payload field names in particular are a best guess from public
  docs, flagged directly in `shipments-webhook.controller.ts`.
- The admin orders/fulfillment/returns/refunds/courier-area-mapping pages
  in a real browser against seeded data — typechecked, linted, and
  boot-tested for routing/auth-guard correctness, not click-tested.
- **`pnpm build`'s static export fails on both Next.js apps — discovered
  this session, confirmed pre-existing (reproduces identically on a clean
  `git stash` back to the M5 commit), not caused by anything in M6.** See
  docs/DECISIONS.md for the investigation and the (unsuccessful) attempted
  fix. `pnpm dev` is unaffected.

### Known issues / explicitly deferred

- Order edit's admin UI exposes quantities + a shipping-fee override, not
  a full address picker or discount re-evaluation (the API supports the
  address field; see docs/DECISIONS.md).
- Returns' reverse pickup is staff bookkeeping only (no courier API
  confirmed to support booking one); store credit has no ledger yet
  (M8/M13's job — `Customer.storeCreditBalance` is incremented directly).
- Multiple shipments per order (split shipping) — one order ships as one
  parcel this milestone; `ShipmentItem` exists but is never actually
  split across more than one `Shipment` yet (phase 2 "merge/split
  orders," §16 M11).
- Courier auto-assignment rules, the Kanban order view, order-queue
  auto-assignment, and field-level permissions are all explicitly phase 2
  (§16 M11) and not attempted here.
- No message-sending (confirmation/shipped/delivered SMS/WhatsApp) is
  wired into any of M6's new transitions — M7's job, same deferral
  pattern already used for OTP in M5. Every transition still writes its
  `order_events` row, which is what M7 will hook into.

---

## Milestone 7 — Notifications and messaging

Status: complete (§16 M7) at the code/test level. The acceptance scenario
("placing, confirming, shipping, delivering an order sends the configured
messages via mock drivers in the chosen language; switching an event from
SMS to WhatsApp needs no code") is implemented, boot-tested for wiring, and
exercised unit-by-unit (template rendering/fallback logic, backoff timing,
driver request shapes); the live end-to-end sequence against a real
database was not run — see "Not verified" below, same limitation as every
prior milestone.

### Built

- **`packages/db`**: `message_templates` (one row per event×channel,
  bn/en subject+body, `isActive`), `notification_channel_rules` (one row
  per event, an ordered JSON channel array — missing row falls back to the
  catalog default, same pattern the settings registry already uses),
  `notification_logs` (one row per channel *attempt*, with `contacts`/
  `variables` persisted so a fallback to the next channel never needs to
  re-derive them — see docs/DECISIONS.md), `staff_notifications` (the
  M1-deferred `notifications_admin` table, finally built). New enums
  `NotificationChannel`/`NotificationEvent`/`NotificationRecipientType`/
  `NotificationLogStatus`. One hand-written migration
  (`20261104100000_notifications`), generated via `prisma migrate diff`
  between the committed schema and this one — confirmed byte-identical to
  a fresh diff before committing, same reasoning as every prior
  milestone's migration. `pnpm db:seed` now also seeds one default bn/en
  template per (event, channel) from `@clothing/shared/notifications`'
  `NOTIFICATION_EVENTS` catalog — channel rules are deliberately *not*
  seeded (an event with no row just uses the catalog's own default order).
- **`packages/shared`**: new `@clothing/shared/notifications` subpath —
  `NOTIFICATION_EVENTS`/`NOTIFICATION_CHANNELS` (the event catalog: label,
  help, documented variables, default channel fallback order, mirroring
  the Prisma enum by hand, same pattern `ShipmentStatusValue` already
  uses), `renderTemplate`/`formatTakaFromPoisha`, `estimateSmsLength`/
  `isGsm7Text` (the §6.11 SMS length/segment/encoding counter). New
  provider drivers: `generic_http`/`sslwireless`/`bulksmsbd` (sms),
  `brevo`/`resend` (email), `mock`/`whatsapp_cloud` (the new `whatsapp`
  capability) — each following the existing plain-`fetch`-no-SDK pattern.
  New `WhatsappDriver` interface in `providers/types.ts`. 17 new unit
  tests (SMS length/encoding across GSM-7/unicode/empty/multi-segment
  cases, template variable substitution, the mock WhatsApp driver) plus a
  pre-existing `courier-mock.test.ts` bug fixed along the way (see
  docs/DECISIONS.md — unrelated to this milestone's own scope).
- **`apps/api`**: new `NotificationsModule` —
  `NotificationDriversService` (resolves the active sms/email/whatsapp
  driver, mock fallback when nothing's configured, mirroring M5's
  `SmsProvidersService` pattern), `NotificationsService` (the core
  `enqueue()`/`renderForChannel()`/`createFallbackLog()`/`commonVariables()`
  used by other modules), `NotificationDispatchService` (the queued-send
  sweep — backoff on failure, creates the next fallback channel's log once
  retries exhaust, registered via `SchedulerService.registerRecurring`
  like M2/M3's sweeps), `NotificationTemplatesService`/`Controller`
  (list/update/preview/test-send), `NotificationChannelRulesService`/
  `Controller`, `NotificationLogsController` (paginated, filterable),
  `StaffNotificationsService`/`Controller` (in-app bell + best-effort
  email). New admin routes: `/admin/notifications/templates[...]`,
  `/admin/notifications/channel-rules[...]`, `/admin/notifications/logs`;
  new staff routes: `/staff/notifications[...]`. New permissions
  `notifications.manage`/`settings.notifications.write`; new settings
  `notifications.quietHoursEnabled/Start/End`,
  `notifications.smsCostPerSegmentPoisha`. Wired into the order lifecycle:
  `OrdersLifecycleService.transition()` enqueues the mapped event generically
  for every status it already handles (confirmed/shipped/out_for_delivery/
  delivered/partially_delivered/rejected_at_door/cancelled);
  `CheckoutService.placeOrder()` enqueues `order_placed` and calls
  `StaffNotificationsService.notifyNewOrder()`; `OtpService` now renders
  its message through the `otp_verification` template (still sent
  synchronously, not through the queued pipeline — see docs/DECISIONS.md)
  and logs the outcome. 13 new unit tests (notification enqueue/fallback
  channel selection, dispatch backoff/retry/exhaustion, the extended
  `OrdersLifecycleService` transition tests covering the new notification
  hook).
- **`apps/admin`**: new `/notifications` page (tabs: message templates per
  event×channel with bn/en editors + SMS segment/cost estimate + preview +
  test-send; channel matrix per event with up/down reordering; a
  filterable/paginated notification-logs table), new `NotificationBell`
  component (polls `/staff/notifications` every 30s, unread badge,
  mark-all-read) wired into the dashboard shell's sidebar footer. New
  `notifications` message namespace (bn + en) + `navNotifications` nav
  entry + bell-related `shell.*` strings.

### Verified

- `pnpm typecheck`/`pnpm lint`/`pnpm test` pass per-package across every
  touched package (`@clothing/shared`: 96 tests; `@clothing/db`: 7 tests;
  `api`: 235 tests — 25 new; `admin`: typecheck/lint clean) — same
  per-package-is-authoritative caveat as every prior milestone (full
  workspace `lint`/`typecheck` in parallel via Turbo still intermittently
  OOMs on this Windows machine).
- `pnpm --filter api run build` (`nest build`) succeeds.
- **Ran the real API dev server with no database available**: the full DI
  graph resolves (`NotificationsModule` wires cleanly into
  `CheckoutModule`/`OrdersLifecycleModule`/`CustomerAuthModule` with no
  circular-dependency error), every new route maps correctly (confirmed via
  curl: `/admin/notifications/templates[...]`, `/admin/notifications/
  channel-rules[...]`, `/admin/notifications/logs`, `/staff/notifications
  [...]` all return 401 unauthenticated rather than 404; `/health` stays
  200), and `POST /store/auth/otp/send` / `POST /store/checkout/place-order`
  still fail with the real "can't reach database" error / a 400 validation
  error respectively, not a code-bug crash — same graceful-degradation
  property verified every milestone since M0.
- **Ran the real admin dev server** and confirmed `GET /notifications` and
  `GET /en/notifications` both render 200 (the new tabbed page compiles and
  mounts without crashing) against the real `next dev` server.

### Not verified in this environment

- No live Postgres, so: the actual dispatch sweep's full lifecycle
  (`notification_logs` row created → picked up by the sweep → driver called
  → backoff-retried on failure → falls back to the next channel once
  exhausted) is unit-tested against a mocked Prisma client, not run live.
  The acceptance scenario's literal "place → confirm → ship → deliver,
  watch messages go out, switch an event's channel order, see it take
  effect" was never clicked through in a browser against seeded data.
- SSL Wireless, BulkSMSBD, Brevo, Resend, and the WhatsApp Cloud API driver
  are implemented against publicly/community-documented API shapes with no
  live merchant account to verify against — same caveat accepted for every
  real driver since M5 (SSLCommerz/bKash/Nagad/Steadfast/Pathao/RedX).
- `pnpm build`'s pre-existing static-export failure (flagged in M6,
  unrelated to this milestone) still reproduces — this time naming
  `/bn/integrations`/`/bn/returns` as the "collateral" page, matching the
  already-documented "a different one each run" pattern exactly.

### Known issues / explicitly deferred

- `return_requested`/`return_approved`/`refund_processed` are not wired to
  any notification event this milestone (not in the event catalog at all
  yet) — the order-lifecycle events the acceptance scenario actually names
  (placed/confirmed/shipped/delivered, plus partially_delivered/
  rejected_at_door/cancelled for completeness) are. Adding them is a
  catalog entry plus a call into `NotificationsService.enqueue()` from
  `ReturnsService`/the refund-creation path, not a new mechanism.
- `processing`/`packed`/`on_hold`/`expired`/`returned_to_sender`/
  `returned_to_warehouse`/`completed` order statuses don't notify the
  customer (no example in the spec's own acceptance text calls for it;
  easy one-line additions to `ORDER_STATUS_TO_NOTIFICATION_EVENT` later).
- Quiet hours and marketing opt-out have real settings and a real consent
  data model (`Customer.marketingConsentSms/Email/Whatsapp`, M5) but no
  enforcement point — nothing marketing-flagged exists before M8's
  campaigns (see docs/DECISIONS.md).
- OTP's message locale is always `bn` — the storefront request's locale
  isn't threaded into `OtpService.send()` yet.
- The WhatsApp Cloud API driver sends plain text, not a real Meta-approved
  template with parameters — business-initiated messages outside an open
  session will be rejected by Meta in production (documented directly on
  `WhatsappDriver` in `providers/types.ts`).
- The channel-matrix admin UI reorders with up/down buttons, not
  drag-and-drop; the template editor is plain bn/en textareas, not a
  rich-text/variable-autocomplete editor (same MVP trade-off made
  repeatedly since M1's settings UI).
- SSL Wireless's balance isn't exposed (no publicly documented endpoint
  found) — only BulkSMSBD's `balance()` is wired.
- Staff notifications cover exactly one event ("new order") — not a
  general-purpose staff-notification-per-event system; see
  docs/DECISIONS.md for why that's deliberate, not a gap.

---

## Milestone 8 — Marketing basics, customers, reviews, tracking, reports

Status: complete (§16 M8) at the code/test level. The acceptance scenario
("a purchase produces client and server Purchase events with the same
event_id, verified in the event log; feeds validate against the
platforms' required fields") is implemented and unit-tested
(`feed-xml.spec.ts` checks every required field is present; the
client/server event-id link is traced end to end through
`checkout-view.tsx` → `Order.trackingEventId` → `TrackingService.
recordPurchase`) and boot-tested for wiring, but not run live against
seeded data — see "Not verified" below, same limitation as every prior
milestone.

### Built

- **`packages/db`**: `DiscountCode` (bulk unique codes), `Segment`
  (customer segments — rules only, no membership table, see
  docs/DECISIONS.md), `Review` + `ProductQuestion` (+ `ReviewFitFeedback`/
  `ReviewStatus`/`ProductQuestionStatus` enums), `TrackingEventLog` (+
  `TrackingEventLogStatus`); `Order` gained `trackingEventId`. One
  hand-written migration (`20261105090000_marketing_customers_reviews_
  tracking`), generated via `prisma migrate diff`, confirmed byte-identical
  to a fresh diff before committing, same reasoning as every prior
  milestone's migration.
- **`packages/shared`**: three new `tracking`-capability provider drivers
  (`meta_capi`, `ga4_mp`, `tiktok_events`, each alongside a `mock`) —
  SHA-256-hashed PII where each platform requires it, plain `fetch`, no
  vendor SDK, same pattern as every real driver since M5. New permissions
  (`customers.manage`, `reviews.manage`, `reports.read`, `settings.
  tracking.write`, `settings.feeds.write`) and settings (`tracking.*`
  pixel ids + Purchase-event timing, `feeds.enabled`/`secretToken`,
  `reviews.autoApprove`). 3 new unit tests (mock tracking driver).
- **`apps/api`**: `DiscountsService` gained bulk-code generation/listing
  and a usage report; `CustomersModule` gained `CustomersAdminController`/
  `Service` (list/profile/tags/notes/block/merge) and `SegmentsController`/
  `Service` (CRUD + live preview count + members, rules →
  `Prisma.CustomerWhereInput` via `segment-rules.ts`, mirroring M2's
  `collection-rules.ts`); new `ReviewsModule` (admin moderation + rating
  recompute; store submit/list/helpful/photo-upload, verified-purchase-
  gated) and `ProductQuestionsModule` (admin answer/hide; store ask/list);
  new `TrackingModule` (`TrackingDriversService`/`Service`/
  `DispatchService` — several active instances at once, like M6's
  couriers, not the sms/email/whatsapp single-winner pattern; registered
  via `SchedulerService.registerRecurring`) wired into `CheckoutService.
  placeOrder()` (placement-timed Purchase) and `OrdersLifecycleService.
  transition()`'s `confirmed` branch (confirmation-timed Purchase, per the
  `tracking.purchaseEventTiming` setting); new `FeedsModule` (on-demand
  Meta-catalog/Google-Merchant XML, one shared builder, secret-token-gated);
  new `DashboardModule` (KPIs: revenue/orders/AOV/conversion/delivered/
  rejection rate/new-vs-returning/orders-by-status/top-products/low-stock/
  live-visitors/active-carts/pending-COD/integration-failure alerts); new
  `ReportsModule` (sales/products/courier/staff/discounts/search-terms,
  each with CSV export via a from-scratch `toCsv` helper). **Bugfix**: the
  admin Integrations page's capability tab list had silently missed
  payment/courier/captcha/fraud_check (M5/M6) and whatsapp (M7) the entire
  time — fixed while wiring `tracking`'s own tab (see docs/DECISIONS.md).
  22 new unit tests (segment rules, feed XML required-field coverage, CSV
  writer, tracking dispatch retry/failure, two new `OrdersLifecycleService`
  tracking-hook cases).
- **`apps/admin`**: nine new pages — `/discounts` (CRUD + bulk-code
  generator + usage report), `/flash-sales` (CRUD with inline item rows),
  `/customers` + `/customers/[id]` (list, profile with tags/notes/block/
  merge), `/segments` (rule-JSON builder + live preview count),
  `/reviews` (moderation queue with photo thumbnails + reply), `/
  product-questions` (answer/hide queue), `/reports` (6 report tabs, date
  range, CSV export link), `/feeds` (enable toggle, token generator, the
  two computed feed URLs). Dashboard home page replaced with real KPIs
  (today/7d/30d, clickable order-status counts). New `discounts`/
  `flashSales`/`customers`/`segments`/`reviews`/`productQuestions`/
  `reports`/`feeds`/`dashboard` message namespaces (bn + en).
- **`apps/storefront`**: PDP gained `ProductReviews` (list, helpful count,
  photos, admin replies, fit-feedback badges) and `ProductQnA` (ask +
  answered list); `/account` gained a "write a review" link per delivered
  order to a new `/account/orders/[id]/reviews` page (per-item rating/
  fit/photo-upload/body form — review *submission* lives here, not the
  PDP, since verified-purchase needs an `order_item_id` only the order
  detail has, see docs/DECISIONS.md); `/search` now fires a `search`
  analytics event (term + result count) for the new search-terms report;
  the root layout gained `TrackingScripts` (GTM/Meta/GA4/TikTok bootstrap
  snippets, `next/script` `afterInteractive`, skipped entirely when cookie
  consent is required and no consent banner exists to grant it); checkout
  now generates a `trackingEventId` client-side, sends it (+ `_fbc`/`_fbp`
  cookies) with `placeOrder`, and the success page's new `PurchaseTracker`
  fires the client `fbq`/`gtag`/`ttq` Purchase call with that same id.

### Verified

- `pnpm typecheck`/`pnpm lint`/`pnpm test` pass per-package across every
  touched package (`@clothing/shared`: 99 tests; `@clothing/db`: 7 tests;
  `api`: 257 tests — 22 new; `storefront`: 10 tests; `admin`: typecheck/
  lint clean) — same per-package-is-authoritative caveat as every prior
  milestone (full workspace `lint`/`typecheck` in parallel via Turbo still
  intermittently OOMs on this Windows machine).
- `pnpm --filter api run build` (`nest build`) succeeds.
- **Ran the real API dev server with no database available**: the full DI
  graph resolves (`TrackingModule`/`FeedsModule`/`DashboardModule`/
  `ReportsModule` and the extended `CustomersModule`/`DiscountsModule`
  wire cleanly into `CheckoutModule`/`OrdersLifecycleModule` with no
  circular-dependency error), every new route maps correctly (confirmed
  via curl: all `/admin/*` routes return 401 unauthenticated rather than
  404; `/store/reviews/*`, `/store/product-questions/*`, `/feeds/*.xml`
  fail with the real "can't reach database" `PrismaClientInitializationError`
  rather than a code-bug crash; `/store/checkout/place-order` still 400s
  via Zod validation with the new tracking fields present in the body).
- **Ran the real admin dev server**: all nine new pages plus the
  dashboard home page return 200 (bn and en) against a real `next dev`
  server, no runtime crash.
- **Ran the real storefront dev server**: `/search` and `/checkout/
  success` (with `orderId`/`eventId`/`total` query params) both return
  200 with no runtime error; the home page's pre-existing 404 (no CMS
  "home" page reachable with no database) is unchanged from M3's own
  established behavior, confirmed not caused by the new `TrackingScripts`
  component (no error logged for that request).

### Not verified in this environment

- No live Postgres, so: the tracking dispatch sweep, dashboard KPIs, and
  every report's actual output were exercised against pure logic (unit
  tests) or boot-tested for wiring, never run against real seeded data —
  the acceptance scenario's literal "place an order, see matching client
  and server Purchase events in the tracking log" was never clicked
  through.
- The three real tracking drivers (Meta CAPI, GA4 MP, TikTok Events API)
  and both feed endpoints are implemented against each platform's own
  published XML/API shape with no live ad account/Business Manager to
  verify against — same caveat accepted for every real driver since M5.
- The admin's nine new pages and the storefront's PDP reviews/Q&A/
  tracking-script wiring were boot-tested (every route 200, no crash) but
  not click-tested against seeded data.
- `pnpm build`'s pre-existing static-export failure (flagged in M6,
  unrelated to this milestone) still reproduces on the storefront app,
  this time naming `/en/checkout` as the "collateral" page — matching the
  already-documented "a different one each run" pattern exactly.

### Known issues / explicitly deferred

- `buy_x_get_y`/`bundle_price`/`tiered` discount value types are neither
  in the pricing engine nor the admin UI — only percent/fixed/
  free_shipping (M5's engine) have a "full UI" this milestone; see
  docs/DECISIONS.md for why completing the other three was traded off
  against this milestone's other five areas.
- Customer segments have no materialized membership table — every
  read computes membership live from the rule tree (deliberate, not a
  performance gap at this scale; see docs/DECISIONS.md).
- Review photo uploads bypass the media library entirely (direct
  `StorageDriver` injection) — no usage tracking, no multi-size variants,
  orphaned files from an abandoned draft are never cleaned up.
- The WhatsApp Cloud API / Meta CAPI / GA4 MP / TikTok Events API drivers
  are all "re-verify against a live account before launch" — standard
  caveat, not specific to this milestone.
- Product feeds are on-demand only — §10.5's "generated by a job (and on
  demand)" only has the "on demand" half built; pre-generation/caching is
  deferred until a catalog large enough to need it exists.
- Dashboard "conversion rate" and "new vs returning" are documented
  approximations (no funnel/session table, no event-sourced order
  history) — see docs/DECISIONS.md for exactly what each one actually
  measures.
- Cookie-consent-gated tracking scripts fail closed (don't load at all)
  because no real consent banner exists yet to grant them — same root
  cause as M3's own flagged gap, now visibly affecting a second feature.
- Loyalty/gift cards/affiliates/referrals (§5.8) remain entirely out of
  scope, per the milestone's own "except loyalty/gift cards" — phase 2/3
  per §16.
- Reports don't yet support a "compare period" as a server concept — the
  admin UI would need to fetch the same report twice (two ranges) and diff
  client-side; not built this milestone.

---

## Milestone 9 — Hardening and launch readiness

**Status: complete**, with the same no-Docker/no-live-Postgres/no-browser
caveat as every prior milestone — see "Not verified in this environment"
below. Three parallel audit forks (security/§12, performance+
accessibility/§13, test-coverage/§14) surveyed the codebase first; every
item below responds to a cited finding, not a guess (full reasoning in
`docs/DECISIONS.md`, 2026-11-06).

### Built

- **Security (§12)**: mandatory staff TOTP 2FA (`StaffAuthGuard` blocks
  every route except `/auth/{me,logout,totp/setup,totp/confirm}` until
  enabled; a forced `/totp-setup` admin page); real enforcement of the
  admin-configurable `security.passwordMinLength` (default raised to 12);
  login rate limiting/lockout (`StaffUser.failedLoginAttempts`/
  `lockedUntil`, `security.loginMaxAttempts`/`loginLockoutMinutes`);
  session idle timeout (`StaffSession.lastSeenAt`,
  `security.staffSessionIdleMinutes`) plus "log out all sessions"
  (`POST /auth/logout-all`); CSP + HSTS + the usual security headers on
  both Next apps (admin static via `next.config.mjs`, storefront via its
  `proxy.ts` — see "Known issues" for why it's `'unsafe-inline'` rather
  than nonce-based) and baseline headers on the API; MIME-sniffing +
  SVG/HTML rejection on both real upload paths (`media.service.ts`,
  `store-reviews.service.ts`); an SSRF guard
  (`packages/shared/src/providers/ssrf-guard.ts`, resolves-and-checks the
  real address, not just the literal hostname) applied to the generic
  HTTP SMS driver; a shared-secret `X-Webhook-Secret` check on courier
  webhooks (`webhookSecret` added to the 3 real courier drivers'
  config); customer data export + anonymize (`customers.privacy`
  permission, `CustomersAdminService.exportData`/`.anonymize`); audit
  logging on report CSV exports; an admin IP allow-list
  (`security.adminIpAllowlist`, IPv4 CIDR); `.github/dependabot.yml` +
  a non-blocking `pnpm audit` CI step.
- **Performance (§13.1)**: `@@index([createdAt])` on `Order`/`Shipment`;
  an in-memory 60s facet-count cache in `StoreCatalogService`;
  `infra/loadtest/browse-cart-checkout.js` (k6, written per spec, not
  run — see below).
- **Accessibility**: one real unlabeled icon-only button fixed
  (`orders/new` line-item remove); `@axe-core/playwright` wired into both
  new E2E specs.
- **Testing (§14)**: `packages/db/factories` (new — staff user, customer,
  category, product+variant+stock, stock location); a real integration
  test harness (`apps/api/test/setup.ts`, boots the actual `AppModule`)
  + 3 integration spec files (auth/mandatory-2FA/RBAC/lockout; the
  concurrent-last-unit-purchase race — M5's acceptance line, never
  actually run before now; courier webhook secret verification); 2
  Playwright E2E specs (storefront guest COD checkout
  browse→PDP→cart→checkout→success→track; admin Super-Admin
  setup→forced-2FA→re-login, with real TOTP codes computed from the
  API's own `otpauthUrl`) — `e2e/` also gained its own
  `tsconfig.json`/`eslint.config.cjs` (it had neither, so
  `pnpm typecheck`/`pnpm lint` silently skipped it entirely before);
  `returns.service.spec.ts` (the one missing unit test the audit
  specifically flagged — return eligibility); `test:coverage` scripts +
  CI artifact upload (informational, no gate — see "Known issues");
  `.github/workflows/ci.yml` gained `dependency-audit`,
  `integration-tests` (real Postgres 16 service container), and `e2e`
  (Postgres + demo seed + all 3 apps + Playwright, smoke on PRs to
  `main`/full nightly) jobs.
- **Demo seed**: `seedDemoCatalog()` (2 categories, 4 products — one
  real S/M/L sized, one deliberately low-stock — real inventory at the
  default location), wired into `pnpm db:seed:demo`.
- **Launch checklist**: `/launch-checklist` admin page
  (`launch_checklist.read`), backed by `LaunchChecklistService.compute()`
  — every item queries real state except "sitemap submitted"
  (`ops.sitemapSubmitted`, a plain toggle). `POST
  /public/cron/backup-heartbeat` + `.github/workflows/backup.yml` (free
  mode) + an upgraded `infra/scripts/backup-cron.sh` (VPS sidecar, now
  does real R2 upload + 30-day local pruning, closing a TODO that had
  been open since M0) feed its "backups running" item.
- **Docs**: `docs/ADMIN_GUIDE.md` (full rewrite, bn/en, one section per
  admin module — ~30 modules) and `docs/DEPLOYMENT.md` (full rewrite:
  free-tier table, VPS mode, free→VPS migration steps, backups/restore,
  launch checklist, env vars).
- Next.js bumped 16.4.2 → 16.4.5 in both Next apps (legitimate patch
  release; didn't fix the build issue below, kept anyway).

### Verified

- Every new/changed unit test passes: `shared` 107/107 (+8), `db` 7/7
  (unchanged — factories have no dedicated unit test, they're exercised
  by the integration specs that use them), `api` 279/279 (+22,
  including the new `returns.service.spec.ts`, `ip-allowlist.spec.ts`,
  `media-sniff.spec.ts`), `storefront` 10/10 (unchanged).
- `pnpm typecheck`/`pnpm lint` clean across every touched package,
  including `e2e/` (now wired into both commands for the first time) and
  the new `apps/api/tsconfig.test.json` (so `test/*.integration-spec.ts`
  is typechecked too, not just `src/`).
- `prisma generate` + `prisma migrate diff` succeed against the updated
  schema (`StaffUser.failedLoginAttempts`/`lockedUntil`,
  `StaffSession.lastSeenAt`, `Order`/`Shipment` `createdAt` indexes).
- `pnpm test:integration` reaches real Prisma queries inside every one
  of the 8 new integration tests and fails with exactly one error,
  `PrismaClientInitializationError: Can't reach database server`, on
  all of them — confirms the full `AppModule` DI graph, every new
  module's wiring, and every test's query syntax are correct; only a
  live Postgres is missing here.
- `apps/api`'s real unit-test coverage was measured (`vitest run
  --coverage`): ~61% statements / 51% branches / 57% functions overall,
  with every §14-named business-rule file specifically well above that
  (discount-math ~93%, shipping-calc ~89%, risk-score ~90%,
  payment-rules-engine ~73%).

### Not verified in this environment

Same root cause flagged in every milestone since M0 (no Docker, no live
Postgres, no browser here):

- The 3 integration spec files and 2 E2E spec files are real, typecheck-
  and-lint-clean code that has never actually run to completion — see
  "Verified" above for exactly how far they got.
- The security/performance items that need a live request to prove
  (mandatory-2FA lockout actually blocking a browser session, the
  concurrent-checkout race actually resolving to one winner, CSP headers
  actually present in a real response, the facet cache actually being
  hit on a second request) are only verified by the (unrun) tests above
  and by direct code reading — not by a browser or curl against a live
  server.
- `infra/loadtest/browse-cart-checkout.js` (k6) has never been run — no
  k6 binary, no deployment to point it at.
- `.github/workflows/backup.yml` and the upgraded
  `infra/scripts/backup-cron.sh` have never run against a real Postgres/
  R2 account.
- `pnpm build` fails on the pre-existing static-export crash (see "Known
  issues") — confirmed to reproduce identically across Turbopack vs.
  Webpack and Next 16.4.2 vs. 16.4.5, so this is not something a live
  environment with Docker would have let this session actually fix
  either; it needs either an upstream Next.js fix or a debugger attached
  to the actual build-worker process.

### Known issues / explicitly deferred

- **`pnpm build` still fails** on the `/_global-error` + one random-each-
  run page `TypeError: Cannot read properties of null (reading
  'useContext')` crash, flagged since M4/M6. This milestone did a real
  investigation (not just re-flagged it): confirmed across both bundlers
  and two Next patch versions, ruled out two `experimental` config flags
  (one does nothing, one makes it worse), and concluded it's a genuine
  upstream Next.js 16.4.x production-build-worker bug, not application
  code — see `docs/DECISIONS.md` for the full trail. **This means CI's
  `build` and `e2e` jobs will show red** until either Next.js ships a
  fix or someone can attach a debugger to the real build-worker process,
  neither possible in this sandbox. Every other check (lint, typecheck,
  unit tests, the dependency-audit job) is unaffected.
- Storefront's CSP uses `'unsafe-inline'` + a tight host allow-list on
  `script-src`, not per-request nonces as §12 literally asks for —
  threading a nonce through `next-intl`'s own `proxy.ts` middleware
  turned out to need either dropping next-intl's middleware entirely or
  composition support it doesn't currently expose; see
  `docs/DECISIONS.md` for what was tried.
- A full `next/image` migration (real `srcset`/blur placeholders) is
  still not done — every image-bearing API response would need to carry
  a full `MediaRef` object instead of a flat URL string, a cross-cutting
  DTO change across catalog/search/cart/reviews this milestone didn't
  risk doing blind. `mediaImageLoader` remains the ready extension point.
- Unit-test coverage (§14 "≥ 80% for domain folders") is measured and
  reported, not gated — the codebase has no clean domain/infrastructure
  folder split for an 80% threshold to apply to without being arbitrary;
  see `docs/DECISIONS.md`.
- The storefront checkout-success page doesn't surface the order number,
  so there's no "track it now" link after placing an order — a real UX
  gap surfaced while writing the guest-checkout E2E spec (which works
  around it via response interception), not fixed here since it's a
  product decision about that page's content, not a hardening task.
- Everything M1–M8 already listed as a known gap (buy_x_get_y/bundle_
  price/tiered discounts, non-materialized segments, review photo
  uploads bypassing the media library, unverified real provider drivers,
  on-demand-only feeds, approximated dashboard metrics, fail-closed
  cookie-consent tracking, loyalty/gift cards/referrals out of scope,
  no report "compare period") is unchanged by this milestone — none of
  it was in scope for M9's own acceptance line.

---

## Milestone 10 — Conversion features

Status: complete (§16 M10) at the code/test level, with the same
no-Docker/no-live-Postgres/no-browser caveat as every prior milestone —
see "Not verified in this environment" below. Q&A (`ProductQuestion`)
already shipped in M8, so this milestone's real scope was the other
eight: size recommender + measurements, shop-the-look bundles, lookbook
hotspots, abandoned-cart recovery, preorders, the self-service exchange
portal's guest gap, storefront PWA + web push, and audience-targeted
blocks, plus a blog/lookbook content type.

### Built

- **`packages/db`**: one hand-written migration
  (`20261107090000_conversion_features`, generated via `prisma migrate
  diff` against the committed schema, same reasoning as every prior
  milestone's migration — no live DB/shadow DB here). `CustomerMeasurement`
  (one profile per customer), `BundleItem` (+ `BundleDiscountType` enum),
  `PushSubscription`, `BlogPost` (reuses the exact `blocksDraft`/
  `blocksPublished` two-column shape `Page` established in M3). `Product`
  gained `preorderReleaseDate`/`preorderLimit`/`bundleDiscountType`/
  `bundleDiscountValue`; `Cart` gained `abandonedAt`/`recoveredAt`/
  `recoverySequenceStep` (+ a `[status, lastActivityAt]` index for the
  sweep). `NotificationChannel` gained `push`; `NotificationEvent` gained
  `abandoned_cart_1/2/3` and `back_in_stock`. `pnpm db:seed` now also
  seeds bn/en message-template content for those four new events (the
  existing per-event-per-channel seed loop already skips any event with
  no entry, so this was additive, not a structural change).
- **`packages/shared`**: `catalog/size-recommender.ts`
  (`recommendSize()` — weighted nearest-match over whichever size-chart
  columns and customer measurements both have values for, with
  snug/regular/loose shifting one size step) and `catalog/
  bundle-pricing.ts` (`matchBundles()` — how many whole copies of a
  bundle a cart's quantities support, and the per-component poisha
  discount share, with the last component absorbing any rounding
  remainder so shares always sum exactly to the bundle's own total
  discount) — both pure/isomorphic, both fully unit-tested (17 + 7 cases:
  exact/nearest/boundary/low-confidence matches and case-insensitive
  bust→chest column aliasing; percent/fixed-price/multi-copy/partial-match/
  over-discount-clamped bundle scenarios). New permissions
  (`marketing.abandoned_carts.manage`, `blog.manage`) and settings
  groups (`marketing.abandonedCart.*` — enabled/idleMinutes/
  stepDelaysMinutes/couponStep/couponPercentOff/couponValidHours;
  `sizeRecommender.enabled`; `pwa.*` — enabled/shortName/pushEnabled/
  vapidPublicKey/vapidPrivateKey (secret); `blog.postsPerPage`).
  `NOTIFICATION_CHANNELS` gained `push`; `NOTIFICATION_EVENTS` gained the
  four new events with documented variables/default channel orders
  (`push` leads most of them — reachable with no phone/email at all once
  a guest has the PWA installed).
- **`packages/blocks`**: a new `lookbook` block type (image + tappable
  hotspots, each tied to a real product id; `HotspotOverlay.tsx` is the
  block's only client-side piece — a popover card on tap/click, fetched
  server-side via the existing `/store/catalog/products?source=manual`
  endpoint, same as `product_grid`). `BlockVisibility` gained an
  `audience` field (`{ mode: "all" | "guest" | "customer", segmentIds? }`)
  + `needsAudienceGate()`.
- **`apps/api`** — one module per bounded context, as established:
  - `size-recommender` (`CustomerMeasurement` CRUD at `/store/account/
    measurements`; `POST /store/size-recommender/products/:slug` — an
    explicit measurement override, or the logged-in customer's saved
    profile, or a clean `MEASUREMENTS_REQUIRED` error for a true guest
    with neither).
  - `products` gained `BundleItemsController`/`Service` (a product-editor
    tab, same shape as M2's relations tab — add/update/remove an exact
    component variant + quantity) and the preorder/bundle fields on the
    existing create/update DTOs.
  - `cart` gained `CartService.addBundle()` + `POST /store/cart/bundles/
    :bundleProductId` (adds every component as an ordinary line in one
    call); `CartPricingService` gained preorder availability (bypasses
    the on-hand clamp entirely — uncapped, or capped against real
    non-cancelled-order sales when `preorderLimit` is set) and live
    bundle-discount matching (`applyBundleDiscounts()`, called before the
    discount engine sees `lineTotal`, so a bundle match and a coupon
    stack correctly and the order's own line totals already reflect it —
    no new concept for `CheckoutService` to re-derive).
  - `checkout`/`StockReservationService` gained `allowNegative` per
    reservation line (preorders skip the `available >= q` conditional
    UPDATE guard entirely, re-verified fresh at placement time via
    `CartPricingService.price()`'s own clamp — golden rule 6).
  - `abandoned-cart` (`AbandonedCartService` — two independent recurring
    sweeps via `SchedulerService.registerRecurring`: `markAbandoned()`
    flips an idle, contactable, non-empty `active` cart to `abandoned`;
    `runSequence()` walks every abandoned cart through up to 3 reminders,
    each step's delay measured from `abandonedAt` itself — not from the
    previous reminder, so a missed tick never compounds — attaching a
    freshly-minted single-use % `Discount` code on the configured step).
    `CartService.markConverted()` now also sets `recoveredAt` (reporting
    only; `status` becomes `converted` either way). New admin-only
    `GET /admin/abandoned-carts` list.
  - `push` (`PushService` — VAPID keypair generation/storage via the
    settings registry rather than `provider_instances` (see
    docs/DECISIONS.md), subscribe/unsubscribe, send-with-dead-subscription-
    cleanup-on-404/410); wired into `NotificationDriversService`/
    `NotificationsService` as the 4th channel (`contactFor('push', …)`
    resolves to a customerId, not a phone/email). `notify-me` gained
    `NotifyMeService.fulfillForVariant()` — closes the M4 gap ("nothing
    actually sends the back-in-stock message"); `InventoryService.adjust()`
    calls it the moment a level's `available` crosses 0→positive.
  - `audience` (`GET /store/audience/me` — `{ loggedIn, segmentIds }`,
    computed live against M8's `SegmentsService.whereFor()`, same
    membership-check approach the segments admin UI already uses).
  - `blog` (admin CRUD + autosave-style `blocks` endpoint + publish,
    deliberately without `PagesService`'s edit-lock/version-history —
    see docs/DECISIONS.md; public list/detail).
  - `returns` gained `ReturnsService.createByTracking()` +
    `POST /store/returns/track` — the self-service exchange portal's
    guest path, closing the exact gap M6 flagged and deferred ("the
    anonymous order-tracking page links out to login rather than also
    supporting phone+order-number verification for this one flow"),
    verified the same way `OrdersController`'s existing track/cancel are.
  - `store-catalog`'s product-detail endpoint gained
    `preorderReleaseDate`/`preorderLimit`/`bundleDiscountType`/
    `bundleDiscountValue`/`bundleItems` (component product+variant+image,
    only populated for `productType: "bundle"`).
  - New dependency: `web-push` (pinned to the 3.6.x line, not the 4.0.0
    major that shipped literally the day this was written — see
    docs/DECISIONS.md) + `@types/web-push`.
- **`apps/admin`**: Product editor gained a `productType` selector +
  conditional preorder (release date, limit) and bundle-discount
  (type, value) fields, plus a "Bundle items" tab (shown only for
  `productType: "bundle"`) mirroring the relations tab's add/remove-by-id
  shape. New `/blog` (list + create) and `/blog/[id]` (title/slug/
  excerpt/tags + a JSON-textarea block editor, same "generic JSON
  fallback" trade-off M3's non-`hero` block types already accepted) +
  publish/delete. New `/abandoned-carts` (read-only list — contact,
  total, sequence step, abandoned/recovered timestamps). New `/push`
  (VAPID status + "generate keypair" + subscriber count + send-a-test-
  push). New nav entries + `blog`/`abandonedCarts`/`push` message
  namespaces (bn + en); `products` namespace gained the new field labels.
- **`apps/storefront`**: PDP gained `SizeRecommenderWidget` ("Find my
  size" — an inline 2-3-field form next to the size-chart button,
  highlighting the matching size button on success), a preorder badge +
  relabeled Add-to-cart/sticky-bar buttons (bypassing the out-of-stock
  branch entirely), and `BundleSection` ("shop this look" — every
  component with its own price, a combined-discounted total computed
  client-side the same way `bundle-pricing.ts` will authoritatively, and
  one "add the whole look" button). New `/account/measurements`
  (save a profile the recommender reuses by default) and a `PushOptIn`
  button on `/account` (a plain opt-in button, never an auto-prompt —
  browsers penalize those, and it's bad UX regardless). New `AudienceGate`
  client component + `BlockRenderer` wiring — the one client-rendered
  piece an otherwise server-rendered/cacheable page gets, and only for
  blocks that actually declare a non-`"all"` audience. New storefront PWA:
  `app/manifest.ts` (brand name/color read live from settings, per golden
  rule 1) + two `ImageResponse`-generated icon routes (a brand-color
  square with the brand's initial — no real logo-upload path exists yet,
  same gap M3 already flagged) + `public/sw.js` (navigation-fallback
  cache + Web Push `push`/`notificationclick` handlers) + `PwaRegister`.
  New `/blog` (list) + `/blog/[slug]` (rendered via the same
  `BlockRenderer` every CMS page uses — a "lookbook" post is just one
  built from the `lookbook` block, nothing else). `/track`'s
  `OrderTrackingView` gained an inline return/exchange request form for
  delivered orders, posting to the new guest endpoint.

### Verified

- `pnpm typecheck`/`pnpm lint`/`pnpm test` pass per-package across every
  touched package (`@clothing/shared`: 124 tests, 24 new; `@clothing/
  blocks`: 12 tests, unchanged — the new `lookbook` block has no dedicated
  unit test, see "Known issues"; `@clothing/db`: 7 tests, unchanged;
  `api`: 290 tests, 11 new — `inventory.service.spec.ts`'s 4 new
  back-in-stock-trigger cases and `abandoned-cart.service.spec.ts`'s 7
  cases covering the disabled-feature no-op, the idle-cart filter, the
  per-step-delay-measured-from-abandonment timing (including the
  "missed tick never compounds" case), the configured coupon step, and
  the sequence-length stop; `storefront`: 10 tests, unchanged — same
  "pure logic gets unit tests, UI components don't" pattern as every
  prior milestone).
- **Ran the real API dev server with no database available**: the full
  DI graph resolves — every new module (`SizeRecommenderModule`,
  `AudienceModule`, `AbandonedCartModule`, `PushModule`, `BlogModule`,
  the extended `ProductsModule`/`CartModule`/`InventoryModule`/
  `NotificationsModule`) wires cleanly with no circular-dependency error,
  and every new route maps correctly (confirmed via the boot log:
  `/store/account/measurements`, `/store/size-recommender/products/
  :slug`, `/store/audience/me`, `/store/cart/bundles/:id`,
  `/store/push/{subscribe,unsubscribe}`, `/admin/push/*`,
  `/admin/abandoned-carts`, `/admin/blog-posts/*` + `/store/blog-posts/*`,
  `/admin/products/:id/bundle-items/*`, `/store/returns/track`). The one
  boot attempt that didn't reach "ready" hit `EADDRINUSE` on port 4000
  (a leftover process from this same session, not a code issue) after
  every module had already initialized and every route had already
  mapped — confirmed from the log directly, not re-run.
- `pnpm --filter api run build` (`nest build`) succeeds.
- Read `CartPricingService.applyBundleDiscounts()` and the preorder
  branch of its per-item loop line by line specifically checking: bundle
  discounts are computed and applied to `lines[*].lineTotal` *before*
  `discountLines` is built from `lines`, so a coupon discount and a
  bundle discount never double-count or race against each other; the
  preorder clamp's `available` computation never calls the real
  inventory query at all for a preorder line (avoiding a pointless join
  against locations that will never hold preorder stock).

### Not verified in this environment

Same root cause flagged in every milestone since M0 (no Docker, no live
Postgres, no browser here):

- The full abandoned-cart recovery sequence as a live, scheduled,
  multi-hour sequence (mark → wait → reminder 1 → wait → reminder 2 →
  wait → reminder 3 with a real generated coupon) — each piece is
  unit-tested in isolation (see "Verified") but never run end-to-end
  against a real clock and a real Postgres.
- The literal "shop the look" / "find my size" / "preorder" PDP flows,
  the bundle-items/blog product-editor tabs, and the push opt-in button
  in a real browser against seeded data — typechecked, linted, and
  boot-tested for routing/DI correctness, not click-tested.
- Web Push itself: no real VAPID-signed push has ever been sent to a
  real browser's push service from this environment (no browser, no
  network path for a real push payload to arrive). `web-push`'s
  `generateVAPIDKeys()`/`setVapidDetails()`/`sendNotification()` call
  shapes are implemented against its own published API, same "re-verify
  against the real thing before launch" caveat already accepted for
  every real provider driver since M5.
- The new `20261107090000_conversion_features` migration has not been
  applied to a real Postgres instance — `prisma validate`/`prisma
  generate` both succeed, and the generated SQL was read in full before
  being committed, but "the rows it is supposed to work can be read and
  written for real" is unverified, same as every prior milestone's own
  migration.

### Known issues / explicitly deferred

- **The self-service exchange flow still has no variant picker on
  either path (account or guest/tracking) — a pre-existing M6 gap this
  milestone discovered rather than caused.** `createReturnRequestSchema`
  requires `exchangeForVariantId` per item when `type: "exchange"`, but
  neither `AccountReturnRequestView` (M6) nor the new tracking-page form
  collects one — both will surface the API's own
  `EXCHANGE_VARIANT_REQUIRED` error if a customer picks "exchange" and
  submits. What M10 actually closed is narrower and explicit: the guest
  (no-account) path now exists and is verified the same way as the
  logged-in one. A real fix needs a product/variant search-and-pick UI
  on both forms — tracked here as a real gap, not silently patched over.
- Bundle matching has a known edge case: if the same component variant
  appears in two different active bundles, both can match against the
  same physical units in the cart (no "already claimed by bundle X"
  bookkeeping). Unlikely for a small catalog's worth of curated looks,
  not safe to assume at scale.
- The lookbook block's hotspot editor is raw JSON (x/y percent + a
  product id) via the CMS page editor's existing generic-block-props
  fallback, not a visual "click the photo to place a dot" tool — same
  MVP trade-off every non-`hero` block type already accepted in M3.
- The blog/lookbook admin editor is title/slug/excerpt/tags + a JSON
  textarea for blocks, with no edit-lock, autosave, or version history
  (`PagesService` has all three; `BlogService` deliberately doesn't —
  see docs/DECISIONS.md).
- PWA icons are generated on the fly (brand color + initial letter) via
  `next/og`'s `ImageResponse`, not a real uploaded brand logo — no
  logo-upload path exists yet (flagged since M3's own known-issues list,
  still not built).
- Push notification titles default to a generic "Update" on every
  channel except email, because `MessageTemplate.subjectBn/subjectEn`
  are only ever populated for the `email` channel (M7's own design) and
  `PushService.sendRaw()` falls back to `subject ?? "Update"`. A real
  fix means either giving `push` its own subject convention or reusing
  the body's first line — not attempted here.
- `sizeRecommender.enabled` and `pwa.enabled`/`pwa.pushEnabled` are real,
  read settings, but only `pwa.*` are actually threaded through to gate
  the storefront's own UI (`PwaRegister`/`PushOptIn`/the manifest route);
  the PDP's "Find my size" widget shows whenever a product has a size
  chart, regardless of `sizeRecommender.enabled`. Wiring that one check
  through needs threading the setting into `ProductDetailView`'s server
  page, not attempted here.
- No demo bundle or preorder product exists in `seedDemoCatalog()` (M9) —
  exercising either feature against seeded data needs one created by
  hand first.
- The abandoned-carts admin list and the bundle-items/blog-posts admin
  endpoints are not paginated — fine at MVP scale, same trade-off several
  earlier milestones' admin screens already accepted.
- Everything M1–M9 already listed as a known gap and untouched by this
  milestone's own scope remains unchanged, including `pnpm build`'s
  pre-existing static-export crash (flagged since M4/M6, confirmed
  upstream Next.js 16.4.x bug in M9) — `nest build` (the API's own build)
  is unaffected and succeeds.

---

## Milestone 11 — Order operations automation

Status: complete (§16 M11) at the code/test level, with the same
no-Docker/no-live-Postgres/no-browser caveat as every prior milestone —
see "Not verified in this environment" below. Scope per §16: customer
self-confirmation, order-queue auto-assignment, Kanban view, merge/split,
automation rule builder with templates, auto courier assignment rules,
approval workflows, field-level permissions UI, admin PWA with push and
camera scanner.

### Built

- **`packages/db`**: one hand-written migration
  (`20261111090000_order_operations_automation`, produced with `prisma
  migrate diff` between the previous and current schema — no live/shadow
  DB here). New tables `automation_rules`, `automation_runs`,
  `courier_assignment_rules`, `approval_requests`; `orders` gained
  `confirmation_token` (unique), `confirmation_requested_at`,
  `merged_into_order_id`, `split_from_order_id` and an
  `[assigned_to, status]` index; `staff_users` gained
  `takes_order_queue`/`last_queue_assigned_at`; `push_subscriptions` gained
  `staff_user_id`. Enums: `OrderEventType` +`merge`/`split`/`automation`,
  `NotificationEvent` +`order_confirmation_request`. The seed adds bn/en
  template copy for the new event.
- **`packages/shared`**: `automation/` — the condition model and pure
  evaluator (`evaluateConditions`/`explainConditions`, ten operators,
  all/any), the order field catalog, the trigger list, the action zod
  schemas and six one-click rule templates (high-value → notify manager,
  3rd doorstep rejection → tag Risky, delivered → thank-you message,
  auto-confirm paid low-risk, high-risk → hold, first-order tag). New
  permissions (`automation.manage`, `orders.queue.manage`,
  `orders.merge_split`, `couriers.rules.manage`, `approvals.decide`,
  `approvals.bypass`, `settings.approvals.write`, `fields.customer_phone.read`,
  `fields.order_cost.read`) and settings (`orders.selfConfirm.*`,
  `orders.queue.*`, `security.fieldMasking.enabled`, `approvals.*`,
  `pwa.adminPushEnabled`).
- **`apps/api`** (new modules, all registered in `AppModule`):
  - `automation` — outbox (`AutomationOutboxService`, transactional, on
    `scheduled_tasks`), engine (rules by priority, per-run log, loop guard,
    `stopProcessing`, nine action types incl. a no-private-address HTTPS
    `call_webhook`), rule CRUD/templates/run history/dry-run
    (`POST /admin/automation/test`), and a shared `OrderContextService`.
    `OrdersLifecycleService.transition()` and checkout placement enqueue
    triggers; online-payment orders fire `order.placed` from
    `onPaymentSucceeded`.
  - `order-confirmation` — token + `order_confirmation_request` message,
    `GET/POST /store/order-confirmation/:token` (confirm / cancel,
    expiry, idempotent).
  - `order-queue` — `pickAssignee` (round-robin / least-open), guarded
    `autoAssign`, `GET /admin/order-queue/{mine,kanban,staff}`, per-staff
    participation switch.
  - `orders` — `OrderMergeSplitService` + `merge-split-math.ts`;
    `POST /admin/orders/merge`, `POST /admin/orders/:id/split`; order list/
    detail now apply field-level masking.
  - `courier-rules` — CRUD + preview; `POST /admin/orders/:id/shipments`
    accepts `auto: true`.
  - `approvals` — request/list/mine/approve/reject with replay executors;
    order-edit price/shipping overrides and large refunds are gated.
  - `push` — staff subscriptions and `sendToStaff`; staff notifications now
    push too; new alerts for high-risk order, payment failure, approval
    request, low-stock crossing.
- **`apps/admin`**: Order board (drag-and-drop Kanban), My order queue +
  team switches, Automation (builder, templates, run history, test panel),
  Courier rules (+ preview), Approvals inbox, Field access matrix, order
  page Merge & split panel / "Assign from queue" / "Auto (by courier rules)"
  booking, approval-pending notices on order edit and refunds; PWA
  (`/manifest.webmanifest`, generated icons, push-only `sw.js`, "turn on
  alerts" per device) and the camera barcode scanner on the packing screen.
  All strings in both `en.json` and `bn.json`.
- **`apps/storefront`**: `/{locale}/confirm-order/[token]` (noindex,
  no-referrer).
- Decisions recorded in `docs/DECISIONS.md` (nine entries dated
  2026-11-11) and bilingual guide entries in `docs/ADMIN_GUIDE.md`.

### Verified

- `tsc --noEmit` clean for `packages/shared`, `apps/api`, `apps/admin`,
  `apps/storefront`; `eslint` clean (0 errors) for those four.
- Unit tests, all green: `packages/shared` 137 (new: condition evaluator
  and template validity), `apps/api` 363 (was 342; new: merge/split math
  incl. rounding balance, automation engine, approvals, order queue,
  assignee picking, order confirmation, courier rule selection, field
  masking, webhook SSRF guard).
- `pnpm test` run all-at-once exhausts memory on this machine
  (`FATAL ERROR: Zone Allocation failed`) — a machine limit, not a test
  failure; each package passes when run on its own.

### Not verified in this environment

- **The migration has not been applied to any database** and the Prisma
  client's native engine could not be regenerated (the query-engine DLL was
  locked by a running process), so only the generated *types* are current.
  Before running: stop the dev servers, then `pnpm db:generate`,
  `pnpm db:migrate:deploy`, `pnpm db:seed` (the seed grants the new
  permissions to Super Admin and adds the new message template).
- Nothing was exercised in a browser: Kanban drag-and-drop, the condition/
  action builders, the PWA install flow, real web-push delivery to a staff
  device, and the camera scanner (needs a Chromium browser over HTTPS or
  localhost) are all untested end to end.
- No integration/E2E test covers the outbox → scheduler → engine path
  against real Postgres; the engine, queue, approvals and confirmation
  services are unit-tested with mocked Prisma only.

### Known issues / explicitly deferred

- Automation latency: rules run on the next scheduler tick (≤ 60 s with
  `WORKER_MODE=embedded`, or the external cron cadence).
- Queue auto-assignment happens at placement only; orders created before
  the setting was turned on are not back-filled.
- Merge/split do not re-evaluate discount eligibility, and split creates a
  *new order* rather than multiple shipments of one order (see
  DECISIONS.md).
- Field masking covers the order list/detail, the Kanban board and the
  queue; the customers list/profile/export, returns and reports still show
  full phone numbers and cost data. The seeded roles other than Super Admin
  do not yet hold the new `fields.*` permissions, which is why enforcement
  ships switched off.
- Approval gating covers two actions (price/shipping overrides on order
  edit; large refunds). Other candidates in §16 (discounts over a limit,
  cancelling after packing) are not gated yet — adding one is an executor
  plus a gate in that service.
- WhatsApp interactive buttons are not vendor-specific; the link works on
  every driver (DECISIONS.md).
- The Kanban only allows dropping on pending / on-hold / confirmed /
  processing; later steps belong to the fulfillment screens.
- The `call_webhook` action is fire-and-forget (no signing, no retry).
- Low-stock push fires on an order-driven crossing only, not on manual
  stock adjustments or imports.
- `BarcodeDetector` is Chromium/Android only; Safari/Firefox fall back to
  typing or a USB/Bluetooth scanner.
- The admin PWA is installable and receives push but is intentionally not
  usable offline (the service worker caches nothing).
- The storefront confirm page and the tracking view use inline bn/en copy
  rather than `ui_strings` (DECISIONS.md).
- This commit also carries the previously uncommitted
  `inventory_levels.available` fix (`@default(dbgenerated())` in
  `schema.prisma` + its DECISIONS.md entry) because it lives in the same
  files; `docs/TESTING_GUIDE.md` was pre-existing and untracked and is
  deliberately not part of it.
- Everything M1–M10 already listed as a known gap and untouched here
  remains unchanged, including `pnpm build`'s pre-existing static-export
  crash.

---

## Milestone 12 — Inventory and finance

Status: complete (§16 M12) at the code/test level, with the same
no-Docker/no-live-Postgres/no-browser caveat as every prior milestone —
see "Not verified in this environment" below. Scope per §16: size-curve
analysis, purchase/production orders and receiving, suppliers, stock
transfers, stock takes, dead stock & markdown suggestions, COD
reconciliation (file import + API where available), gateway settlements,
true profit report, scheduled email reports, anomaly alerts, custom
dashboards.

### Built

- **`packages/db`**: one migration (`20261112090000_inventory_finance`,
  produced with `prisma migrate diff` against the previous schema — purely
  additive). New tables `suppliers`, `purchase_orders`,
  `purchase_order_items`, `stock_transfers`, `stock_transfer_items`,
  `stock_takes`, `stock_take_lines`, `cod_settlements`,
  `cod_settlement_lines`, `gateway_settlements`, `scheduled_reports`,
  `anomaly_alerts`, `dashboard_layouts`; `shipments` gained
  `cod_settled_at` / `cod_settled_amount`. New enums exported from
  `@clothing/db`.
- **`packages/shared`**: 9 permissions (`procurement.manage`,
  `inventory.stock_takes.apply`, `finance.manage`, `finance.profit.read`,
  `reports.schedule.manage`, `dashboard.layouts.manage`,
  `settings.{inventory,finance,reports}.write`); 12 settings (dead-stock
  days, markdown tiers, size-curve window, cost method on receiving, COD
  variance tolerance, estimated gateway fee bps, scheduled-report toggle +
  send hour, anomaly toggle/threshold/baseline/minimum orders); the
  dashboard widget catalog + `sanitizeDashboardLayout`; the courier driver
  interface gained optional `getCodSettlement?()` (§10.2), implemented by
  the mock courier.
- **`apps/api`**
  - `InventoryService.applyMovementTx()` — the single transactional write
    path for multi-line stock documents (conditional `updateMany` so
    concurrent operations can't drive on-hand — or *available*, for
    transfers — negative), plus `afterMovementsCommitted()` to fire M10
    back-in-stock alerts after commit.
  - **Procurement** (`procurement/`): suppliers CRUD; purchase/production
    orders (`PO-`/`PRD-YYMMDD-NNNN` numbers) draft → sent →
    partially_received → received / cancelled; receiving books
    `purchase_receive` movements and updates variant cost by
    `procurement.costMethod` (weighted average by default, blended against
    total on-hand across locations).
  - **Stock operations** (`inventory/`): transfers (dispatch =
    `transfer_out` guarded on *available*, receive = `transfer_in`,
    shortfalls recorded, cancelling in transit returns stock); stock takes
    (snapshot `expectedQty` at start, typed counts + barcode/SKU scan
    endpoint, variance summary with value, apply = counted − snapshot so
    sales during the count survive, optional zero-uncounted, separate
    apply permission).
  - **Analysis**: size curve per product or category (sales share vs stock
    share per size, buy split by largest-remainder toward demand); dead
    stock (days since last `sale` movement, else last receipt/creation)
    with tiered markdown suggestions floored at cost + margin-guard
    minimum; accepted markdowns become ordinary M2 price schedules. CSV
    export (audited).
  - **Finance** (`finance/`): COD settlements from CSV/XLSX with staff
    column mapping (inspect → import) or from the courier API where the
    driver supports it; auto-match by consignment id (tracking code
    fallback), flags (unmatched / variance beyond tolerance / duplicate /
    already settled / not delivered), manual match, re-match, confirm
    (posts `codSettledAt`/`codSettledAmount` and the courier's charge as
    `deliveryChargeActual`, guarded against double posting), outstanding
    COD by courier. Gateway settlements with `expectedGross` from our own
    succeeded payments and variance. True profit report (by day / by
    order, CSV): revenue − COGS − courier − gateway fees on orders with a
    final delivery outcome; recorded settlement fees replace estimates.
  - **Reports**: scheduled email reports (catalog of 8 reports, each
    gated by the permission needed to view it; daily / weekly-Saturday /
    monthly-1st in Dhaka time; CAS-claimed runs; HTML email with escaped
    values via the configured email provider; send-now). Anomaly alerts:
    once-a-day sweep comparing yesterday with the trailing baseline for
    orders, revenue, cancellation rate and rejection rate; deduped per
    metric/day; in-app + push + email to `reports.read`; acknowledge /
    check-now.
  - **Dashboard**: layouts per staff → role → store default → built-in,
    filtered by the viewer's permissions; KPIs gained COD outstanding and
    open anomalies.
  - Small read-only lookups (`/admin/lookups/variants|categories|
    stock-locations`) for the new pickers.
- **`apps/admin`**: Suppliers; Purchase orders (list/create/detail with
  receiving); Inventory sub-tabs with Transfers (list/create/detail),
  Stock takes (list/start/count sheet with camera + keyboard scanner,
  variance cards, apply), Analysis (size curve chart-table, dead stock
  with select-and-schedule markdowns); Finance (COD list + outstanding +
  import wizard with header auto-guessing, settlement detail with flags
  and manual match, Gateway settlements, True profit); Scheduled reports;
  Alerts; Dashboard rebuilt around the widget layout with a "Customize"
  editor (own / role / store default). All strings bn + en.
- Docs: decisions in `docs/DECISIONS.md` (2026-11-12 entries), guide
  entries in `docs/ADMIN_GUIDE.md`.

### Verified

- `tsc --noEmit` clean for `packages/shared`, `packages/db`, `apps/api`,
  and `apps/admin` source (the admin's stale `.next/types/validator.ts`
  still references the `app/[locale]/page.tsx` that the pending, separately
  documented login-loop fix deletes — regenerated on the next `next dev`).
  ESLint clean on every touched file.
- Unit tests: `packages/shared` 142 (was 137), `apps/api` 469 (was 363).
  New: weighted-average cost, PO status, stock-take adjustment & variance
  summary, largest-remainder + size curve, markdown tiers & margin floor,
  taka parsing without floats, settlement row mapping, COD matching flags,
  true profit (sold / partial / refunds / rejected / estimates /
  settlements), schedule cadence & periods in Dhaka time, anomaly
  detection, document numbers; service specs for receiving, transfers,
  stock-take apply, the movement helper, COD import/confirm, scheduled-run
  claiming, dashboard layout resolution. In the full `apps/api` run one
  pre-existing test (`health.controller.spec.ts`, untouched) timed out at
  12 s under load; it passes when run on its own.

### Not verified in this environment

- **The migration has not been applied to any database.** Before running:
  `pnpm db:generate`, `pnpm db:migrate:deploy`, `pnpm db:seed` (the seed
  grants the new permissions to Super Admin).
- Nothing was exercised in a browser or against real Postgres: the new
  admin screens, the scanner on the count sheet, real courier settlement
  files (column auto-guessing is heuristic), email delivery of scheduled
  reports, and the Prisma JSON-path title search in `/admin/lookups/
  variants` are untested end to end.

### Known issues / explicitly deferred

- No real courier driver implements `getCodSettlement` — Steadfast,
  Pathao and RedX have no settlement endpoint in our drivers, so they use
  file import; only the mock courier supports API fetch (DECISIONS.md).
- Confirming a COD settlement does not change order payment status; it
  records settlement on the shipment only.
- Dead stock uses the stock-movement ledger: a sale that was later
  cancelled still counts as the "last sale".
- Anomaly rejection rate is bucketed by the shipment's last update time
  (there is no rejected-at timestamp).
- True profit: ad spend is 0 until M13's ad-spend import (closed in M13 —
  see `profitAfterAdSpend`); returned units are assumed restocked (no
  write-off for failed inspection).
- Transfers have no partial dispatch; a transfer is received once (no
  second receipt for late-arriving units).
- Scheduled reports send an HTML table only (no CSV attachment — the email
  driver interface has no attachments).
- Everything M1–M11 already listed as a known gap and untouched here
  remains unchanged.

## Milestone 13 — CRM, marketing automation and AI content

Status: complete (§16 M13) at the code/test level, with the same caveat as
every prior milestone: nothing was run against a real database or in a
browser here — see "Not verified in this environment". Scope per §16:
loyalty program and tiers, RFM segments, automated journeys, broadcasts
with cost estimate, audience sync, ad spend import + ROAS, promo calendar,
unique-code campaigns, AI providers (Anthropic/OpenAI/Gemini) with
per-feature config, budgets and usage report, AI description/SEO/alt
text/translation drafts, product quality checker, SEO score and broken
link checker.

### Built

- **`packages/db`**: migration `20261113090000_crm_marketing_ai` (generated
  with `prisma migrate diff` against the committed schema — purely
  additive). New tables `loyalty_tiers`, `loyalty_transactions`,
  `journeys`, `journey_enrollments`, `broadcasts`, `audience_syncs`,
  `ad_spend`, `ai_feature_configs`, `ai_prompt_versions`, `ai_usage_logs`,
  `ai_drafts`, `link_scans`, `link_scan_results`; `customers` gained
  `tier_id` + RFM columns + `last_order_at`; `carts.redeem_points`;
  `orders.points_redeemed/points_discount`; notification events
  `marketing_broadcast`, `journey_message`.
- **`packages/shared`**: 13 permissions; 25 settings in
  `settings/definitions-m13.ts` (loyalty, crm, marketing, ai, seo); new
  `@clothing/shared/marketing` (loyalty maths, RFM scoring, broadcast cost
  estimate, ROAS attribution, product quality checker, SEO score, link
  extraction + storefront route matching) and `@clothing/shared/ai`
  (feature catalog, default prompts, output contracts, cost/budget maths);
  provider capability `audience`; AI drivers mock / Anthropic (official
  `@anthropic-ai/sdk` 1.8.0, refusal fallback) / OpenAI / Gemini; audience
  drivers mock / Meta Custom Audiences / Google Customer Match.
- **`apps/api`** — new modules:
  - `LoyaltyModule`: tiers CRUD, per-customer summary/ledger/adjust,
    sweeps (earn → pending, release, reversal on cancel, lot expiry,
    photo-review and birthday bonuses), program stats; storefront
    `/store/account/loyalty` and `/store/account/profile` (birthday +
    consent). Redemption is step 9 of the cart pricing pipeline
    (`PUT /store/cart/points`) and is spent inside the order-placement
    transaction. Order edit keeps the points discount; merge/split refuse
    orders that used points.
  - `CrmModule`: nightly RFM scoring, summary, preset segments; segment
    rules gained `rfmSegment/rfmRecency/rfmFrequency/rfmMonetary/tierId/
    pointsBalance/consent`.
  - `MarketingModule`: journeys (4 trigger types, multi-step, starters,
    consent-aware channel choice, personal coupons), broadcasts (live
    estimate, preview, test send, schedule/cancel, batched sending through
    M7's dispatcher, delivery + code-redemption report), audience sync,
    ad-spend import + ROAS, promo calendar. The discount engine now
    enforces codes assigned to a customer.
  - `AiModule`: per-feature config with versioned prompts, budgets (hard
    stop + alert), provider fallback, usage logging and monthly report;
    product drafts for description, SEO meta, alt text (per image) and
    bn↔en translation, applied through the normal product services.
  - `SeoAuditModule`: product quality list, SEO scores for 5 page types,
    background broken-link scans.
  - True profit summary now subtracts imported ad spend
    (`profitAfterAdSpend`). Checkout stores utm medium/campaign/content.
- **`apps/admin`**: Marketing tabs (Broadcasts list + detail, Journeys,
  Loyalty, Ad audiences, Ad spend & ROAS, Promo calendar), AI page
  (features, prompts with history, budgets, usage), Product quality, SEO &
  links, RFM panel on Segments, loyalty card on the customer profile, AI
  assistant panel in the product editor, `ai`/`audience` tabs in
  Integrations. All strings bn + en (validated as ICU messages).
- **`apps/storefront`**: "Use points" at checkout with a points line in the
  totals, `/account/points`, profile form (name, email, birthday, marketing
  consent per channel) on the account page, and first-touch UTM capture
  sent with the order (no UTM reached orders before).
- Docs: decisions (2026-11-13 entries), admin guide entries.

### Verified

- `tsc --noEmit` clean for `packages/shared`, `apps/api` (source and
  tests), `apps/storefront`, and `apps/admin` source (only the stale
  `.next/types/validator.ts` errors from the pending login fix remain).
  ESLint clean on every touched file (one pre-existing warning in the
  customer profile page).
- Unit tests: `packages/shared` 194 (was 142), `apps/api` 503 (was 469)
  — all passing, including the health spec that timed out under load in M12.
- **Booted the real API** with an unreachable database: the full DI graph
  resolves (this caught a missing `ProvidersModule` import, fixed), 59 new
  routes map, `/health` is 200, storefront account routes return 401
  without a session, validation returns 400, and DB-backed routes fail
  with the database error rather than crashing.
- `prisma validate` passes; the migration SQL was reviewed (only CREATE /
  ADD COLUMN / ADD VALUE).

### Not verified in this environment

- **The migration has not been applied to any database.** The configured
  dev database (Neon) is still at M11 — M12's migration isn't applied
  there either; I didn't touch it. Before running: `pnpm db:generate`,
  `pnpm db:migrate:deploy`, `pnpm db:seed` (grants the new permissions to
  Super Admin).
- Nothing was clicked through in a browser: the new admin screens, the
  checkout points box, the profile form.
- No live provider calls: Anthropic, OpenAI, Gemini, Meta and Google Ads
  drivers are written against their docs/SDK but unexercised (no keys).
  Use the mock AI and mock audience drivers to try the flows end to end.
- The raw SQL in sweeps (`$queryRaw` for earn/reversal/bonus/enrolment/
  RFM) has only been typechecked, not executed against Postgres.

### Known issues / explicitly deferred

- Referral points (§6.12) wait for the referral program (M16); store
  credit and gift cards are M16 too.
- Audience sync never removes people who left a segment.
- Marketing messages that fail on one channel are retried, not re-routed
  to the next channel (journeys pick the first reachable channel up front).
- WhatsApp broadcasts go out as plain text — Meta requires approved
  templates for business-initiated messages (same M7 limitation).
- Tiers use lifetime `total_spent`, which counts orders at placement
  (including later cancellations) — the existing M5 metric.
- Product quality / SEO lists load up to 5,000 products in memory per
  request; fine for the target shop size, revisit for very large catalogs.
- No unsubscribe link/keyword handling for SMS; customers change consent
  in their account.
- Seasonal themes aren't on the promo calendar (no scheduled-theme entity).

---

## Milestone 14 — Personalization and experimentation

Status: complete (§16 M14) at the code/test level, with the same caveat as
every prior milestone: nothing was run against a real database or in a
browser here — see "Not verified in this environment". Scope per §16:
personalized recommendations ("for you", frequently bought together from
order data), visual search (image upload → similar products via AI
embeddings/vision), A/B testing framework for blocks/banners/offers.

### Built

- **`packages/db`**: migration `20261114090000_personalization_experiments`
  (generated with `prisma migrate diff` against the committed schema —
  purely additive): `product_affinities`, `product_visual_features`,
  `experiments`, `experiment_exposures`, `experiment_conversions`, and
  `orders.visitor_id`.
- **`packages/shared`**: 4 permissions (`personalization.manage`,
  `experiments.read`, `experiments.manage`,
  `settings.personalization.write`); 13 settings in
  `settings/definitions-m14.ts` (recommendations, visual search, A/B
  tests); new `@clothing/shared/personalization` — co-occurrence scoring,
  "for you" ranking, cart aggregation, deterministic variant assignment,
  z-test/Bonferroni/sample-size maths, variant validation, and the local
  image feature vector + similarity; AI feature `visual_tags` (product
  drafts are restricted to the four draft features).
- **`packages/blocks`**: `for_you` block (client-side, like
  `AudienceGate`), registered in the page builder.
- **`apps/api`** — new modules:
  - `PersonalizationModule`: nightly affinity computation (orders →
    bought together, `view_item` events → viewed together), product /
    cart / "for you" endpoints (hand-picked relations first), visual
    search index sweep (sharp → feature vector, optional AI tags within
    budget), photo search (sniffed, size- and rate-limited, never stored),
    look-alike "similar", admin stats / recompute / preview / reindex /
    test upload.
  - `ExperimentsModule` + `ExperimentsCoreModule`: A/B tests for page
    blocks, announcement bars and offers — CRUD with per-kind validation
    (block props against the block schema), start/pause/resume/complete,
    conflict checks, results with significance, "apply winner" (page
    draft / bar text / disable losing discounts), storefront assignments,
    exposures and click goals; add-to-cart goal from the cart; purchase
    conversions by a per-minute set-based sweep over `orders.visitor_id`.
  - The discount engine gates discounts owned by offer tests to their
    variant (paused tests keep the gate); store pages and announcement bars
    carry running variants; checkout stores the visitor id; `AiService`
    accepts system calls (no staff actor).
- **`apps/admin`**: *Personalization* page (recommendation coverage,
  recompute, per-product preview with scores, visual index status,
  rebuild, test a photo), *A/B tests* list and editor/results page (kind,
  target, variants with weights and per-kind payload editors, goal,
  traffic, lifecycle actions, results table, end test + apply winner),
  `for_you` in the page builder. All strings bn + en (validated as ICU
  messages).
- **`apps/storefront`**: "Frequently bought together" and "Similar
  products" on the PDP (merged with hand-picked relations), "Frequently
  bought together" in the cart, `/search/photo` with a camera shortcut in
  the header (only when enabled), `ExperimentSwitch` for tested blocks and
  bars (anti-flicker, click goals, batched exposures), offer message strip.
- Docs: decisions (2026-11-13 M14 entries), admin guide entries.

### Verified

- `tsc --noEmit` clean for `packages/shared`, `packages/blocks`,
  `apps/api` (source and tests), `apps/storefront`, and `apps/admin`
  source (only the stale `.next/types/validator.ts` errors from the
  pending login fix remain). ESLint clean on every touched file.
- Unit tests: `packages/shared` 217 (was 194), `packages/blocks` 13 (was
  12), `apps/api` 533 (was 503), `apps/storefront` 10 — all passing. The
  API specs include a real-image visual search test (sharp-generated
  photos: the matching garment ranks first) and the discount engine
  applying an offer test's discount only to its variant.
- Writing the tests caught a real bug: the tag tokenizer split Bangla words
  at vowel signs (combining marks), so Bangla tags never matched — fixed.
- **Booted the real API** with an unreachable database: the DI graph
  resolves, all 23 new routes map, validation returns 400, and DB-backed
  routes fail with the database error like existing ones.
- `prisma validate` passes; the migration SQL was reviewed (only CREATE /
  ADD COLUMN / indexes / foreign keys).

### Not verified in this environment

- **The migration has not been applied to any database.** The dev database
  is still at M11 (M12–M14 pending): `pnpm db:generate`,
  `pnpm db:migrate:deploy`, `pnpm db:seed` (grants the new permissions to
  Super Admin).
- Nothing was clicked through in a browser: the new admin pages, the
  storefront sections, photo search, variant switching and flicker.
- The raw SQL (affinity baskets, visual index queue, purchase-conversion
  sweep with `gen_random_uuid()` — Postgres 13+) has only been
  typechecked, not executed.
- Visual search quality on real catalog photos (models, busy backgrounds)
  is untested; the pixel features were checked on synthetic images only.
  AI vision tags were exercised with the mock driver contract only.

### Known issues / explicitly deferred

- Popups can't be A/B tested — the storefront doesn't render popups yet.
- Variant choice happens client-side: a slow network shows the control
  for up to 800 ms, and crawlers/no-JS visitors always see the control.
- A visitor is one `anonymous_id` cookie: another device or a cleared
  cookie is a new visitor (and could see another offer variant).
- Recommendations don't check stock; out-of-stock products can appear.
- Recently viewed is still browser-only (M4), so "for you" on a new device
  starts from purchases only.
- Visual index and "for you" snapshot load all active products into
  memory (cached 5 min) — fine for the target catalog size, revisit for
  very large catalogs (a pgvector column could sit behind the same
  service).
- No sequential/Bayesian testing; the minimum-visitors rule is the only
  guard against stopping early.

---

## Milestone 15 — Support

Status: complete (§16 M15) at the code/test level, with the same caveat as
every prior milestone: nothing was run against a real database, a real Meta
app or telephony account, or in a browser here — see "Not verified in this
environment". Scope per §16: unified inbox (WhatsApp Cloud, Messenger,
Instagram, live chat widget), create order from chat, tickets with SLA,
canned replies, AI reply suggestions, AI chat assistant with tool calls
(product info, size advice, stock, order status) and human handoff,
click-to-call telephony integration (generic provider).

### Built

- **`packages/db`**: migration `20261115090000_support` (generated with
  `prisma migrate diff` — purely additive): `conversations`,
  `conversation_messages`, `tickets`, `ticket_messages`, `canned_replies`,
  `call_logs`, `webhook_events`, and `staff_users.phone`.
- **`packages/shared`**: provider capabilities `chat_channel` (Messenger,
  Instagram, mock) and `telephony` (generic HTTP, mock); WhatsApp drivers
  gained session sends and webhook parsing; Meta signature verification and
  webhook parsers; `AiDriver.chat()` (tool use) for Anthropic (official SDK),
  OpenAI, Gemini and the mock; AI features `reply_suggestion` and
  `chat_assistant`; new `@clothing/shared/support` (channels, statuses, SLA
  maths, 24-hour reply window, "wants a human" detection, transcript
  formatting, the assistant's tool schemas); 5 permissions; 9 settings in
  `settings/definitions-m15.ts`.
- **`apps/api`** — new `SupportModule`:
  - Inbox: idempotent webhook ingestion (raw events stored and retried),
    customer matching by phone, reply/notes/assign/status/assistant toggle,
    side-panel context, AI reply suggestions, order linking, staff alerts
    on new conversations and handoffs, Meta 24-hour window enforced.
  - Webhooks: `GET/POST /webhooks/inbox/:instanceId` (Meta verify token +
    `X-Hub-Signature-256` on the raw body — the API now keeps `rawBody`),
    `POST /webhooks/telephony/:instanceId`.
  - Chat assistant: tool loop over `AiService.chat` (budgets, fallback,
    usage logging), five validated tools, phone-matched order lookups,
    deterministic and model-driven handoff, inline run + recovery sweep.
  - Tickets with first-response/resolution SLA, breach sweep and alerts;
    canned replies with variables; click-to-call with provider or `tel:`
    fallback, call log and outcomes; storefront live chat endpoints with a
    per-visitor rate limit.
- **`apps/admin`**: Support inbox (filters, thread, composer with canned
  replies and AI suggestions, assignment, assistant toggle, side panel with
  customer/orders/tickets, create order/ticket, channel webhook URLs, mock
  test messages), Tickets list + detail, Canned replies, Calls; Call buttons
  on orders, tickets and chats; manual order form pre-fills from a chat and
  links back; `chat_channel`/`telephony` in Integrations. All strings bn + en
  (validated as ICU messages).
- **`apps/storefront`**: live chat widget in the floating chat stack (polls
  while open, "talk to a person").
- Docs: decisions (2026-11-13 M15 entries), admin guide entries.

### Verified

- `tsc --noEmit` clean for `packages/shared`, `apps/api` (source and
  tests), `apps/storefront`, and `apps/admin` source (only the stale
  `.next/types/validator.ts` errors from the pending login fix remain).
  ESLint clean on every touched file (three pre-existing warnings in the
  order pages).
- Unit tests: `packages/shared` 232 (was 217), `apps/api` 559 (was 533),
  `packages/blocks` 13, `apps/storefront` 10 — all passing. Covered: Meta
  signature checks and webhook parsing, transcript translation to all three
  vendors' formats, the assistant loop (tools, handoff, AI failure, staff
  takeover, last-round tool restriction), phone-matched order lookups,
  SLA deadlines/breaches, telephony fallback and webhooks, the 24-hour
  window, live-chat rate limiting.
- **Booted the real API** (compiled build) with an unreachable database:
  the DI graph resolves, all 36 support routes map, the raw-body webhook
  path parses requests, validation returns 400, and DB-backed routes fail
  with the database error like existing ones. `nest start` (dev watch
  compile) ran out of the default 1.4 GB Node heap on this machine once;
  `tsc` itself needs ~565 MB and `nest build` + `node dist/main.js`
  worked — if dev mode hits it, set `NODE_OPTIONS=--max-old-space-size=4096`.

### Not verified in this environment

- **The migration has not been applied to any database** (the dev database
  is still at M11; M12–M15 pending): `pnpm db:generate`,
  `pnpm db:migrate:deploy`, `pnpm db:seed` (grants the new permissions to
  Super Admin).
- No live Meta app, WhatsApp number, Messenger/Instagram page or telephony
  account: the drivers follow the documented APIs but are unexercised. Use
  the mock providers and the inbox's test message to try the flows.
- No live AI tool-use call: the Anthropic tool-use code is typechecked
  against the SDK and the transcript mapping is unit-tested, but no request
  reached a real model.
- Nothing was clicked through in a browser (inbox, tickets, calls, live
  chat widget).

### Known issues / explicitly deferred

- No WhatsApp template messages: replies are only possible inside Meta's
  24-hour window (same M7 limitation).
- WhatsApp media is recorded by type/caption only (not downloaded).
- SLA uses calendar minutes, not business hours/holidays.
- Polling, not websockets (free tier): new messages appear within ~5 s in
  the admin and ~4 s in the widget.
- One conversation per channel + contact: two WhatsApp numbers on one store
  would share a customer's thread.
- No named BD telephony driver; the generic HTTP driver must be configured
  per provider.
- The assistant doesn't see images customers send.

---

## Milestone 16 — Loyalty extensions

Status: complete (§16 M16) at the code/test level, with the same caveat as
every prior milestone: the migration wasn't applied to a database and nothing
was clicked through in a browser here — see "Not verified in this
environment". Scope per §16: referral program, gift cards (buy, send,
redeem), store credit wallet UI, affiliate/influencer tracking and
commissions.

### Built

- **`packages/db`**: migration `20261116090000_loyalty_extensions`
  (generated with `prisma migrate diff` against the committed schema —
  purely additive): `store_credit_transactions`, `gift_cards`,
  `gift_card_transactions`, `referrals`, `affiliates`,
  `affiliate_click_days`, `affiliate_conversions`, `affiliate_payouts`;
  `carts.gift_card_id/use_store_credit/referral_code/affiliate_code/
  affiliate_clicked_at`; `orders.gift_card_used/gift_card_id/
  store_credit_used/referral_discount`; payment method `gift_card`;
  notification events `gift_card_received`, `gift_card_purchased`,
  `referral_reward` (seeded bn/en templates).
- **`packages/shared`**: new `@clothing/shared/rewards` (gift card code
  generation/normalisation, amount rules, usability, tender allocation,
  referee discount, referral eligibility, affiliate commission base and
  maths, attribution window); 6 permissions; 23 settings in
  `settings/definitions-m16.ts` (group `rewards`, every feature off by
  default).
- **`apps/api`**:
  - `RewardsCoreModule` (Prisma-only): store credit and gift card ledgers
    with guarded debits and idempotent credits, HMAC'd gift card codes, and
    `OrderTendersService` (spend at placement, restore on cancel/expiry).
  - Cart pricing: referral discount step after coupons; gift card then
    store credit as tenders against the whole order (`amountDue`). New cart
    endpoints `PUT gift-card`, `PUT store-credit`, `PUT referral`,
    `POST affiliate`; a referral code typed as a coupon becomes a referral.
  - Checkout: tenders recorded as succeeded payments in the order
    transaction, referral row and affiliate conversion written atomically;
    advance/online/COD amounts use what's left. Cancellation and expiry
    restore tenders and refund only cash; refunds with method store credit
    and returns resolved as store credit credit the wallet ledger; order
    edit keeps the referral discount.
  - `StoreCreditModule` (admin wallet + adjust + stats, storefront wallet),
    `GiftCardsModule` (admin issue/disable/adjust/new code, storefront
    purchase via standalone payments with callback handler + reconciliation
    sweep, balance check, add to wallet, expiry sweep, per-visitor lookup
    limit), `ReferralsModule` (quote, placement, reward/void sweep with
    monthly cap, admin list/stats/void, storefront account page + public
    code check), `AffiliatesModule` (CRUD, click counting, attribution,
    approval sweep, payouts, partner portal with rotatable token).
  - `PaymentsService.initiateStandalone/verifyStandalone` and standalone
    callback handlers.
- **`apps/admin`**: Marketing tabs *Gift cards* (stats, issue, list, card
  detail with ledger and actions), *Store credit* (liability + recent
  movements), *Referrals* (rules, stats, top referrers, list, void),
  *Affiliates* (list, create, detail with links, balances, payouts,
  attributed orders, reject, edit); store credit card on the customer
  profile; points/referral/tender lines on the order detail; nav entries.
  All strings bn + en (validated as ICU messages).
- **`apps/storefront`**: checkout block for referral, gift card code and
  store credit with the new totals ("To pay"); `?ref=`/`?aff=` capture;
  `/account/credit` (wallet, ledger, check balance, add gift card to
  wallet), `/account/referrals` (code, link, WhatsApp share, referrals),
  `/gift-cards` (buy) and `/gift-cards/result`, `/affiliate/[token]`
  partner page (noindex, no-referrer).
- Docs: decisions (2026-11-13 M16 entries), admin guide entries.

### Verified

- `tsc --noEmit` clean for `packages/shared`, `packages/db`, `apps/api`
  (source and tests), `apps/storefront`, and `apps/admin` source (only the
  stale `.next/types/validator.ts` errors from the pending login fix
  remain). ESLint clean on every touched file (pre-existing warnings in
  the customer and order pages only).
- Unit tests: `packages/shared` 258 (was 232), `apps/api` 598 (was 559),
  `packages/blocks` 13, `apps/storefront` 10 — all passing. Covered: code
  generation and hashing, tender allocation, ledger idempotency and
  overdraw guards, tender spend/restore, cancellation refunding only cash,
  gift card purchase → payment → issue (duplicate and late callbacks),
  issuing without leaking the code to the audit log, expiry, referral
  eligibility and reward/void/cap sweep, affiliate coupon-vs-link
  attribution, window, self-purchase, approval recompute, payouts.
- The **real API** (the running `nest start --watch` build) booted with the
  new code: the DI graph resolves, `/health` is 200 and Swagger lists all
  33 new routes.
- `prisma validate` passes; the migration SQL was reviewed (only CREATE /
  ADD COLUMN / ADD VALUE / indexes / foreign keys).

### Not verified in this environment

- **The migration has not been applied to any database** (M12–M16 pending
  on the dev database): `pnpm db:generate`, `pnpm db:migrate:deploy`,
  `pnpm db:seed` (grants the new permissions to Super Admin and seeds the
  three new message templates). Until it's applied, a server running this
  code fails on cart/order queries (new columns).
- Nothing was clicked through in a browser: checkout credits, wallet,
  referral and gift card pages, partner page, the admin screens.
- No real gateway payment for a gift card purchase: the standalone flow
  was tested against mocks only; with the mock payment provider the whole
  buy → pay → code-sent flow can be tried locally.
- The raw ledger maths ran only against mocked Prisma, not Postgres.

### Known issues / explicitly deferred

- Gift card purchases have no `payments` row, so they don't show in M12
  gateway settlement matching or the profit report's gateway fees.
- Doorstep rejection and return refunds on orders partly paid by gift
  card/store credit still create a refund record for the computed amount;
  staff choose the method (e.g. store credit) — they aren't split by
  tender automatically.
- The gift card lookup limit is per API instance (in-memory), fine for the
  single-instance free tier.
- A guest's gift card applied before logging in carries over on cart merge;
  store credit needs an account.
- No cashback rules yet (the `cashback` ledger reason exists for manual
  use); store credit never expires.
- Referral fraud checks are phone/account based only (no device/IP
  matching); staff can void suspicious referrals.
- Affiliate clicks are counted per day, not per unique visitor.

---

### Next up

Phase 3 (§16) continues: **M17 — Advanced analytics and procurement**
(demand forecasting and reorder suggestions, materials & BOM, cohort/LTV
reports, report builder, expenses and P&L, public API keys and outbound
webhooks, config bundle export/import polish).
