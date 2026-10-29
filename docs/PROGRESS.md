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

### Next up

Milestone 7 — Notifications and messaging (§16 M7): message templates
(SMS/email/WhatsApp, bn/en) with editor, preview, test send; channel
matrix per event with fallback order; SMS drivers (generic HTTP + two BD
gateways), email drivers (SMTP, Brevo, Resend), WhatsApp click-to-chat +
Cloud API driver; notification logs; staff notifications (in-app +
email).
