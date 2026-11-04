# Decisions log

Append-only. Each entry: date, context, decision, alternatives considered.
Required by `docs/PROJECT_SPEC.md` §0.2/§18 for: ID format, PDF rendering
approach, BD location dataset source, the two named SMS gateways, font pair,
and any deviation from the spec. Also used for ambiguous calls made during
implementation (§0.1).

---

## 2026-10-22 — Repository, package manager, monorepo tool

**Context:** §0.4 and §3 specify pnpm + Turborepo, TypeScript strict, latest
stable majors pinned.

**Decision:** pnpm workspaces (`pnpm-workspace.yaml`) + Turborepo
(`turbo.json`) exactly as specified. Node engine `>=22` (current LTS at
implementation time). Versions pinned in each `package.json`.

**Alternatives considered:** npm/yarn workspaces — rejected, spec is explicit
about pnpm + Turborepo.

---

## 2026-10-22 — ESLint flat config, Prettier, TS project layout

**Context:** §0.4 asks for ESLint + Prettier with shared config in
`packages/config`.

**Decision:** ESLint 9 flat config (`eslint.config.js` per package, composed
from `packages/config/eslint/{base,next,nest}.js`) rather than legacy
`.eslintrc`, since flat config is the current default for new ESLint
projects. Exception: `apps/storefront` and `apps/admin` use `.eslintrc.json`
extending `next/core-web-vitals`, because `next lint` (Next.js 15) resolves
most reliably through Next's own legacy-config integration. Prettier config
is a single shared object re-exported via `.prettierrc.js`.

**Alternatives considered:** Flat config everywhere, including the Next
apps — more "consistent" on paper but riskier against `next lint`'s current
flat-config support; revisit once `eslint-config-next`'s flat-config path is
solid.

---

## 2026-10-22 — NestJS unit tests run under Vitest + SWC, not Jest

**Context:** §3.3 specifies Vitest for unit tests project-wide. NestJS's
constructor-based dependency injection relies on `emitDecoratorMetadata`,
which esbuild (Vite's default transform) does not emit.

**Decision:** `apps/api` runs Vitest with the `unplugin-swc` plugin and an
`.swcrc` that enables `decoratorMetadata`, so DI-reliant unit tests
(e.g. health controller tests using Nest's `Test.createTestingModule`) work
without Jest. Production build/dev still uses the Nest CLI's own `tsc`-based
compiler, which has always supported `emitDecoratorMetadata`.

**Alternatives considered:** Jest for `apps/api` only (NestJS's own default
starter) — rejected to keep one test runner across the whole monorepo per
§3.3/§14.

---

## 2026-10-22 — Milestone 0 scope boundary

**Context:** §16 M0 acceptance criteria: monorepo, shared configs,
`CLAUDE.md`, docs folder, `docker-compose.dev`, CI pipeline, `.env.example`,
base Next.js apps and Nest app with health endpoints, OpenAPI generation
pointed at `packages/sdk`.

**Decision:** `packages/db`'s Prisma schema is intentionally left with zero
models in M0 (datasource + generator only) — the full domain model is §5's
job, scheduled for M1. `apps/api` exposes only `/health` and `/ready`; no
business modules yet. `apps/storefront` and `apps/admin` render a single
placeholder page each with Tailwind wired through the shared preset; no
i18n, theme tokens, or real routes yet (those are M1/M3). `@clothing/sdk`'s
`generate` script is a no-op until the API has real OpenAPI resources.
E2E (`e2e/`) is scaffolded (Playwright config, mobile-360 + desktop-1280
projects) but contains only a skipped placeholder test — no storefront/admin
behavior exists yet to test. These boundaries are deliberate, not omissions:
see `docs/PROGRESS.md` for exactly what is built vs. pending.

**Alternatives considered:** Build the Prisma schema and seed data now (it is
in §5 regardless of milestone) — rejected; M1 is where settings/RBAC/audit
foundations go in first, and the schema should be designed together with
them rather than bolted on in two passes.

---

## 2026-10-22 — Dependency versions verified against the npm registry; TypeScript pinned to 6.x, not 7.0

**Context:** §0.4 requires the latest stable major of every library, pinned.
Initial drafts of every `package.json` used versions from training-data
memory, which is 9+ months stale by 2026-10-22. Checked every exact version
in this commit against the live npm registry (`npm view <pkg> version`)
rather than guessing, and adjusted the stack accordingly:

- **Next.js 16.4.2**, **React 19.3.1**, **eslint-config-next 16.4.2** — the
  spec's "Next.js App Router" stack, latest major at implementation time
  (Next 16 shipped October 2025; React 19.x line).
- **Tailwind CSS 4.3.3** — v4 is the current default for new projects
  (CSS-first config via `@theme`/`@import`, Oxide engine, no separate
  Autoprefixer needed). This is a better fit for our requirement than v3:
  `@theme` tokens compile to real `:root` CSS variables, which is exactly
  the mechanism §4.4.2 needs for runtime theme overrides from admin
  settings. `packages/config/tailwind/preset.css` replaces the v3-style
  `preset.js`; apps use `@source` directives to pull in sibling workspace
  packages (`packages/ui`, `packages/blocks`) since v4's automatic content
  detection only scans within each app's own directory tree.
- **ESLint 10.13.0** — ESLint 9 reached end-of-life 2026-08-06 and v10
  removes the legacy `.eslintrc*` config system entirely (not just
  deprecates it), forcing flat `eslint.config.mjs` for the Next.js apps
  instead of the `.eslintrc.json` originally planned. The first attempt —
  wrapping `next/core-web-vitals` with `@eslint/eslintrc`'s `FlatCompat`,
  the pattern Next's own docs recommend — crashes (`TypeError: Converting
  circular structure to JSON`) because `FlatCompat`'s legacy validator
  tries to `JSON.stringify` eslint-plugin-react's (intentionally
  self-referencing) flat config object. Fixed by not going through
  `FlatCompat`/`next/core-web-vitals` at all: `apps/{storefront,admin}/
  eslint.config.mjs` compose `@clothing/config/eslint/next` (our own
  react + react-hooks + base config) with `@next/eslint-plugin-next`'s own
  flat `configs["core-web-vitals"]` export directly. `eslint-config-next`
  itself is not a dependency of either app.
- **NestJS 12.2.0** (`@nestjs/common/core/platform-express/testing`),
  **@nestjs/swagger 12.0.2**, **@nestjs/terminus 12.1.0** — NestJS 12's
  headline change is that core packages ship as native ESM; our app stays
  on a CommonJS build (`apps/api` tsconfig has `"module": "CommonJS"`) and
  relies on Node's `require(esm)` interop, stable since Node 22.12/24.x (we
  run Node 24.11 LTS). Chosen over staying on NestJS 11 because npm's
  `latest` dist-tag across the entire first-party Nest ecosystem
  (cli, swagger, terminus, testing) already points to 12.x — i.e. the Nest
  team itself is presenting 12.x as current stable, not experimental.
  **Risk to watch:** if `require(esm)` interop ever breaks for a
  first-party Nest package (e.g. one adds top-level `await`), the fix is to
  pin the whole `@nestjs/*` family back to the 11.x line — tracked here so
  a future session doesn't have to rediscover this.
- **Prisma pinned to 6.19.3, not the `latest` major (7.x, or the `prisma`
  CLI's `latest` dist-tag which is actually `8.0.0-rc.24`, an RC that
  **lacks `generate`, `migrate dev`, and `db push`** per Prisma's own
  release-status notes and so cannot run this project at all).** Prisma
  ORM 7 is a real stable release, but it is a bigger break than it looks:
  driver adapters become mandatory for every database (`@prisma/adapter-pg`
  instead of a bare `DATABASE_URL`), `url`/`directUrl` move out of the
  `schema.prisma` datasource block into a new `prisma.config.ts`, the
  generator provider changes (`prisma-client` instead of
  `prisma-client-js`, with an explicit `output` path), `.env` is no longer
  auto-loaded, and seeding/migrate commands lost auto-generate/auto-seed
  behavior. None of that is worth getting right against an AI-summarized
  reading of the migration guide while `packages/db/prisma/schema.prisma`
  still has zero models — it's exactly the kind of foundational,
  easy-to-get-subtly-wrong setup that deserves to be done carefully once,
  together with the real schema, in Milestone 1. 6.19.3 is the newest 6.x
  release, still receiving updates (security support through 2026-11-19
  per Prisma's own lifecycle policy), and keeps the familiar
  datasource-url config this schema already uses. **Revisit the v7 (or by
  then maybe v8-stable) migration explicitly at the start of Milestone 1,
  before the real domain model is migrated** — don't just leave it on 6.x
  by default.
- **TypeScript pinned to 6.0.3, not the `latest` 7.0.2.** TypeScript 7.0
  (shipped July 2026) is the first stable release of the native Go-ported
  compiler. Microsoft's own release notes state the new **programmatic
  compiler API doesn't exist yet in 7.0 — it arrives in 7.1** — and that API
  is exactly what `typescript-eslint`, bundler TS plugins, and most of our
  toolchain depend on. Using it now would mean guessing at ecosystem
  compatibility with no API to compile against. 6.0.3 is the last release
  before the rewrite and keeps every tool in this stack working. Revisit
  when 7.1 ships and `typescript-eslint` confirms support.
- **Vitest 5.0.5, Zod 4.6.7, Turborepo 2.11.10, Playwright 1.64.1** and the
  rest of the lockfile — all taken from the registry's `latest` tag with no
  reason found to deviate.

**Alternatives considered:** Keep guessed versions from training data and
let `pnpm install` fail/surface drift — rejected; verifying up front is
cheap (the sandbox has outbound registry access) and avoids churn.

---

## 2026-10-22 — ESLint 10 ecosystem lag: `react-eslint` preset needs an explicit React version, not `"detect"`

**Context:** §0.4 asks for ESLint + Prettier. While verifying the lint
pipeline actually runs (not just installs), `packages/config/eslint/next.js`
(used for storefront, admin, and any package with React/JSX — `ui`,
`blocks`, `email-templates`) crashed with
`TypeError: contextOrFilename.getFilename is not a function` from inside
`eslint-plugin-react@7.37.5`'s React-version auto-detection. ESLint 10
removed the legacy `context.getFilename()` rule-context method (replaced by
the `context.filename` property); `eslint-plugin-react`'s `"detect"` mode
still calls the old one as of 7.37.5. This is exactly the kind of
ecosystem-lag risk flagged in the dependency-versions entry above.

**Decision:** Set `settings.react.version` to the exact pinned React
version (`"19.3.1"`) instead of `"detect"` in `eslint/next.js`, which
bypasses the crashing detection code entirely. Functionally identical
output since we pin React's version anyway.

**Alternatives considered:** Downgrade `eslint-plugin-react` — rejected,
the explicit-version workaround is simpler and the pinned version is a
known value regardless. Drop the React-aware preset for `ui`/`blocks`/
`email-templates` since they currently hold no JSX — rejected, those
packages exist specifically to hold React components (§3.2) and will need
it imminently (Milestone 3+); fixing it now is cheaper than deferring.
**Revisit when bumping `eslint-plugin-react`** — once a release restores
working `"detect"` support under ESLint 10, either is fine.

---

## 2026-10-22 — Milestone 1: Prisma v7 re-evaluated and deferred again

**Context:** the M0 decision explicitly said to revisit Prisma 6→7 "at the
start of Milestone 1, before the real domain model is migrated." Did so
before writing `schema.prisma`.

**Decision:** stayed on Prisma 6.19.3. Prisma 7 (confirmed still current
stable, `7.10.1`) requires the whole project to move to ESM (`"type":
"module"`, `module`/`moduleResolution` ESNext/bundler, `target: ES2023`) —
driver adapters alone wouldn't be the issue, but `apps/api` currently runs as
a CommonJS build with NestJS 12's ESM-core-packages consumed via Node's
`require(esm)` interop (M0 decision). Moving to full ESM is a bigger,
independent change than "swap the Postgres driver," and doing it at the same
time as the entire domain model would make any breakage hard to isolate.
6.19.3 still has security support through 2026-11-19. **Revisit again when
`apps/api` has a concrete reason to move to ESM** (or when Prisma ships a
CJS-compatible v7/v8 path), not on a fixed schedule.

**Alternatives considered:** Move `apps/api` to ESM now, as part of M1 —
rejected, too much unrelated risk stacked onto the milestone that's also
adding ~15 new Prisma models and the entire RBAC/auth system.

---

## 2026-10-22 — Running `@clothing/shared` as raw TypeScript at runtime needs literal `.ts` import extensions

**Context:** `@clothing/shared` (`"type": "module"`) grew real internal
relative imports once settings/permissions/providers/crypto were built.
`apps/api`'s NestJS 12 dev server runs it unbuilt via Node 24's native
TypeScript support (no separate transpile step for workspace deps, per the
M0 decision to consume `@clothing/db`/`@clothing/shared` as raw `.ts` via
their `main`/`types` fields).

**Problem found:** writing those relative imports the normal NodeNext way
(`from "./registry.js"`, matching the eventual compiled output) satisfies
`tsc`, but **crashes at runtime** — `ERR_MODULE_NOT_FOUND`. Node's ESM
loader resolves import specifiers literally; a specifier ending in `.js`
only ever resolves to an actual `.js` file, and Node's type-stripping
doesn't remap extensions — it only extends *extensionless* resolution and,
specifically, resolution of a literal `.ts` specifier. Verified by hand:
`import "./a"` → `ERR_MODULE_NOT_FOUND`; `import "./a.js"` →
`ERR_MODULE_NOT_FOUND`; `import "./a.ts"` → works.

**Decision:** `@clothing/shared`'s own relative imports are written with a
literal `.ts` extension (`from "./registry.ts"`). To typecheck this (TS
normally forbids `.ts`-extension import specifiers) and to keep a real
`tsc` emit correct (e.g. `nest build`, which *does* compile `apps/api`'s own
sources to `.js`), `packages/config/tsconfig/base.json` — not just
`@clothing/shared`'s own tsconfig — now sets
`allowImportingTsExtensions: true` and `rewriteRelativeImportExtensions:
true`. It has to be on the shared base, not just the owning package's
tsconfig, because `apps/api`'s own `tsc --noEmit` program pulls
`@clothing/shared`'s files in too (there's no project-reference boundary
between raw-TS workspace packages) and applies its own compiler options to
everything it resolves.

**Alternatives considered:** Drop `"type": "module"` from
`@clothing/shared` (CommonJS packages don't have this problem, extensionless
`require()` works) — rejected; the package already has top-level
`import`/`export` syntax throughout and converting it to CJS-style exports
would be a larger, purely-mechanical change for no real benefit. Give
`@clothing/shared` a real build step (`tsc` → `dist/`, consumed via a
built `main`) — rejected for M1; worth reconsidering once the package is
large enough that raw-TS dev-time compilation cost matters, but adds a
"remember to rebuild" step that isn't worth it yet.

---

## 2026-10-22 — Express 5 / path-to-regexp v8 wildcard syntax

**Context:** NestJS 12 / `@nestjs/platform-express` 12 bundle Express 5
(confirmed: `express@5.3.0`, `path-to-regexp@8.4.2`), which changed wildcard
route syntax. The old bare `*` (e.g. `app.setGlobalPrefix("api/v1",
{ exclude: ["media/(.*)"] })`, `@Get("*path")` via a plain `*`) either
throws at startup or silently fails to match.

**Decision:** use the new named-wildcard syntax everywhere a catch-all path
is needed: `media/*path` for `MediaFilesController`'s local-file-serving
route, and `"media/*splat"` in `main.ts`'s `setGlobalPrefix` exclude list.
Verified directly against the installed Express 5 (`req.params.path` comes
back as a string array of segments, joined with `/` to reconstruct the
storage key) before relying on it in `MediaFilesController`.

---

## 2026-10-22 — Storage is configured from environment variables, not `provider_instances`

**Context:** §4.3's provider table lists Storage (`local`/`s3`) alongside
payment/courier/SMS/etc., all of which are configured as encrypted
`provider_instances` rows editable from the Integrations screen. But §4.1's
own rule list names "storage bucket credentials" as one of the few things
environment variables *are* for, and M0 had already scaffolded
`STORAGE_DRIVER`/`S3_*` env vars on exactly that basis.

**Decision:** kept Storage entirely environment-driven
(`apps/api/src/storage/storage.module.ts` picks `local` vs `s3` from
`STORAGE_DRIVER` and builds the driver from env at boot) — no
`provider_instances` row, no Integrations-UI entry, no "test connection"
button for it. It's still a provider behind the shared `StorageDriver`
interface (golden rule 2); only its *configuration source* differs from the
merchant-configurable providers, because its credentials must be infra
secrets (needed before any DB-backed config could be read, and not
something a merchant edits through a UI). Email and SMS got their `mock`
driver wired through the real `provider_instances` + Integrations-UI +
test-connection path instead, to prove that pattern end-to-end without
conflating it with Storage's different, legitimate exception.

---

## 2026-10-22 — RBAC: no hardcoded superuser bypass; provider wrapper retries deferred

**Decision:** the "Super Admin" role created by `pnpm db:seed` is a normal
system role (`is_system: true`) granted every permission in
`packages/shared/src/permissions/index.ts` — `PermissionsGuard` has exactly
one code path (check `staff.permissions.has(...)`), never a special-cased
role ID. New permissions are automatically *not* granted to anyone until a
role is updated to include them, which is the safer default.

Also decided: the provider-call wrapper (`ProviderRegistryService`) only
adds timing + `provider_logs` in Milestone 1 — retries-with-backoff and
circuit-breaking (§4.3 rule 3) are deferred to the milestone that adds the
first driver making real, repeated network calls under load (payment/
courier, M5–M6). Building that generically now, against only `local`/`s3`
storage and `mock`/`smtp` email, would be guessing at requirements no real
driver has exercised yet.

---

## 2026-10-22 — Staff 2FA: mandatory through the setup wizard for Super Admin, self-service for everyone else

**Context:** the M1 acceptance line says "Super Admin logs in with 2FA" but
§5.1/§16 don't otherwise say 2FA is mandatory for every staff account.

**Decision:** `POST /setup/super-admin` immediately generates and stores a
TOTP secret and returns its QR code; the account cannot log in with a
session until `POST /setup/super-admin/confirm-totp` verifies a real code
from an authenticator app (`totp_enabled` only flips to `true` then) — so
the very first account is always 2FA-protected by construction, not by
convention. Other staff accounts created later via `POST /admin/staff` start
with `totp_enabled: false` and can enable it for themselves via
`POST /auth/totp/setup` + `/auth/totp/confirm` (same two-step
generate-then-confirm flow), but nothing forces it. A `security.*` setting
to make 2FA mandatory for specific roles is a reasonable future addition,
not built speculatively now.

The "password verified, TOTP pending" handoff between `POST /auth/login`
and `POST /auth/login/totp` is an in-memory ticket store
(`PendingLoginStore`, 5-minute TTL), not a DB table — same free-tier,
single-instance reasoning as the in-memory `CacheService` (§15.2). A
horizontally-scaled deployment would need to move this to Redis; tracked
here so a future session doesn't have to rediscover it.

---

## 2026-10-22 — `PrismaService` does not eagerly `$connect()`

**Context:** the first working version of `PrismaService` called
`await this.$connect()` in `onModuleInit`, which seemed like normal
lifecycle hygiene. It actually crashed the entire API at boot whenever
Postgres was unreachable (`PrismaClientInitializationError`, uncaught) —
breaking the exact graceful-degradation property M0's `/ready` endpoint was
built and verified to have.

**Decision:** removed the eager `$connect()`. Prisma Client connects lazily
on its first real query by default, which is sufficient and keeps the API
serving `/health` (and everything that doesn't touch the DB) even when
Postgres is down — verified by actually running the dev server with no
database available and confirming `/health` is 200, `/ready` is a clean
503, and every other route either works or fails with the real
"can't reach database" error rather than crashing the process.

---

## 2026-10-22 — BD locations dataset: source, license, and verification approach

**Context:** §5.2 requires seeding all 8 divisions, 64 districts, their
upazilas/thanas, and Dhaka city areas, "from a reliable open dataset
(record the source and license)."

**Decision:** compiled via a dedicated research pass (not hand-typed from
memory) cross-checked live against Wikipedia's "Divisions of Bangladesh",
"Districts of Bangladesh", "Dhaka Metropolitan Police" (thana list), and
"Upazilas of Bangladesh" pages, plus general knowledge of Bangladesh's
administrative geography including 2023–2025 upazila splits (Karnaphuli,
Osmani Nagar, Rangabali, Bijoynagar, Lalmai). Wikipedia text is **CC BY-SA
4.0**; admin names/hierarchy are also public BBS/bangladesh.gov.bd data. The
source/license/retrieval-date are recorded in the seed file itself
(`packages/db/src/seed-data/bd-locations.json`'s `source`/`license`/
`retrievedDate` fields), not only here. Result: all 8 divisions and all 64
districts verified against a live source; 541 areas total (51 Dhaka
`city_area` thanas + 490 upazilas/thanas across all districts, including
Dhaka district's own 5 non-city upazilas). Upazila names for the 63
non-Dhaka districts were not individually re-verified one-by-one against a
live source — a handful of obscure or very recently split upazilas may be
missing or have minor spelling variants; `packages/db/src/seed-data/
bd-locations.test.ts` checks structural integrity (every area references a
real district, every district a real division, no duplicate keys, Dhaka
city areas correctly flagged) but can't check completeness against the
real world. Admin can add/rename/disable areas after seeding either way
(§5.2's own escape hatch).

---

## 2026-10-22 — Settings UI: generic JSON editor for `json`/structured fields in Milestone 1

**Context:** §4.1 says the admin Settings screen is "generated from the
registry" so adding a setting never needs custom UI.

**Decision:** the Milestone 1 settings UI (`apps/admin/.../settings/page.tsx`)
renders a real field-specific control for `text`/`textarea`/`toggle`/
`select`/`color`/`localizedText`, but falls back to a raw JSON textarea for
the `json` widget (e.g. `brand.socialLinks`, `locale.enabled`) rather than a
bespoke key-value or tag-list editor, and `image` settings (`brand.logoLight`
etc.) take a media ID as plain text rather than opening a media picker modal.
Both are still fully functional and still require zero code changes to add
a new setting of either widget type — only the *ergonomics* of editing them
are reduced for now. A media-picker modal and structured JSON sub-editors are
natural additions once the media library UI (built this milestone) and more
`json`-widget settings (theme layout variants, M3) exist to justify the
extra UI work.

---

## 2026-10-22 — Deferred from the full §5.1 table and other M1 scope boundaries

Recorded here, not just as code comments, so they stay visible:

- `approval_requests`, `notifications_admin`, `saved_views`, `api_keys`,
  `outbound_webhooks` (+ deliveries), `webhook_events`,
  `courier_area_mappings` — not in `schema.prisma` yet; added with the
  milestone that needs them (M5–M7).
- Password hashing uses `@node-rs/argon2` (napi-rs, prebuilt binaries for
  every platform) rather than the `argon2` package (native, compiles from
  source — risk given this sandbox has no C/C++ toolchain) or `bcryptjs`
  (pure JS but weaker/slower) — chosen for the same "don't repeat the M0
  native-build pain" reason as `@swc/core`.
- TOTP uses `otplib` **13.x**'s new functional API
  (`generateSecret`/`generate`/`verify`/`generateURI`, all async, default
  audited `@noble`/`@scure` plugins) — v13 is a complete rewrite from the
  v12 `authenticator` singleton most examples online still show; the old
  API no longer exists in this package.
- `MediaService` has no endpoint yet to set `staff_users.avatar_media_id`
  from an uploaded file (the DB relation exists; the "set as my avatar"
  action in the admin UI doesn't) — trivial addition, deferred since it's
  not needed for M1's acceptance scenario.
- Config export/import (§4.4 item 5) is not built — nothing yet exists that
  would be worth exporting beyond settings/UI-strings (no CMS/menus/
  templates/categories until later milestones), so it's deferred until
  there's a real bundle to export.

## Still owed (tracked here so they are not forgotten)

- The two named BD SMS gateway drivers — due when §10.3 is implemented (M7).
- PDF rendering approach for invoices/labels on the free tier
  (Playwright/Chromium vs. `@react-pdf/renderer`) — due when §6.8/§8.2
  fulfillment (invoices, labels) is implemented (M6).
- Font pair for Bangla + Latin (default suggestion: Hind Siliguri + Inter) —
  due when the theme system is implemented (M3).
- Prisma 6→7 (or whatever is current then) — revisit when `apps/api` has a
  concrete reason to move to ESM.

---

## 2026-10-22 — Cloudinary as an optional media provider (change request, pre-M2)

**Context:** R2 (via the S3-compatible driver) stays the default storage —
no egress fees, cheapest at scale. Cloudinary is valuable for its on-the-fly
transforms and video handling, but its free tier shares one monthly credit
pool across storage+bandwidth+transformations and the next tier is
expensive — it must never become a hard dependency. Requirement: add it as
a true alternative behind the existing provider framework, switchable from
the admin panel with zero code change, with old assets unaffected.

**Decision — `media.defaultProvider` sentinel, not a provider_instances row
for the default:** Milestone 1 deliberately kept storage (local/s3)
configured from env, not `provider_instances`, because spec §4.1 names
bucket credentials as infra-only. Rather than reverse that call, the new
setting `media.defaultProvider` takes the literal value `"env"` (its
default — meaning "use the env-configured S3/R2/local driver") or a real
`provider_instances.id` for an alternative like Cloudinary. This keeps the
M1 boundary intact while giving Cloudinary a normal, admin-manageable
provider instance. Switching this setting affects *new* uploads only.

**Decision — per-asset provider linkage, resolved from the row, never from
the current setting:** `media.providerInstanceId`/`externalId`/
`resourceType`/`version` were added to the `Media` table (non-destructive
migration). Every read/delete/download resolves "which driver backs this
asset" from these stored fields (`MediaProvidersService.resolveDriverForAsset`),
never from `media.defaultProvider` — so flipping the default never strands
already-uploaded files on the provider they were actually uploaded to.

**Decision — one isomorphic URL builder, in its own package subpath:**
`@clothing/shared/media` (`src/media/url.ts`) exports `getMediaUrl()` and
`MediaRef` with zero Node imports — deliberately separate from
`@clothing/shared/providers`, which pulls in `node:fs`/`@aws-sdk/*` and
would be unsafe to import into a browser bundle. Both apps' `next/image`
usage is meant to go through `lib/media-image-loader.ts` (admin's media
page does; storefront's is a ready extension point — no real product
imagery exists yet, see Milestone 3/4 in PROGRESS.md). Local/s3 pick the
nearest pre-generated variant; Cloudinary builds a transformation URL
(`f_auto,q_auto[,c_<crop>,w_,h_,g_xy_center,x_,y_,fl_region_relative]`) —
the focal-point-to-gravity mapping (`fl_region_relative` treats x_/y_ as
0–1 fractions, matching how `focalX`/`focalY` are already stored) is
documented but **not verified against a live Cloudinary account** — no
credentials in this sandbox. Covered instead by exact-string unit tests
against Cloudinary's own published transformation syntax and the required
mock driver.

**Decision — Cloudinary talks to Cloudinary via plain `fetch` + a hand-rolled
signature,** not the official `cloudinary` SDK — same reasoning as the
existing S3 driver (`@aws-sdk/client-s3` is the one SDK dependency; nothing
else needs a bespoke vendor package). `config.mock: boolean` is the
required mock mode, exercised by every Cloudinary-path test in this change.

**Decision — direct-to-provider upload, S3 and Cloudinary only:** local has
no signed-PUT concept, so `createDirectUploadTicket` reports
`supported: false` for it and the admin UI falls back to the existing
multipart `POST /admin/media` path. The `Media` row is created only at
`finalize`, not at ticket-issuance, so an abandoned ticket never leaves an
orphaned placeholder row. The ticket response echoes back
`storageDriver`/`providerInstanceId` for the client to send to `finalize`
unchanged — guarantees finalize resolves the *same* driver the ticket was
issued for even if `media.defaultProvider` or the usage-fallback decision
changes in the few seconds in between, without needing server-side session
state for it.

**Decision — "verified copy" in the migration job means "upload succeeded
and (for images) returned real dimensions," not a byte-for-byte checksum.**
Full content verification is a reasonable future hardening, deferred as a
deliberate scope line for this change rather than left as an unstated gap.
The job is Super Admin only (`SuperAdminGuard`, checking
`staffUser.roles[].role.isSystem`, not a permission string — only the
seeded Super Admin role is a system role, consistent with M1's "no
superuser bypass" design) — resumable via a stored `cursor` (last
processed `Media.id`) and chunked at 20 assets per scheduler tick, so it
stays free-tier safe (no long-running request).

**Decision — usage alerting reuses the audit log, not a new notification
channel.** `ProviderRegistryService.getUsage()` caches a provider's usage
for 1h and audit-logs a `provider_instance.usage_alert` entry the first
time 80%/95% is crossed (visible on the existing Audit page to Super
Admin). Actually paging/emailing Super Admin is deferred to the
general staff-notification system already flagged as deferred in M1
(`notifications_admin`) — building a one-off channel just for this would
pre-empt that design. The "fall back to env storage near the limit" rule
(`media.fallbackToEnvOnProviderLimit`, default on) reuses the same cached
value rather than calling the usage API per upload.

**Decision — a `--color-warning` theme token was added** to
`packages/config/tailwind/preset.css` (alongside the existing
`danger`/`success`) for the System Health page's 80%/95% banners — this is
a design-system token like its siblings, not brand content, so it doesn't
violate golden rule 1.

**Deferred (documented, not silently dropped):** Cloudinary's AI tools
(background removal, auto-tagging, etc.) belong with the other AI features
in Phase 2 (M13) — `createCloudinaryMediaDriver` is the extension point;
see the TODO in `docs/PROGRESS.md`. A fuller System Health dashboard (queue
depth, DB connection status, per-provider error rates) is its own future
milestone — the page built here is deliberately scoped to just the
Cloudinary usage panel this change needs.

## 2026-10-23 — Milestone 2: catalog and inventory

**Context.** §16 M2 is the largest milestone so far: categories, attributes,
size systems/charts, options & the variant matrix, products (full editor),
collections (manual + automatic), price schedules, product version
history, stock locations/levels/movements, CSV/Excel import/export with a
dry-run report, barcode labels, and search (Postgres FTS + trigram +
editable Banglish synonyms). Built in one pass; the decisions below cover
where the spec left room for judgment and where scope was deliberately
trimmed to fit, consistent with §0.1's "pick the most reasonable option and
record it" instruction.

**Decision — catalog slugs (`categories`, `products`, `collections`) are a
single ASCII identifier shared by both locales, not per-locale paths.**
`packages/shared/src/catalog/slug.ts` (`slugify`/`uniqueSlug`) strips
non-ASCII, so a Bangla-only title falls back to an id-based slug. Simplest
option consistent with golden rule 1, and nothing routes on a per-locale
slug before the storefront exists (M3/M4) to need it. A slug only changes
on an explicit rename request (`dto.slug` present) — editing the title
alone never silently rewrites it and breaks a link already issued.

**Decision — full-text search uses a trigger-maintained `tsvector`, not a
Postgres generated column.** `products.search_document` is
`Unsupported("tsvector")` in `schema.prisma` (Prisma can't model it) and
populated by a `BEFORE INSERT OR UPDATE` trigger in
`20261023090000_catalog_inventory_search/migration.sql`, because
`to_tsvector()` is STABLE, not IMMUTABLE, and Postgres only allows
IMMUTABLE expressions in `GENERATED ALWAYS AS ... STORED` columns — the
standard workaround. The config is `simple` (no stemming), so mixed bn/en
tokens and Banglish synonym entries index as literal lexemes. Synonym
expansion happens at query time (`apps/api/src/search/search-query.ts`): a
typed word is looked up in the editable `search_synonyms` table and
expanded to every spelling in its group before the tsquery is built, so
"punjabi", the Bangla script spelling, and the product's own literal
title token "panjabi" all match once a synonym row links them — exactly
the acceptance scenario. `pg_trgm` similarity is an additional OR'd
fallback for typo tolerance. Not exercised against a live Postgres in
this environment (none available) — `search-query.spec.ts` covers the
query-building logic the way the Cloudinary driver's mock mode covered
that integration in the previous change; re-verify against a real
database before launch.

**Decision — `inventory_levels.available` is a real Postgres `GENERATED
ALWAYS AS (on_hand - reserved) STORED` column**, unlike `search_document`:
simple integer arithmetic is IMMUTABLE-safe, so this one can use
Postgres's native generated-column syntax. It's declared in
`schema.prisma` as an ordinary `Int` field that application code never
writes — Prisma only reads it back.

**Decision — a new `SchedulerService.registerRecurring(type, handler)`
mechanism**, alongside the existing `registerHandler` (for tracked
`scheduled_tasks` rows). Two features this milestone — flipping a
`scheduled` product live at its `publishedAt`/`unpublishAt`, and
applying/reverting price schedules at their `startsAt`/`endsAt` — are
cheap, idempotent sweeps with no per-run job state worth tracking; forcing
them through a job row would be pure overhead. `runDueTasks()` (called by
both the embedded 60s tick and the external-cron endpoint) now runs every
registered recurring handler first, each wrapped in try/catch so one
failing sweep never blocks the others or the tracked-task queue.

**Decision — price schedules snapshot the exact prior price per variant
(`appliedSnapshot: { [variantId]: previousPrice }`) at apply time**, so a
revert is exact even if something else touched the same variant's price
in between, and `revertOnEnd: false` schedules simply end without
touching prices (the discount becomes the new permanent price). Percent
changes round to the nearest poisha (`price-math.ts`, golden rule 3 — no
fractional poisha ever persisted).

**Decision — `catalog.cost.read` is a narrow, single-purpose permission**
gating `ProductVariant.costPrice` in API responses
(`cost-price.filter.ts`), rather than building a general field-level-
permission framework for the whole API. §5.3 only calls this field out by
name ("cost price (permission-protected)"); a generic framework is
speculative scope the spec doesn't ask for yet.

**Decision — `MediaUsageService.sync(entityType, entityId, mediaIds)`**
(new, in `apps/api/src/media/`) extends M1's "media delete is blocked
while in use" rule to every catalog entity that references an image —
product gallery, category/collection image+banner, size chart "how to
measure" image, attribute value image, option value swatch — via a single
diff-based reconcile call instead of each service hand-rolling
`media_usages` writes.

**Decision — CSV/Excel import uses one fixed row template (one row is one
variant, grouped into a product by `productSlug`), not a drag-and-drop
column-mapping UI.** §8.2 calls for "CSV/Excel import with column
mapping"; a full mapper is substantial standalone UI work that doesn't
change what's achievable (upsert 500 products with variants, with an error
report) — it only changes how forgiving the uploaded file's headers can
be. `row-schema.ts`'s header matching is already case/spacing-tolerant.
The mapper itself is a reasonable follow-up, not silently dropped — noted
below. Parsing/writing both `.csv` and `.xlsx` uses `xlsx` (SheetJS, a new
`apps/api` dependency) — one vendor dependency, same "no bespoke parser"
pattern as the S3 driver's AWS SDK.

**Decision — the import job's uploaded bytes and the running error list
are scratch data stored directly on `CatalogImportJob` (a `Bytes` column,
cleared once done; a JSON error list, rendered to CSV only on download),
not pushed through the media library/provider framework.** It's processing
state for the job's lifetime, not catalog content — going through Media
would create rows nothing should ever reference as media.

**Decision — export round-trips the commerce-critical columns (sku,
price/compare-at/cost, barcode, weight, category, tags, status) but not
size/color option labels or current on-hand stock.** Reconstructing option
labels and location-scoped stock into the same flat row needs extra joins
that don't change the acceptance scenario; flagged below as the next
enhancement rather than silently incomplete.

**Decision — the variant matrix generator is strictly additive.**
Re-running it after adding a new color only creates the newly-missing
combinations (compared by value-id set, `variant-matrix.ts`); it never
touches an existing variant's price/SKU/stock. Zero options yields exactly
one variant (the "free size" case, §5.3). New variants get an
auto-generated SKU (`<PRODUCT-SLUG>-<n>`) and `price: 0` — the admin fills
real prices in via the editor's per-variant fields or the bulk-fill
action, matching §8.2's own "generate matrix, then bulk-fill column"
workflow.

**Decision — collections' "automatic" rule builder is a small typed
condition tree** (`category`/`tag`/`price`/`attribute`/`status`, each with
an operator and value, ANDed or ORed — `collections/collection-rules.ts`)
evaluated into a Prisma `where` clause, not a general-purpose query
language. Covers the realistic cases (§8.2's own example surface) without
building a rule-expression parser.

**Decision — the admin category tree, size chart row editor, and
product-media picker are deliberately simple, not the full polish
described in §8.1/§8.2.** Categories reorder via a parent dropdown plus a
numeric `sortOrder` rather than drag-and-drop; size chart rows/columns are
entered as comma-separated lists rather than a spreadsheet-style grid; the
product editor's media picker is a dropdown over the existing media
library by filename rather than a searchable modal with inline upload.
Barcode labels print as plain text (SKU, barcode value, title, price) in a
3-column print view, not a real Code128 symbology render. Each is
functionally complete (an admin can do the task) but visually/ergonomically
simpler than the full spec — the same kind of MVP-first trade already made
for M1's settings UI and provider config forms.

**Deferred (documented, not silently dropped):**
- CSV/Excel import's drag-and-drop column-mapping UI (currently a fixed
  template) and image-by-URL / bulk zip image import (§8.2) — picked up
  whenever catalog import needs more than the fixed template handles.
- Export including option labels and per-location stock.
- Real barcode symbology rendering (e.g. Code128 via a client-side
  renderer) for the printed labels, if warehouse scanning needs it before
  M6's fuller label/invoice PDF work.
- Storefront catalog pages (category/product listing, PDP) — that's M4's
  job per the milestone plan; M2 only needed the API, the admin panel, and
  the one `/store/search` endpoint the acceptance scenario exercises.
- Stock transfers, stock takes, suppliers, purchase orders — explicitly
  M12 (phase 2) per §16, not M2.
- Re-verify the full Postgres FTS + trigram + synonyms search path and the
  CSV import job against a live Postgres and a real 500-row file — no
  database is available in this environment (same root cause flagged
  throughout M0/M1 and the Cloudinary change).

## 2026-10-23 — Milestone 3: theme, CMS core, storefront shell

**Context.** §16 M3: theme tokens/presets/layout variants, the block
system with an MVP library, the page builder (drafts, publish, schedule,
versions, edit lock, autosave), menus, announcement bars, popups, UI text,
redirects, the storefront shell (header/footer/mega menu/chat/announcement
bar), the CMS-driven home page, CMS pages, policy placeholders, the
revalidation pipeline, `/_styleguide`, and 404/500/maintenance. The
acceptance scenario is: change brand color + header variant + home hero
text in admin, see all three on the storefront within 10s with no deploy;
a scheduled banner appears/disappears at its times; restoring an older
page version works.

**Decision — a page's blocks live as a JSON array directly on `pages`
(`blocksDraft`/`blocksPublished`, two separate columns), not normalized
into their own table.** Nothing at this milestone's scale ever queries
"every page using block type X"; a polymorphic per-block-type props table
would add real complexity for no present benefit. Two columns (rather than
one plus a status flag) make "draft vs published" (§9.2) structural: the
storefront only ever reads `blocksPublished`, the editor only ever writes
`blocksDraft`, and "Publish" is just the one place that copies one into
the other — there's no code path that can accidentally leak an in-progress
edit onto the live site.

**Decision — `@clothing/blocks` has two entry points: `.` (React
components, for the storefront) and `./schemas` (zod schema + defaults +
`validateBlocks()`, no React import at all, for the API).** `PagesService`
validates saved block props against `./schemas` — pulling in React (and
every block's JSX) just to run `nest build` and serve JSON would be a
needless coupling, and this split costs nothing since the two concerns
(validate props vs. render a component) were already separate.

**Decision — a block's image props store an already-resolved URL
(`imageUrl: string`), not a `mediaId` reference.** The admin's media
picker resolves the URL once, at save time, and it's just a plain string
in the block's JSON from then on — no public "resolve a media id to a URL"
endpoint needed, and the storefront's block Components stay pure/
presentational (no data fetching for images). The trade-off, accepted
deliberately: if that asset is later migrated to a different storage
provider (the Cloudinary change's migration job), a block referencing it
by URL doesn't follow — re-saving the block re-resolves it. Narrow enough
a case to accept for now; recorded here so it isn't a silent surprise.

**Decision — `category_tiles`/`product_grid` fetch live catalog data at
render time from new, minimal, public `/store/catalog/categories` and
`/store/catalog/products` endpoints — deliberately not the filterable/
faceted/paginated storefront catalog experience.** That's Milestone 4's
own job; these two endpoints exist only to give those two block types
card-sized data to render on the CMS-driven home page. `on_sale` is
approximated as "any variant with `compareAtPrice` set" rather than a
column-to-column SQL comparison — the normal way that field is used in
practice.

**Decision — the publishing pipeline (§9.6) is a real cross-process HTTP
call, not same-process cache invalidation.** `RevalidationService` (API)
posts `{ tags }` to the storefront's `POST /api/revalidate` with a shared
secret (`REVALIDATE_SECRET`); the storefront calls Next's `revalidateTag`
for each one. Every storefront data fetch (`lib/store-api.ts`,
`@clothing/blocks`'s `store-api.ts`) is also tagged and carries its own
60s `revalidate` fallback, so a missed or failed revalidation call still
self-heals shortly rather than serving stale data indefinitely. Next 16
changed `revalidateTag`'s signature to require a second argument (a
`cacheLife` profile or `{ expire }`); `{ expire: 0 }` reproduces the old
"expire this tag's cache immediately" behavior.

**Decision — announcement bars and popups compute their active-now window
at *read* time** (`isActive` AND inside `startsAt`/`endsAt`), not via a
scheduler sweep that flips a status field. This is both simpler and more
correct than a sweep for "appears/disappears at its times": there's no
window where a sweep hasn't run yet and the bar is stale, and no extra
job to register. Scheduled *page* publishing still needs a sweep (M2's
`SchedulerService.registerRecurring`, reused here) because publishing is
a one-time state transition with side effects (snapshot a version,
revalidate) — reading an announcement bar has none.

**Decision — the page editor's edit lock (§9.2) expires on inactivity
(2 minutes) rather than needing an explicit unlock, and "restore a
version" only ever writes `blocksDraft`, never `blocksPublished`.** A
staff member who closes their laptop mid-edit shouldn't lock a page for
everyone else indefinitely; and restoring a version is explicitly staged
for review before it goes live (§9.2 "restore as draft"), matching the
acceptance scenario's "restoring an older page version works" without
also silently re-publishing whatever the editor was last looking at.

**Decision — `custom_html` is sanitized once, server-side, at save time**
(`sanitize-html`'s default allow-list, in `PagesService.updateBlocks`),
not re-sanitized at render time in the storefront. It's also the one
block type gated to Super Admin (`validateBlocks`'s `superAdminOnly`,
checked against `actor.isSuperAdmin` — the same mechanism as the
Cloudinary change's `SuperAdminGuard`). Together these mean the
storefront's `CustomHtmlBlock` can use `dangerouslySetInnerHTML` and
genuinely never see attacker-controlled markup (§12).

**Decision — `react/prop-types` is now off in the shared
`@clothing/config/eslint/next` config.** It fired for the first time on
the page-block editor's `HeroFields` component, which destructures a
cast, typed object inline in JSX; eslint-plugin-react's own guidance for
TypeScript projects is to disable this rule, since TS's static types
already check props far more strictly than `React.PropTypes` ever could.

**Decision — the storefront's `/_styleguide` route lives in a folder
literally named `%5Fstyleguide`.** Next.js treats any `_`-prefixed folder
as a private, unroutable implementation detail by convention; `%5F` (the
URL-encoded underscore) is Next's own documented escape hatch for a route
segment that must start with a literal underscore.

**Decision — the admin UI built this milestone is Pages (list + editor:
friendly fields for `hero`, a JSON textarea for every other block type's
props, add/reorder/remove, publish, schedule, version history + restore)
and Announcement bars (CRUD with a schedule).** Menus, Popups, Redirects
and UI Text have a complete API (CmsModule) but no admin page yet — a
real, but honestly scoped, gap, not a silent one. Two things significantly
narrowed what else was needed:
1. The Settings page (`docs/PROJECT_SPEC.md` §4.1: "the admin Settings
   area is generated from the registry") already renders every new
   `theme.*`/`features.*`/`chat.*`/`seo.*` setting with zero new admin
   code — so brand color *and* header variant (the acceptance scenario's
   first two changes) needed no new UI at all.
2. A full per-block-type visual form (one bespoke widget set per block
   type, `form.ts` per §9.1) is substantial standalone work that doesn't
   change what's achievable here — the JSON-textarea fallback (matching
   the Integrations screen's existing "config as JSON" pattern) still
   lets every block type be authored; only `hero` gets friendly fields,
   since it's the one the acceptance scenario exercises directly ("home
   hero text").

**Deferred (documented, not silently dropped):**
- Admin UI for menus, popups, redirects, UI text (backend complete).
- Per-block-type visual forms beyond `hero`'s friendly fields.
- A real interactive popup component on the storefront (timed/exit-intent
  modal) — the API and public read endpoint exist; nothing renders it yet.
- Brand logo resolution to a URL (the header renders the brand name as
  text) and actual font loading/self-hosting for `theme.fontBangla`/
  `fontLatin` (the settings exist; nothing serves the fonts yet).
- The live-preview iframe + `postMessage` editing experience (§9.2) — the
  editor writes `blocksDraft` directly instead; a true live preview is a
  separate, substantial piece of storefront/admin wiring.
- Global blocks (save as global, propagate to every page using it) and
  page templates (§9.2) — neither changes what a single page can do.
- Mega-menu dropdown rendering exists in `Header`, but full "up to 3
  levels" nested menu editing in the admin isn't built (no menu admin UI
  yet, per above).
- Re-verify the full acceptance scenario (brand color/header
  variant/hero text change → visible on a live storefront within 10s;
  scheduled banner appears/disappears; version restore) against a real
  Postgres and a running storefront process — no database is available
  in this environment (same root cause flagged throughout M0–M2).

## 2026-10-23 — Milestone 4: storefront catalog experience

**Context.** §16 M4: category/collection listing with filters/sort/
pagination/facets, search + instant suggestions, the full PDP, wishlist,
recently viewed, notify-me, SEO (meta/structured data/sitemaps/robots/
hreflang/canonical), first-party analytics. Acceptance: Lighthouse mobile
≥90 performance / ≥95 SEO on home/category/PDP with demo data on a local
production build; selecting a color switches images; unavailable size
combinations are disabled.

**Decision — `/c/[...slug]` only looks up the *last* path segment against
the (flat, unique) category slug.** §13.2 wants clean-looking nested URLs
(`/c/men/panjabi`); the `categories` table has no stored hierarchical path,
just a single unique slug per category (§5.3, unchanged since M2). A
catch-all route that only resolves the final segment gets the same URL
shape without adding path-building/validation for every ancestor — a
category that moves to a new parent doesn't need its own slug to change,
and a wrong ancestor segment in the URL still resolves (rather than 404s),
which is an acceptable trade-off for a single-brand storefront.

**Decision — wishlist and "recently viewed" are client-only (localStorage),
full stop, this milestone.** §7.2/§7.4 ask for "guest + account" wishlist
and "local storage + account sync" for recently viewed — but customer
accounts don't exist before M5 (customer auth). Building the guest half
now and the account-sync half later is the natural split, not a
workaround: `lib/use-local-list.ts` is written so that "read this list and
merge it into the account's stored one on login" is the obvious extension
point once a customer model exists.

**Decision — a menu item's `targetId` is expected to already be a slug**
for `category`/`collection`/`product`/`page` types, not a database id,
despite the field's name. There's no menu admin UI yet (deferred in M3)
to write a real id into it, and resolving id→slug per render for every
menu item would mean either N extra queries per page load or a cache this
milestone doesn't need yet. When the menu admin UI is built, it should
write (or resolve to) the slug directly — see the comment on
`apps/storefront/components/header.tsx`'s `menuHref`.

**Decision — price-sorted listings sort in application code, not SQL.**
Prisma's `orderBy` can sort a parent query by a related list's `_count`,
but not by `_min`/`_max` — and this listing's `where` is assembled
dynamically from whichever filters the shopper picked, so a hand-written
raw-SQL equivalent would have to duplicate all of that filter-building
logic just for one sort order. Instead, `price_asc`/`price_desc` load
every matching product's id + variant prices (bounded by the same
`where`), sort by min price in memory, and paginate the *id list* before
fetching full rows for just that page. Correct and fine at the free-tier/
single-category scale this is built for; a real search engine's sort
(when/if one gets added) is the answer at a scale where loading every
candidate id stops being cheap.

**Decision — facet counts are scoped to the category/collection/tag
alone, never re-filtered by the shopper's own attribute selections.**
A shopper can always broaden a filter (every facet count stays accurate
against the base scope), at the cost of not showing "count if this facet
were also applied" the way a dedicated search/facet engine would. A
simpler, honestly-scoped facet model, not the full thing.

**Decision — the listing's "in stock only" filter is approximated as "has
an active variant"**, not a real inventory join (`available > 0` per
variant, summed across locations) — the PDP's own availability data *is*
real (see below), but doing that join for every row of a paginated
listing query is a cost this milestone's scope doesn't justify yet.

**Decision — `SearchService` (M2) now returns the same card shape
(`id, slug, title, imageUrl, priceFrom, compareAtFrom`) as every other
public listing endpoint**, resolving the image URL via
`MediaProvidersService` like `StoreCatalogService` does, instead of the
raw Prisma rows (with an unresolved `media.media` relation) it returned
before M4 had a reason to care. A drive-by consistency fix while wiring
the storefront's search results page, not a new feature.

**Decision — the PDP's "Add to cart"/"Buy now" buttons are real, visible,
reachable UI — not disabled — but their handler just shows a "coming
soon" message instead of mutating anything.** §16 M4's own bullet list
names "sticky ATC" as a PDP part to build in *this* milestone, while cart
mutation itself is explicitly M5's ("Cart (drawer + page) with pricing
pipeline"). Rendering the real button now (full width, sticky bar on
mobile, correct price) means M5 only has to wire the handler, not design
a screen; showing a message rather than failing silently or looking
broken makes the current limit honest to whoever clicks it.

**Decision — reviews on the PDP read `Product.ratingAvg`/`ratingCount`**
(denormalized columns that have existed on `products` since M2) rather
than a `reviews` table — that table, and the moderation/photo-review/
fit-feedback UI around it, is M8's ("Marketing basics, customers,
reviews..."). "No reviews yet" is the honest empty state until M8 ships
real reviews that update those two columns.

**Decision — delivery estimate, delivery fee preview, and COD
availability are not on the PDP**, despite being named as PDP MVP parts
in §7.4. All three need shipping zones/rates, which don't exist before
M5 ("shipping zones & rates editor and calculation"). Flagged below as
deferred rather than stubbed with fake numbers.

**Decision — `robots.txt` is a static, code-defined rule set
(`app/robots.ts`), not driven by a settings-registry entry**, despite
§13.2 saying "robots.txt from settings." There's no admin screen that
would ever edit custom robots rules yet, and a setting nobody can change
is no better than a constant — this is one for whenever that screen
exists, not a silent gap (the `sitemap.xml` URL inside it, and the
disallow list, are both correct and real for what's built so far).

**Decision — Organization + WebSite (`SearchAction`) JSON-LD lives in the
root layout (site-wide), Product/Offer/AggregateRating/BreadcrumbList
live on the PDP** — matching §13.2's list except `FAQPage` (no FAQ system
exists yet) and `Article` (blog is phase 2, M10). Dynamic per-product OG
images (image + price, cached) are not built; PDP Open Graph tags reuse
the product's own first photo instead — a real image, just not the
composed price-overlay variant §13.2 describes.

**Deferred (documented, not silently dropped):**
- Delivery estimate/fee preview/COD availability on the PDP (needs M5's
  shipping zones & rates).
- Dynamic price-overlay OG images for products.
- `FAQPage`/`Article` structured data (no FAQ/blog system yet).
- A real search/facet engine's "count as if this facet were also
  selected" — the current facet model is scoped to category/collection/
  tag only (see above).
- A genuine inventory join for the listing's "in stock only" filter
  (currently approximated as "has an active variant").
- Account-synced wishlist/recently-viewed (needs M5's customer auth).
- A notify-me admin viewer (the requests are recorded; nothing reads them
  back in the admin yet) and actually sending the "back in stock" message
  (needs M7's notification drivers).
- The k6 load-test scripts and the 500-VU load test itself (§13.1) — a
  deployment-time exercise, not something this environment can run.
- **Cannot verify in this environment at all**: the acceptance criterion
  itself (Lighthouse mobile ≥90 performance / ≥95 SEO on home/category/PDP
  with demo data, on a local *production* build) needs a seeded demo
  catalog behind a live Postgres and a real Lighthouse/Chrome run — none
  of which exist here. Every page was built to the documented performance/
  SEO techniques (SSR, pre-sized images via the existing media pipeline,
  semantic HTML, real anchor-tag pagination, structured data, minimal
  client JS — product option/gallery interactivity is the one unavoidably
  client-rendered piece), but the actual score needs that environment to
  measure. Re-run Lighthouse against a real deployment with demo data
  before launch.

## 2026-10-24 — Milestone 5: cart, checkout, shipping, payment rules, customer auth

**Context.** §16 M5: cart pricing pipeline (§6.3), shipping zones/rates
(§6.4), payment rules engine (§6.5), risk scoring (§6.6), stock reservation
(§6.7), one-page checkout (§7.5), OTP + Google customer auth (§6.13),
order placement with idempotency, payment drivers (COD + mock + SSLCommerz/
bKash/Nagad), payment reconciliation, Turnstile. Acceptance: two buyers
racing for the last unit → exactly one order succeeds; an admin shipping-
fee change is reflected in checkout totals immediately; a high-risk rule
forces an advance payment and the order starts `pending_payment` then
moves to `pending` after the mock payment succeeds; expired unpaid orders
release their stock reservation.

**Decision — stock reservation is one conditional `UPDATE ... WHERE
available >= :q` per line, inside the same transaction that creates the
order, not a read-then-write check.** This is the one piece the whole
acceptance scenario hinges on: Postgres takes a row lock on the first
concurrent writer, and the second writer's `WHERE` clause is re-evaluated
against the just-committed row once the lock releases — so it either
finds enough `available` and reserves, or finds too little and the
`UPDATE` affects zero rows, which `StockReservationService.reserve()`
turns into a thrown `OUT_OF_STOCK` that rolls back the whole order-
creation transaction. No read-then-write window exists for two requests
to both believe they got the last unit. Payment-gateway network calls
(`PaymentsService.initiate()`) happen strictly *after* this transaction
commits, never inside it — holding a row lock across a network call to a
third party would be its own outage risk.

**Decision — risk scoring and the authoritative payment-rules evaluation
both happen at order placement, not during cart pricing**, exactly as
§6.6 says risk is "computed at order placement." The cart/checkout
*quote* (`CartPricingService.price()`) still runs payment rules for a
best-effort preview (so the checkout page can show "advance required" or
a disabled payment method before the customer commits), using
`riskLevel: null, riskScore: null, phoneBlocked: false` — rules that
don't key off risk/blocklist behave identically in preview and at
placement; rules that do are only authoritative the second time, after
`CheckoutService` has computed the real risk score and blocklist match.
`CartPricingResult.ruleContextBase` carries every other field the engine
needs so placement doesn't have to re-run the whole pricing pipeline a
second time just to re-evaluate payment rules.

**Decision — `blocklist_entries` (spec table home: §5.10, nominally a
later milestone) was built now instead**, because §6.5's default-seeded
rule 1 ("blocklisted phone/IP/device → block order") and §6.6's risk
signal 1 both need it to mean anything at all; a payment-rules engine
that references a table that doesn't exist yet isn't a reasonable
MVP. `BlocklistService.findMatch()` is the one method both consumers
share.

**Decision — combinable_with is two booleans (`automatic`, `codes`),
not a full per-discount-pair matrix.** §5.8 describes combinability as
"other discounts / codes / automatic" in the abstract; a real matrix
(discount A explicitly allows/forbids combining with discount B
specifically) is a lot of admin UI and data modeling for a rule that, in
practice, almost every store expresses as "my automatic discounts can
stack with each other" / "only one code at a time" / "codes and
automatic discounts can/can't combine." The two-boolean model covers
every real case named in the spec's own example (margin guard override
aside) and is what `discount-math.ts`'s `canCombine()` implements and
tests.

**Decision — the margin guard blocks a discount *per line* by default
(zeroing that line's allocation), not the whole discount, when
`pricing.marginGuard.blockWholeDiscount` is off** (§6.3 step 5: "block
the discount for that line (or the whole discount, per setting)"). Cost
price is read from `ProductVariant.costPrice` (already permission-gated
behind `catalog.cost.read` since M2) — margin guard itself runs server-
side and never exposes cost price to the client.

**Decision — flash sales are "basic" exactly as M5's own bullet says**:
a `FlashSale` + `FlashSaleItem` (variant, sale price, optional stock cap)
with no countdown-widget config, banner builder, or "shop the look"
bundling — those are richer M10/M13 territory. `FlashSalesService.
getActivePrice()` is the one method the cart pricing pipeline calls;
`recordSold()` tracks the stock cap independently of `inventory_levels`,
since a flash-sale cap and real on-hand stock are different limits that
can both apply to the same variant at once.

**Decision — discounts/flash-sales got a minimal CRUD API this
milestone, not the "full UI."** §16 M8 explicitly owns "discounts &
coupons full UI... bulk unique codes, margin guard [UI], flash sales
UI" — M5's own bullet only promises the pricing-pipeline *engine*
("automatic + code discounts, basic flash sales"). The admin screens for
both are deferred to M8; for now a discount or flash sale is created via
the API directly (e.g. from a seed script or `curl`/Swagger) until that
UI exists. Shipping zones/rates and payment rules *did* get admin pages
this milestone because M5's own bullet names them explicitly ("shipping
zones & rates editor," "the payment rules editor").

**Decision — the payment rules admin page edits conditions/actions as
raw JSON, not a visual rule builder.** The condition vocabulary alone
(order totals, zone/district/area, customer type/history, risk level,
cart contents, payment method, time windows, UTM source, blocklist —
see `payment-rules-engine.ts`) is large enough that a real builder UI is
its own multi-day effort; a JSON textarea is still fully admin-editable
(golden rule 1 — nothing is hardcoded) and is the honest MVP for this
milestone. Worth revisiting once there's a concrete UX need for it.

**Decision — customer sessions are JWT access token (15 min, HS256, key
derived from `APP_ENCRYPTION_KEY` via HMAC) + opaque rotating refresh
token (30 days, DB-backed, same hash-and-compare shape as staff
sessions), deliberately different from staff auth's pure DB-session
model.** Staff traffic is low-volume and already pays a DB round trip per
request elsewhere; customer-facing traffic is the higher-volume path, so
a stateless, fast-to-verify access token is worth the trade-off of
"revocation only takes effect once the access token expires" — the
refresh token (the thing that's actually revocable on logout) still goes
through a DB check on every use. No new `CUSTOMER_JWT_SECRET` env var:
deriving the signing key from the encryption key that already exists
keeps setup to the same number of required secrets while still using
distinct key material for the two purposes.

**Decision — OTP delivery has no message-template system yet** (the SMS
text is a plain, hardcoded-in-English string in `OtpService`). §6.11's
bilingual, variable-driven message template editor is M7's job; building
a one-off bilingual template just for OTP, then throwing it away when M7
adds the real system, isn't worth it. In non-production environments the
generated code is also returned in the API response (`devCode`) and shown
on the storefront's OTP screens — there is no real SMS gateway configured
anywhere in this environment, so without this nothing could be tested or
demoed end-to-end; gated strictly behind `NODE_ENV !== "production"`.

**Decision — SSLCommerz/bKash/Nagad drivers are implemented against each
provider's publicly documented flow (session+validate; grant-token+
execute; initialize+complete+verify) but not verified against a live
sandbox account** — no merchant credentials exist in this environment
(§10: "no merchant accounts exist yet... leave live credentials to be
entered in admin"), consistent with every other driver built so far. Each
has a doc-comment flagging the specific risk: endpoint paths and payload
shapes are the part most likely to have moved since written, so
**re-verify against each provider's current documentation before going
live.** The mock driver is what every path in this milestone was actually
exercised against (boot-tested end to end: initiate → the `MockPayController`
"fake hosted page" → `confirmByExternalRef` → `OrdersLifecycleService`
moving the order from `pending_payment` to `pending`).

**Decision — Turnstile verification happens inline in
`CheckoutService.placeOrder()`, gated by `checkout.turnstileEnabled`**,
not as a separate guard/interceptor — it's one settings check + one driver
call, and place-order is the only endpoint §7.5 actually asks for it on
("invisible on checkout... on place-order"). The mock captcha driver
(always succeeds unless configured to simulate failure) is what this was
tested against; the real Turnstile driver needs a real site/secret key
pair, which — like every other provider this project integrates — doesn't
exist until an admin configures one.

**Decision — division/district/area ids on `Address`/`Cart`/`Order` are
plain `String` fields validated against the `divisions`/`districts`/
`areas` tables in the service layer (`LocationsService.validateChain()`),
not Prisma relations.** Making them real relations would mean adding a
back-relation array to `Division`/`District`/`Area` — stable M1 reference-
data models — for every new consumer forever; a soft reference matches
the precedent already set by `Category.attributeIds` and
`PriceSchedule.targetId`.

**Decision — the admin's "searchable" area select (§7.5: "cascading
selects (searchable, Bangla + English)") searches client-side**, not via
a server-side query param. Areas per district are few enough to fetch
whole and filter in the browser, which searches bn+en at once "for free"
instead of a JSON-path `OR` query on the API side — same reasoning
`StoreLocationsController` already documents for M4's catalog filters.

**Decision — the account area ships login (OTP) + orders list + a
read-only addresses list (view/remove, no edit) this milestone, with new
addresses saved from checkout's own address form rather than a duplicate
"add address" form on the account page.** A full address-book CRUD
screen and a mounted Google Identity Services button are both reasonable
near-term follow-ups (the API side for both — `POST /store/account/
addresses`, `POST /store/auth/google` — is already built and ready) but
weren't essential to proving the milestone's acceptance scenarios, all of
which are checkout-path, not account-area, concerns.

**Not verified in this environment** (same limitation as every prior
milestone — no live Postgres, no live browser): the actual concurrent-
request race (unit-tested at the `StockReservationService` level with a
mocked transaction client, and reasoned through against Postgres's real
row-locking semantics in the doc comment on that service, but never run
against two real concurrent HTTP requests hitting a real database);
Lighthouse/visual QA of the new storefront cart/checkout/account pages;
the k6 500-VU load test (§13.1); and — because no merchant/gateway
credentials exist — every online payment driver beyond the mock.

## 2026-10-30 — Milestone 6

**Decision — labels, invoices, pick lists, and the handover manifest print via the browser's own print-to-PDF, not a server-rendered PDF.** This is the exact pattern M2's barcode-label screen already established
(`apps/admin/.../inventory/page.tsx`'s `window.print()`), extended to every other M6 "PDF" in the spec. Zero new dependencies (no `pdfkit`/headless-Chromium), free-tier friendly (golden rule 8), and the `Invoice` model shrinks to just a stable sequential `number` + timestamp — the content is rendered live from current order data at print time, not stored as a blob. Barcodes render as plain monospace text, same limitation M2 already shipped with, not a new one.

**Decision — "manual" courier is a built-in option, not a provider driver.** Mirrors how COD isn't a `payment` driver (§10.1): there's no real API to call, so forcing it through the `CourierDriver` interface would mean faking `createParcel`/`getStatus` for something that's actually just "staff types in a tracking code and updates status by hand." `ShipmentsService.book()` branches on `courierProviderInstanceId: null` directly instead.

**Decision — the courier status poll job and webhooks funnel through one idempotent `ShipmentsService.applyCourierResult()`.** Whether a status update arrives from `ShipmentTrackingPollService`'s sweep or a provider's webhook, it's the exact same method, keyed off the shipment's current status being non-terminal — so a webhook racing a poll (or firing twice) never double-applies side effects (customer counters, refund creation).

**Decision — partial delivery is reconciled by staff, not inferred from the courier.** None of Steadfast/Pathao/RedX's documented status APIs report *which* items were kept vs. returned at item granularity — only a parcel-level status. When a shipment comes back `partially_delivered`, `ShipmentsService.reconcilePartialDelivery()` is a dedicated staff action (how many of each item were actually kept) rather than something the webhook/poll path guesses at. Full rejection (`rejected_at_door`) needs no such step — by definition nothing was kept — so that refund computes automatically in `applyStatus()`.

**Decision — the doorstep-rejection/partial-delivery refund math is one pure function** (`computeDoorstepRefundableAmount` in `shipments/doorstep-rejection.ts`, unit-tested): `max(0, paidTotal − doorCharge − keptItemsValue)`. It deliberately only touches money that was *prepaid* — a COD order's `codAmount` was never collected in the first place, so there's nothing to refund; the courier just collects less (or more, for kept items) at the door, which is exactly what `codAmount`/`deliveryFeeCollected` already capture without a refund record.

**Decision — an approved exchange return creates its linked order immediately, in `approve()`, not later in `resolve()`.** §6.10 says "exchange stock is reserved at approval time" — since a stock reservation has to belong to a real order row (not float free until some future step), the only way to honor that literally without risking an orphaned reservation is to create the (already-`confirmed`) exchange order in the same transaction as the reservation. `resolve()` for an exchange-type return is then just a status flip; the real work already happened.

**Decision — exchange order pricing is "price difference only," not a re-run of the discount/shipping pipeline.** The new order's line price is `max(0, newVariant.price − originalItem.unitPrice)` per unit; shipping is 0 (staff books a shipment for it like any other order if one is needed). Re-deriving the original order's discount eligibility against a brand-new variant is its own project; this is the honest MVP, and staff can adjust the exchange order afterward with `OrderEditService` like any other pre-ship order.

**Decision — store credit from a resolved return increments `Customer.storeCreditBalance` directly; there is no ledger yet.** §5.8's "ledger-based; balance = sum of transactions" wallet is M8/M13's job (loyalty/store-credit phase). The balance column already exists (seeded ahead of time in M5); M6 just writes to it. Building a one-off ledger table now, then replacing it when M8/M13 lands the real one, isn't worth it — same reasoning already applied to OTP's missing message-template system in M5.

**Decision — reverse pickup for returns is staff bookkeeping only (`schedulePickup()` just flips a status), not a real courier API call.** None of the three courier drivers' documented APIs are confirmed to expose a reverse-pickup/return-booking endpoint distinct from a normal parcel; rather than guess at an unverified shape, §6.10's "courier reverse pickup if supported, or customer sends" collapses to "staff records that a pickup was arranged," same honesty standard as the rest of M6's courier integration.

**Decision — order edit-before-ship (`OrderEditService`) recomputes item/shipping totals live but does not re-run the discount engine, and the admin UI only exposes quantity + a shipping-fee override (no address picker).** Re-evaluating automatic/code discounts against an edited line set would need the same `CartLineForPricing` construction the cart pipeline uses, including live category/tag lookups per line — doable, but its own pass; for now staff edit `OrderDiscount` rows directly if a discount no longer applies. The address-change API field (`PATCH .../orders/:id` with `address`) works and is tested, but the admin UI doesn't expose it yet — it would need the same cascading division/district/area selects already built for shipping zones and checkout, which isn't duplicated a third time in this milestone.

**Decision — manual order creation (`ManualOrderService`) does not reuse `CartService`/`CheckoutService`.** The obvious-looking shortcut — create a cart, add items, call `placeOrder()` — breaks the moment the phoned-in customer already has an active storefront cart from browsing: `CartService.getOrCreateActiveCart()` resolves by `customerId` when one is set, so a manual order would silently merge into (and then `markConverted()`, destroying) whatever that customer left in their real cart. `ManualOrderService` instead builds `CartLineForPricing`-shaped data in memory from current variant prices and calls `ShippingService.calculateFee()` + `StockReservationService.reserve()` directly — no discount-engine re-run either (same reasoning as order-edit above); staff apply one flat discount amount.

**Decision — `OrdersLifecycleService.transition()` is the one place every §6.8 status change goes through, with `ALLOWED_TRANSITIONS` as an explicit table** (not inferred from context) and cancellation's side effects (stock release, pending refund record, coupon-usage release) centralized there since cancellation can be triggered from several unrelated places (customer self-cancel, staff action, a future automation rule). Side effects that need extra context the state machine doesn't have — which shipment, which items passed QC, the actual delivery fee collected — stay at the specific call site (`ShipmentsService`, `PackingService`, `ReturnsService`) instead of being generalized into `transition()` itself.

**Decision — stock has four distinct operations now, not two.** `reserve`/`release` (M5) only ever touch `reserved` — nothing physically moved. M6 adds `fulfill` (decrements `on_hand` *and* `reserved` together, logs a `StockMovement` — the moment stock actually leaves the building, at packed or shipped per `orders.stockDecrementAt`) and `restock` (increments `on_hand` after a QC pass on a return/rejection). Keeping all four on `StockReservationService` (not splitting fulfill/restock into `InventoryService`) keeps every inventory-affecting operation that participates in an order's transaction in one place.

**Decision — duplicate detection (`RiskScoringService.findPossibleDuplicates`, written in M5 but never called) is wired up at checkout placement, symmetrically.** Every order that matches gets the new order's id appended to its own `possibleDuplicateOrderIds`, not just the new order pointing back at the old ones — so opening *either* order shows the full cluster. It's a flag for staff review (filterable in the orders list), not an automatic block.

**Bugfix — SSLCommerz's `initiate()` was sending `total_amount` in poisha, not taka** (missed in M5; bKash/Nagad correctly divide by 100, SSLCommerz didn't). Found and fixed while reviewing the payment-driver pattern for the courier equivalents; a 100x overcharge that never ran against a sandbox to catch it.

**Discovered this session, pre-existing, not caused by M6 — `pnpm build`'s static export now fails on both Next.js apps.** `next build` crashes prerendering Next's own auto-generated `/_global-error` page (`TypeError: Cannot read properties of null (reading 'useContext')`, worker exits), which then takes down whichever other page happens to share that worker — confirmed by reproducing the identical failure on a clean `git stash` back to the M5 commit, with a freshly wiped `.next`, before any M6 file existed; the specific "collateral" page named in the error (`/en/checkout`, `/en/import-export`, `/bn/returns`, `/bn/integrations` — a different one each run) changes between runs, which is consistent with "whichever page's worker happened to be adjacent," not a defect in that specific page. Added a plain, self-contained `app/global-error.tsx` to both apps (neither had one — Next.js was using its own default, which sits above `[locale]/layout.tsx` and has no access to anything that layout provides) since that's the standard fix for this class of issue; it did not resolve it here, so something about Turbopack's production build in this specific sandboxed Windows environment is still the root cause. `pnpm dev` is unaffected (boot-tested repeatedly all session, including with the new `global-error.tsx` present) — this only blocks the static-export `next build` step, not running either app. Needs a real investigation with a working `next build` elsewhere (a normal Linux CI runner, most likely) to say more.

**Not verified in this environment** (same root cause as every milestone so far — no Docker/live Postgres, see `docs/LOCAL_SETUP.md`): the full mock-courier acceptance scenario end-to-end (confirm → pack with scan → book → poll sweep → delivered; a second order → rejected_at_door → refund + restock) was exercised piece-by-piece — the mock courier driver's time-based status progression is unit-tested with fake timers, the doorstep-refund math is unit-tested, the state machine's transitions and cancellation side effects are unit-tested against a mocked Prisma — but never run as one live sequence against a real database and a real `SchedulerService` tick. Steadfast/Pathao/RedX are implemented against each provider's publicly documented API shape (endpoints, field names, status values) with no merchant account to verify against, same caveat already accepted for the M5 payment drivers; their webhook payload field names in particular are a best guess (`shipments-webhook.controller.ts` says so directly) and should be re-checked against a real payload before going live. The admin orders/fulfillment/returns/refunds pages were typechecked, linted, and boot-tested (routes mapped, 401s where expected) but never click-tested in a browser against seeded data.

---

## 2026-11-04 — Milestone 7: notifications and messaging

**Context.** §16 M7: message templates (SMS/email/WhatsApp, bn/en) with
editor/preview/test-send; a per-event channel matrix with fallback order;
SMS drivers (generic HTTP + two named BD gateways); email drivers (SMTP,
Brevo, Resend); WhatsApp click-to-chat (already built M3) + a real Cloud API
driver; notification logs; staff notifications (in-app + email). Acceptance:
placing/confirming/shipping/delivering an order sends the configured
messages via mock drivers in the chosen language, and switching an event
from SMS to WhatsApp needs no code.

**Decision — the two named BD SMS gateways are SSL Wireless and BulkSMSBD.**
Both are widely used BD gateways with a simple HTTP API documentable from
public integration guides (no official reference doc was found for either —
flagged directly in each driver's own doc comment, same "re-verify before
going live" caveat already attached to every courier/payment driver since
M5/M6). SSL Wireless: `POST /api/v3/send-sms` with a JSON body
(`api_token`/`sid`/`msisdn`/`sms`), success is `status: "SUCCESS"`.
BulkSMSBD: `GET /api/smsapi` with query params
(`api_key`/`number`/`senderid`/`message`/`type`), success is
`response_code: 202`; `type` is set to `"unicode"` or `"text"` per message
using the same GSM-7 detection the length counter uses
(`isGsm7Text`/`estimateSmsLength`, `packages/shared/src/notifications/sms-length.ts`).
Both also back a `balance()` call (SSL Wireless's isn't documented well
enough publicly to implement safely, so only BulkSMSBD's is wired — the
`SmsDriver.balance` method stays optional for exactly this reason).

**Decision — a third `generic_http` SMS driver** lets any BD gateway not
worth a named driver work with zero code (§10.3's own requirement): the
admin defines the URL, method, body shape (`query`/`json`/`form`), a
params template with `{to}`/`{message}`/`{api_key}`/`{sender_id}`
placeholders, and a success-detection rule (`successField`/`successValue`,
dot-path into the JSON response). SSL Wireless/BulkSMSBD are really just
pre-filled, tested special cases of this same shape — kept as separate
named drivers anyway because that's what the spec asks for by name, and a
named driver's `testConnection`/`balance` can be real where a generic one
can't.

**Decision — Brevo and Resend follow the exact pattern SMTP (M1) already
established**: plain `fetch`, no vendor SDK (same reasoning as every other
driver — S3's AWS SDK is this project's one accepted vendor-SDK exception).
Brevo: `POST /v3/smtp/email` with an `api-key` header. Resend: `POST
/emails` with a `Bearer` token. Neither verified against a live account (no
merchant credentials — same caveat as every real driver since M5).

**Decision — WhatsApp gets a new `whatsapp` capability in the driver
catalog (`mock` + `whatsapp_cloud`), while `click_to_chat` (M3) stays exactly
what it already was: a settings-driven `wa.me` link builder for the
storefront's chat button and "Order on WhatsApp" link, not a capability
driver.** `click_to_chat` has no server-side "send" operation at all — it
can't participate in the provider framework's `WhatsappDriver.send()`
interface because there is nothing to call. `whatsapp_cloud` is implemented
against Meta's documented `POST /{api_version}/{phone_number_id}/messages`
endpoint, sending a plain `type: "text"` message. **Known limitation,
documented directly on `WhatsappDriver` in `providers/types.ts`:** Meta only
allows a business-initiated message (every transactional notification this
capability sends) to go out as a pre-approved message *template*, not free
text, unless there's an open 24h customer-initiated session — modeling real
template-name/parameter mapping per notification event is a meaningfully
bigger integration (a second mapping layer between our `MessageTemplate`
rows and Meta's own approved template library) and is deferred rather than
half-built. In this environment, the `mock` WhatsApp driver is what the
acceptance scenario's "WhatsApp" channel actually exercises.

**Decision — "available" (for the §6.11 fallback rule "fall back to SMS if
not delivered or not available") means an admin has an *active*
`provider_instances` row for that capability; "nothing configured" falls
back to that capability's own `mock` driver, exactly like M5's
`SmsProvidersService` already did for SMS.** `NotificationDriversService`
generalizes that one-capability pattern to sms/email/whatsapp. This keeps a
fresh install's acceptance scenario working with zero admin setup (every
channel always resolves to *something*, so "sends the configured messages
via mock drivers" is true out of the box) while still giving a real
"unavailable" signal once a driver is actually configured and its `send()`
genuinely fails — `NotificationDispatchService` treats that failure (after
retries) exactly like "not delivered," not differently.

**Decision — the dispatch pipeline is: `NotificationsService.enqueue()`
writes one `notification_logs` row for the *first* eligible channel in the
event's channel-matrix order (inside the caller's own transaction, same
`tx`-threading pattern `StockReservationService`/M6's state machine already
use); `NotificationDispatchService`'s recurring sweep (`registerRecurring`,
same mechanism as M2's publish sweep/M3's price-schedule sweep — no
`scheduled_tasks` row needed) actually calls the driver; a failure retries
with exponential backoff (30s → 60s → 120s → … capped at 1h, 5 attempts by
default) before creating the *next* eligible channel's log row and marking
this one `failed`.** "Eligible" means the recipient has an address for that
channel *and* an active template exists for (event, channel) — a missing
template skips a channel exactly like a failed driver does, so an admin can
effectively disable a channel for one event by clearing its body rather
than needing a separate toggle.

**Decision — `NotificationLog` stores every channel the recipient could be
reached on (`contacts: { sms?, whatsapp?, email? }`), not just the one
channel actually attempted.** The fallback step needs the *next* channel's
address once the current one is exhausted, and by the time that happens the
order/customer row that originally triggered the notification may have
moved on — persisting `contacts` (and `variables`) on the log row itself
means `NotificationDispatchService` never needs to know how to re-derive
them from an order, a customer, or anything else; it only ever talks to
`NotificationsService`/`NotificationLog`. Added as a schema change *before*
generating this milestone's migration (no live DB/migration has ever run
against the original `contacts`-less version), not as a follow-up patch.

**Decision — OTP (§6.13) is NOT routed through the queued/retried dispatch
pipeline.** The customer is waiting for the code right now; queuing it for
a sweep that might run 60 seconds later would break the feature. `OtpService`
still sends synchronously through `SmsProvidersService` exactly as M5 built
it — the only M7 change is that the message text now comes from the
`otp_verification` template (via `NotificationsService.renderOtpMessage()`,
bn/en, admin-editable with the `{otp}` variable) instead of a hardcoded
English string, and the outcome is recorded with
`NotificationsService.logImmediate()` so it's visible on the same
Notifications Log screen as everything else. Locale isn't threaded from the
storefront request into this call yet (always renders `bn`) — a reasonable
simplification until a real need to localize OTP by request locale shows
up; noted here so it isn't mistaken for an oversight.

**Decision — staff notifications (in-app + email) are a separate, smaller
system, not built on `MessageTemplate`/`NotificationChannelRule`.**
`StaffNotificationsService` resolves every active staff user holding a
given permission (currently just `orders.manage`, for "new order"),
inserts one `StaffNotification` row per recipient (the deferred-from-M1
`notifications_admin` table, finally built), and best-effort emails each
one via `NotificationDriversService.resolveEmail()`. There is exactly one
staff event today; building the full customer-facing channel-matrix/
template-editor machinery for it would be speculative scope with no second
use case yet to validate the design against. The in-app bell polls
`GET /staff/notifications` every 30s (`apps/admin/components/notification-bell.tsx`)
— simplest thing that works for a handful of staff on a free-tier,
single-instance deployment (golden rule 8), not a websocket/SSE push.

**Decision — which order-status transitions actually notify the customer.**
`OrdersLifecycleService.transition()` is the one place every status change
goes through (established M6), so a single
`ORDER_STATUS_TO_NOTIFICATION_EVENT` lookup table there covers
confirmed/shipped/out_for_delivery/delivered/partially_delivered/
rejected_at_door/cancelled generically — `order_placed` is handled
separately in `CheckoutService.placeOrder()` since order creation doesn't
go through `transition()` (no prior state to transition from). Deliberately
**not** mapped: `processing`/`packed` (internal warehouse states with no
customer-facing message in the spec's own example set),
`on_hold`/`expired`/`returned_to_sender`/`returned_to_warehouse`/`completed`
(not reached by anything that calls `transition()` with an established
customer-notification need yet). `return_requested`/`return_approved`/
`refund_processed` are documented as real gaps below, not silently
dropped — adding any of these later is a one-line map entry plus, for the
return/refund ones, a call into `NotificationsService.enqueue()` from
`ReturnsService`/`OrdersLifecycleService`'s refund-creation path, not a new
mechanism.

**Decision — the SMS length counter (§6.11) approximates GSM 03.38, not a
byte-exact implementation.** `estimateSmsLength` (`packages/shared/src/notifications/sms-length.ts`)
checks every character against the GSM-7 *basic* charset (one septet each)
and falls back to UCS-2 (unicode, 70/67-char limits) otherwise — it does not
model the handful of GSM 03.38 *extended*-charset Latin symbols that cost
two septets apiece (`{`, `}`, `€`, …), since none of those appear in
Bangla/English commerce copy and modeling them precisely adds real
complexity for no practical benefit here. The estimated cost shown in the
template editor (`notifications.smsCostPerSegmentPoisha` setting, default 50
poisha) is explicitly labeled an estimate — real gateway billing varies.

**Decision — quiet hours and marketing opt-out have real settings
(`notifications.quietHoursEnabled/Start/End`) and a real data model
(`Customer.marketingConsentSms/Email/Whatsapp`, already built in M5) but no
enforcement point yet.** Every M7 event is transactional (order placed,
confirmed, OTP, …) — §6.11's own text scopes quiet hours/opt-out to
*marketing* messages, and no marketing-broadcast feature exists before M8's
campaigns. Wiring enforcement in now, against zero marketing-flagged
events, would be guessing at a design M8 should actually drive. Recorded
here so this isn't mistaken for a forgotten requirement.

**Decision — the admin Notifications screen is three tabs (templates,
channel matrix, logs) in one page, matching the established "simple,
functionally-complete MVP" pattern (M1's settings-ergonomics, M2's category
tree, M5's payment-rules JSON editor).** The channel-matrix editor reorders
with up/down buttons, not drag-and-drop; the template editor is plain
bn/en textareas per channel, not a rich-text/variable-autocomplete editor.
Both are fully functional (every event/channel is admin-editable, the
fallback order is admin-editable) with reduced ergonomics, the same
trade-off this project has made repeatedly rather than a new one.

**Bugfix, unrelated to this milestone's own scope — `courier-mock.test.ts`
(M6) called `driver.createParcel()` with no arguments, but
`CourierDriver.createParcel(input: CourierParcelInput)` requires one.**
This compiled under M6 only because nothing had run `tsc --noEmit` on
`@clothing/shared` with this exact combination since; discovered because
this milestone's own `pnpm --filter @clothing/shared typecheck` run
surfaced it. Fixed by giving the test a minimal fixture `CourierParcelInput`
— a pure test bug, no production code changed.

**Not verified in this environment** (same root cause as every milestone so
far — no Docker/live Postgres): the actual dispatch sweep running against a
real Postgres (`NotificationLog` row lifecycle, backoff timing, the
fallback-channel creation) is unit-tested against a mocked Prisma client,
not exercised live. SSL Wireless, BulkSMSBD, Brevo, Resend, and the
WhatsApp Cloud API driver are implemented against each provider's publicly
documented (or, for the two SMS gateways, community-documented) API shape
with no live account to verify against — same caveat as every real driver
added since M5. The full acceptance scenario (place → confirm → ship →
deliver an order in a real browser, watch `notification_logs` fill in,
switch an event's channel order in the admin UI, see the next send honor
it) was boot-tested for wiring/routing/DI correctness (every new route maps,
returns the right 401/400, the real API dev server resolves the full
module graph with the new `NotificationsModule` wired into `CheckoutModule`/
`OrdersLifecycleModule`/`CustomerAuthModule`) and the admin page renders
(`/notifications` and `/en/notifications` both 200 against the real `next
dev` server) but not click-tested end to end against seeded data — no
database available here to seed. `pnpm build`'s pre-existing static-export
failure (flagged in M6) persists, unrelated to this milestone (reproduces
on `/_global-error` and a different "collateral" page each run — this time
`/bn/integrations`/`/bn/returns` — exactly the pattern already documented
there).
