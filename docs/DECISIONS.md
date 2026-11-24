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

---

## 2026-11-05 — Milestone 8: marketing basics, customers, reviews, tracking, reports

**Context.** §16 M8: discounts & coupons full UI (§5.8 types except
loyalty/gift cards), bulk unique codes, margin guard, flash sales UI;
customers list/profile/tags/segments (rule builder); reviews & moderation
with photo reviews and fit feedback; Meta Pixel + CAPI, GA4 + MP, GTM,
TikTok with dedup and event log; product feeds; dashboard KPIs; core
reports (sales, products, courier, staff, discounts, search terms) with
export. Acceptance: a purchase produces client and server Purchase events
sharing one `event_id` (verified in the event log); feeds validate against
the platforms' required fields.

**Decision — "5.8 types except loyalty/gift cards" is read as completing
the admin UI for the value types M5's engine already implements
(percent/fixed/free_shipping), not as adding `buy_x_get_y`/`bundle_price`/
`tiered` to the pricing engine this milestone.** Those three are genuinely
new pricing algorithms (`CartPricingService`/`discount-math.ts` would each
need a new branch, not just a new form field), and building three new
algorithms would have come at the direct expense of the other five M8
areas (customers, reviews, tracking, feeds, reports) — none of which are
optional line items in the same milestone. Bulk unique codes
(`DiscountCode`, a new table + `generateBulkCodes`/`listBulkCodes`/
`usageReport` on `DiscountsService`) and margin guard (already fully built
in M5 as `pricing.marginGuard.*` settings — the generated Settings page
already exposes it, so this needed zero new work) are both real and
complete. Recorded here as a deliberate scope trim, not a silent gap.

**Decision — customer segments have no materialized membership table.**
`Segment.rules` is a small typed condition tree
(`apps/api/src/customers/segment-rules.ts`) evaluated into a
`Prisma.CustomerWhereInput` at read time — the exact same pattern
`collections/collection-rules.ts` (M2) already established for automatic
collections, just pointed at `Customer` instead of `Product`. A segment's
member list and count are always computed live; `memberCountCache` is a
last-computed convenience for the list screen (refreshed on create/update),
never the source of truth. This means there is nothing to keep in sync when
a customer's stats change — the alternative (a join table maintained by
triggers or recompute sweeps) is real complexity this milestone's
acceptance scenario doesn't call for.

**Decision — the admin customers list's "risk" filter is a raw
`minRiskScore` number, not a low/medium/high enum.** §6.6's risk levels are
derived from `risk.thresholds`, a *setting* (admin-configurable
low/medium cutoffs), not a fixed mapping — duplicating that threshold
lookup into the customers-list filter would mean two places could disagree
about what "high risk" means. A numeric floor needs no such duplication.

**Decision — "merge duplicates" (customers) reuses M5's
`mergeGoogleOnlyIntoPhoneCustomer` logic generalized to admin-chosen ids,
rather than being a new mechanism.** The move-everything-then-soft-delete
transaction doesn't care *why* two rows are the same person; only the
caller differs (an auth flow discovering a Google/phone duplicate vs. a
staff member spotting one in the admin UI). `CustomersAdminService.merge()`
additionally moves `Review` rows, which didn't exist when the M5 version
was written.

**Decision — reviews are a verified-purchase-gated, per-order-item
submission, and the storefront submission form lives on the account's
order page, not the PDP.** The PDP has no way to know *which* of the
customer's orders/items correspond to the product being viewed without an
extra lookup; the account's own `/store/orders/mine/:id` already returns
the order's items with their ids, which `order_item_id` (the verified-
purchase check) needs directly. The PDP instead gets a full review
*display* (`ProductReviews` — list, helpful count, photos, admin replies,
fit-feedback badges) and the Q&A section, both already complete.
`Product.ratingAvg`/`ratingCount` (built M2) are recomputed from approved
reviews only, on every moderation decision and on auto-approve
(`ReviewsService.recomputeProductRating`) — a full recompute, not an
incremental running average, since per-product review volume never
approaches a scale where that matters.

**Decision — review photo uploads go straight through the `StorageDriver`
injection token, not the full media library.** A customer-submitted review
photo has none of the things the media library exists for (folders, usage
tracking across catalog entities, focal points, multi-size variants) — it's
one URL stored directly on `Review.mediaUrls`. `STORAGE_DRIVER` is
`@Global()` (M1), so `StoreReviewsService` injects it directly with no new
module wiring. Orphaned files from an abandoned review draft are an
accepted, documented trade-off (same category as M1's "verified copy" scope
line for the Cloudinary migration job) — nothing references them, so they
just sit in storage.

**Decision — the three new provider drivers (`meta_capi`, `ga4_mp`,
`tiktok_events`) share one new `tracking` capability, and several can be
active at once** (Meta + GA4 + TikTok side by side) — the same
"no single active one" shape `CourierProvidersService` (M6) already
established for couriers, not `ProviderRegistryService.findActiveInstance`'s
single-winner pattern used by sms/email/whatsapp. Each driver hashes
whatever PII its own platform requires (SHA-256 lowercase for Meta/TikTok's
phone/email) at the request boundary, never the caller. None are verified
against a live ad account in this environment — same caveat as every real
driver added since M5.

**Bugfix, discovered while wiring the `tracking` capability's admin
config, not scoped to this milestone — the admin Integrations page's
`CAPABILITIES` tab list was never extended past M1's
`["storage","email","sms"]`.** `payment`/`courier`/`captcha`/`fraud_check`
(M5/M6) and `whatsapp` (M7) each got a real driver catalog and a working
generic CRUD API, but no tab ever existed to reach them from — the
create/edit form itself needed zero capability-specific code (confirmed by
reading it), so this was purely a missing array entry, not a deeper gap.
Fixed by listing every capability with a real driver catalog today,
`tracking` included. Flagged here with the same weight as a test bug fix
in a prior milestone (see M7's `courier-mock.test.ts` entry) — a real,
previously-unnoticed gap across three milestones, now closed in one line.

**Decision — the server-side Purchase event's dispatch timing
(`tracking.purchaseEventTiming`, placement vs. confirmation) is read at
exactly the two points that already exist for this: `CheckoutService.
placeOrder()` (placement) and `OrdersLifecycleService.transition()`'s
`confirmed` branch (confirmation) — mirroring how M7's notification hooks
are wired into the same two call sites. The client/server `event_id` link
is `Order.trackingEventId`, a new column set once at placement (client-
generated via `crypto.randomUUID()` in `checkout-view.tsx`, or server-
generated if the client didn't send one — e.g. tracking scripts never
loaded) and read again at confirmation time if that's when the setting
says to fire. Added to the schema *before* generating this milestone's
migration, same "no live DB has ever run the column-less version" reasoning
as M7's `NotificationLog.contacts` addition.

**Decision — `TrackingEventLog.driver` is a free-text string, not an
enum**, deliberately not mirroring `NotificationLog`'s channel-rule
pattern 1:1. A notification channel maps to exactly one concept
(sms/email/whatsapp); a tracking provider instance's *driver* can be
`mock`, `meta_capi`, `ga4_mp`, or `tiktok_events`, and nothing about the row
itself should force "which platform" into a fixed three-value enum when a
merchant could plausibly run two differently-configured Meta pixels (e.g.
test vs. live) side by side. This is the same "string, not enum" choice
`NotificationLog.driver` already made, applied consistently here instead
of the narrower `TrackingProvider` enum the schema briefly had before this
decision (changed pre-migration, never shipped).

**Decision — the tracking dispatch sweep retries in place (incrementing
`attempts`, same row) rather than scheduling a specific backoff delay the
way M7's notification sweep does.** There is no fallback-channel chain here
— each provider instance is independent, not a fallback order — and
tracking delivery is best-effort (nobody is waiting on it the way a
customer waits on an SMS), so the embedded sweep's own 60s tick cadence is
already enough spacing between attempts. Capped at 5 attempts, same number
M7 used, for consistency rather than a different reasoned number.

**Decision — product feeds are generated entirely on demand, not by a
background job**, despite §10.5 saying "generated by a job (and on
demand)". A free-tier, single-merchant catalog's feed XML is cheap enough
to build per request (confirmed by not needing pagination or streaming in
`FeedsService.buildXml()`); pre-generating and caching it is an optimization
for catalogs large enough that it matters, which this milestone has no way
to size against. The on-demand half of that bullet is real and complete;
the job half is deferred, not silently dropped.

**Decision — Meta's catalog feed and Google Merchant's feed are served
from the same XML builder** (`feed-xml.ts`) — both platforms publish the
same Google-Shopping-style RSS 2.0 + `g:` namespace format as an accepted
input, confirmed independently for each platform's own docs, not assumed.
One `FeedItem` per *variant* (not per product), with `item_group_id` set to
the parent product id, per §10.5's own instruction. Feed availability
checks the real `inventory_levels.available` sum across locations — not
`Product.status` alone — matching the same "don't fake data" standard
every report in this milestone follows.

**Decision — `feeds.secretToken` is *not* marked `secret: true`** despite
being a credential-shaped value, breaking from the pattern every other
secret setting in this project follows (e.g. `auth.googleClientSecret`,
write-only and masked on read). Staff need to see this value — not just
set it once — to paste it into Meta's or Google's own feed-URL
configuration field; the usual masking would make the one thing this
setting exists for impossible. `public: false` still keeps it out of the
storefront's own `GET /store/config` payload, which is the protection that
actually matters here.

**Decision — the admin Dashboard's "conversion rate" and "new vs
returning" KPIs are documented approximations, not exact figures.**
Conversion rate divides orders by distinct anonymous visitors seen in
`analytics_events` over the same window — no funnel/session table exists
to compute a real "visited → ordered" rate, and M4's first-party events are
the closest proxy available. "New vs returning" classifies by the
customer's *current* `ordersCount` (`<= 1` vs `> 1`) rather than what it
was at the moment of each order in the range, since no event-sourced order
history exists to answer that exactly. Both are called out directly in
`DashboardService`'s own doc comment, not just here, so a future reader
hits the caveat before trusting the number.

**Decision — every report (sales/products/courier/staff/discounts/
search-terms) buckets or groups in JS after one range-bounded Prisma fetch,
not via raw SQL `date_trunc`/window functions.** Admin report volumes
(order counts per merchant per month) are small enough that this is never
a real cost in practice, and it avoids introducing the one raw-SQL code
path in a codebase where every other query goes through Prisma's typed
query builder — a second, untested code path for exactly one feature isn't
worth the risk it carries for a correctness-sensitive feature like
financial reporting. CSV export (`toCsv`, `reports/csv.ts`) is a from-
scratch ~20-line RFC 4180 writer, not a dependency — the format is simple
enough, and every other "no bespoke X" exception in this project (AWS SDK,
`xlsx`) was for something genuinely complex to reimplement; CSV isn't.

**Decision — search-term analytics (needed for the "search terms (top,
zero-result)" report) didn't exist before this milestone and was added as
part of it**, not treated as a prerequisite gap to fix separately: the
storefront's `/search` page now fires a `trackEvent("search", {term,
resultCount})` via a new `SearchAnalyticsTracker` client component (the
same no-UI "tracker" pattern `RecentlyViewedTracker`/`PurchaseTracker`
already use), landing in the same `analytics_events` table M4 built.
`ReportsService.searchTerms()` reads it directly — no new table needed.

**Decision — tracking scripts (GTM/Meta/GA4/TikTok) load via `next/script`
with `strategy="afterInteractive"`, and simply don't load at all when
`features.cookieConsent` (M3) is on** — not "load after a real accept
click," because no consent *banner* component exists yet to produce that
click (M3 flagged the setting; the banner itself was never built, see that
milestone's own "known issues"). Failing closed (no scripts at all under
consent-required mode, rather than loading without a genuine signal) is the
only honest option available until a real banner exists; documented here
directly since it materially changes what "enabling cookie consent" does
to tracking, which isn't obvious from the setting's own M3-era description.

**Not verified in this environment** (same root cause as every milestone
so far — no Docker/live Postgres): the actual dispatch sweep, dashboard
KPIs, and every report were exercised against their own pure logic (unit
tests) or boot-tested for route-wiring/DI correctness (the real API dev
server resolves the full module graph with `TrackingModule`/`FeedsModule`/
`DashboardModule`/`ReportsModule`/the extended `CustomersModule`/
`ReviewsModule`/`ProductQuestionsModule` all wired in; every new route
curled against it returns the correct 401/500-with-real-Prisma-error, never
a code-bug crash) but never run against real seeded data. The admin's nine
new pages (`/discounts`, `/flash-sales`, `/customers[/:id]`, `/segments`,
`/reviews`, `/product-questions`, `/reports`, `/feeds`) and the storefront's
new PDP reviews/Q&A sections, search tracking, and checkout-success
Purchase event were boot-tested (every route returns 200 against a real
`next dev` server, no runtime crash) but not click-tested against seeded
data — no database available here to seed it with. The three real tracking
drivers and the two feed endpoints are implemented against each platform's
own published XML/API shape, not verified against a live Meta/Google/
TikTok account. `pnpm build`'s pre-existing static-export failure (flagged
in M6, unrelated to this milestone) still reproduces on the storefront app
this time (collateral page `/en/checkout`), matching the exact
already-documented pattern.

## 2026-11-06 — Milestone 9

**Context**: M9 is "hardening and launch readiness" — full test suites
(§14), E2E, a security review against §12, a performance pass against
§13.1, an accessibility pass, demo seed polish, `docs/ADMIN_GUIDE.md`,
`docs/DEPLOYMENT.md`, and a launch-checklist admin page, closing out
Phase 1. Three parallel audit forks (security/§12, performance+
accessibility/§13, test-coverage/§14) surveyed the existing codebase
first; everything below responds to a real, cited finding from one of
those, not a guess.

**Security (§12), what was fixed**:
- 2FA was optional (`totpEnabled` only gated the *login* TOTP challenge,
  not route access). Decision: `StaffAuthGuard` now blocks every route
  except `/auth/{me,logout,totp/setup,totp/confirm}` (a new
  `@SkipTotpEnforcement()` decorator marks the exemption) for a staff
  account with `totpEnabled: false` — mandatory, not optional, enforced
  structurally rather than by convention. Alternative considered: a
  separate pre-session "setup token" issued at login instead of a real
  session. Rejected — it would have meant building a second, parallel
  auth-token mechanism next to the real session one for no behavioral
  difference (the existing `totp/setup`+`totp/confirm` endpoints already
  required an authenticated session, so reusing that mechanism and
  gating *other* routes was the smaller, more consistent change). The
  admin app gained a forced `/totp-setup` page the dashboard layout
  redirects to whenever `staff.totpEnabled === false`.
- Password policy: the DTO only enforced `min(10)`; the *admin-configurable*
  `security.passwordMinLength` setting (already existed, default 10, but
  nothing actually read it). Decision: lowered the DTO's static floor to
  `min(8)` (the setting's own allowed minimum) and added a real runtime
  check in `StaffUsersService`/`SetupService` that reads the setting and
  rejects anything shorter — the setting now actually does something,
  default bumped to 12 to match the spec's own stated policy.
- No login rate limit/lockout at all. Decision: `StaffUser` gained
  `failedLoginAttempts`/`lockedUntil`; two new settings
  (`security.loginMaxAttempts` default 5, `security.loginLockoutMinutes`
  default 15) control the thresholds.
- Session timeout was absolute-only (`security.staffSessionTtlHours`), no
  idle timeout, no "log out all sessions". Decision: added
  `StaffSession.lastSeenAt` (bumped on every validated request) + a new
  `security.staffSessionIdleMinutes` setting (default 60) checked
  alongside the absolute expiry; added `SessionService.revokeAllSessions`
  + `POST /auth/logout-all` + a "log out everywhere" button in the admin
  shell.
- No CSP/HSTS/security headers anywhere. Decision: admin's CSP is static
  (`next.config.mjs` `headers()` — admin renders zero inline scripts, so
  no nonce complexity is needed there); the API got the simple headers
  (HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) via
  an Express middleware in `main.ts`, no CSP (it's a JSON API, not an
  HTML-rendering surface — the real CSP lives in the two apps that
  render HTML). **Storefront's CSP was originally designed nonce-based**
  (a `middleware.ts` generating a per-request nonce, threaded to
  `tracking-scripts.tsx`'s inline `<Script>` tags via an `x-nonce`
  header) — this **broke the production build outright**: Next.js 16
  renamed `middleware.ts` to `proxy.ts`, and the storefront already had
  one (`next-intl`'s own locale-routing proxy), so the two files
  conflicted (`pnpm build` refused to start at all, a real, newly-caused
  bug fixed by merging the CSP header logic into the existing
  `proxy.ts`). Once merged, threading a nonce through next-intl's
  `createMiddleware()` return value turned out not to be possible without
  rebuilding next-intl's own request-forwarding internals (its middleware
  already returns a fully-built `NextResponse`; this file can only add
  response headers to it, not rebuild its `NextResponse.next({request:
  {headers}})` request-forwarding). Decision: dropped the nonce, used
  `'unsafe-inline'` on `script-src` instead, scoped by a tight static
  host allow-list (exactly the four tracking platforms
  `tracking-scripts.tsx` can ever render — GTM/Meta/GA4/TikTok, `'strict-
  dynamic'` for GTM's own dynamic tag injection) plus `frame-ancestors`
  allowing the admin's own origin (for the page builder's live-preview
  iframe). A real nonce is still the better answer for whoever revisits
  this with time to either drop next-intl's own middleware and
  reimplement locale routing here, or find/request composition support
  from next-intl for exactly this.
- No MIME sniffing on file uploads, no SVG rejection. Decision: added
  `apps/api/src/media/media-sniff.ts` (magic-byte signatures for
  JPEG/PNG/GIF/WebP; anything that looks like SVG/HTML/XML by its first
  ~1KB is refused outright, regardless of claimed MIME type — no
  sanitizer exists for it) and wired it into both real upload paths:
  `MediaService.upload` (staff-only) and `StoreReviewsService.uploadPhoto`
  (the one *unauthenticated* upload surface in the app — a shopper with a
  delivered order can hit it, making it the higher-priority of the two;
  the stored file's extension is now derived from the sniffed real MIME
  type, not the client-supplied filename).
- No SSRF protection on admin-configured URLs. Decision: added
  `packages/shared/src/providers/ssrf-guard.ts` (resolves the hostname
  and checks the *resolved* address against private/reserved ranges —
  catches DNS rebinding, not just a literal `127.0.0.1` in the URL) and
  applied it to `sms-generic-http.ts` specifically — the one driver
  whose whole point is fetching an admin-typed arbitrary URL. The other
  drivers hit vendor-fixed endpoints (a `baseUrl` override field with a
  sane default, not a "paste any URL" feature), so they're a much lower
  SSRF risk and out of scope here.
- Courier webhooks had zero signature verification (a documented gap
  since M6: "no signature verification yet either — add it per-driver
  before going live"). Decision: rather than invent an HMAC scheme
  against docs that were never confirmed against a live sandbox (same
  root cause already accepted for these three drivers since M5/M6), added
  an optional `webhookSecret` to each real courier driver's config and a
  shared-secret `X-Webhook-Secret` header check in
  `ShipmentsWebhookController`, looked up via the shipment's own
  `courierProviderInstanceId` (more precise than guessing "the" instance
  for a driver name, since courier is a multi-instance-active
  capability). Unset secret (sandbox/dev default) still lets requests
  through, matching every other "mock-friendly, hardenable later"
  pattern in this codebase.
- No customer data export/deletion action (§12 "customer data export and
  deletion on request"). Decision: added `customers.privacy` (a
  permission distinct from `customers.manage`, so a store can grant
  ordinary staff customer management without privacy/export rights) with
  two new `CustomersAdminService` methods: `exportData` (a JSON bundle,
  audit-logged as a sensitive read) and `anonymize` (scrubs the
  customer's own PII plus every one of their orders' embedded contact
  JSON — `billingContact`/`shippingAddress`/`ip`/`userAgent`/`deviceId` —
  while leaving order totals/items/status alone, since §12 explicitly
  wants orders "anonymized, not deleted, for accounting"; `deletedAt`
  doubles as the "this identity no longer exists" marker, same convention
  `merge()` already used).
- Report CSV exports weren't audit-logged (§12 "sensitive reads ...
  exports"). Decision: `ReportsController`'s shared `respond()` helper
  now records an audit entry (actor, report name, date range, row count)
  whenever `?format=csv` is used; viewing the same numbers on-screen
  isn't logged, only the download.
- No dependency scanning. Decision: `.github/dependabot.yml` (npm +
  github-actions + docker ecosystems, weekly) plus a `pnpm audit
  --audit-level=high` CI step. Deliberately **non-blocking**
  (`|| true`) — an upstream transitive advisory nobody's had a chance to
  triage yet shouldn't block every PR; a human reviews the report.
- Admin IP allow-list (§12 "optional ... setting") didn't exist. Decision:
  `security.adminIpAllowlist` (comma-separated IPs/CIDR, empty =
  disabled) checked in `StaffAuthGuard` before the session cookie even —
  IPv4-only CIDR matching (`apps/api/src/common/ip-allowlist.ts`); IPv6
  entries only match literally, not by prefix, documented as a known
  limitation rather than a silent gap.
- Custom HTML/CSS/script-injection restriction (§12's last bullet) has no
  feature to restrict — no `customCss`/custom-tracking-snippet setting
  exists anywhere in the admin (checked: M3's theme settings don't have
  one either). Decision: left unbuilt. Building a brand-new raw-code-
  injection feature from scratch, this deep into a hardening milestone,
  is new scope the spec names as a *property of a feature*, not a
  feature to build — when/if a future milestone adds one, gate it by a
  Super-Admin-only permission and audit-log it from day one, per this
  bullet.

**Security, considered and explicitly deferred**:
- A full `next/image` migration (srcset/blur placeholders — the
  performance-audit finding that plain `<img>` is used everywhere, custom
  `mediaImageLoader` unused) needs every image-bearing API response
  (`ProductCard.imageUrl: string`, etc.) to carry a full `MediaRef`
  object (provider/variants/dimensions) instead of a flat URL string —
  a cross-cutting API-shape change touching catalog, search, cart,
  reviews DTOs on top of 7 storefront components, with no way to verify
  the rendered result in a browser here. Deferred rather than risk a
  half-correct migration; the two highest-LCP-impact surfaces (PDP
  gallery, category/search grid) are the right place to start whenever
  someone can verify it live.
- Coverage gating (§14 "coverage target ≥ 80% for domain folders"):
  measured `apps/api`'s real coverage at ~61% statements/51% branches.
  The 80%-for-"domain"-folders target assumes a domain/infrastructure
  split this codebase's folder structure doesn't have (folders are
  per-feature — `discounts/`, `returns/`, `inventory/` — not separated
  into "pure business rule" vs. "Prisma-orchestration service" layers).
  Every specific business rule §14's own table names (money math, phone
  normalization, pricing pipeline, discount eligibility, shipping fee
  calc, payment rules engine, risk scoring, order state machine, return
  eligibility, localized text fallback, settings registry validation)
  already has a dedicated, well-tested pure-logic file (`discount-
  math.ts` ~93%, `shipping-calc.ts` ~89%, `risk-score.ts` ~90%, `payment-
  rules-engine.ts` ~73%, etc.) — the low overall number comes from
  thinner Prisma-orchestration service/controller code the spec's table
  doesn't actually name. Decision: `test:coverage` scripts + a CI
  artifact upload exist (informational), no hard-fail threshold yet.
  Enforcing one correctly would mean either curating an explicit
  per-file include list of just the true domain-rule files (arbitrary
  and a maintenance burden) or retrofitting service-layer tests across
  9 milestones of code (multi-day, far beyond this milestone's budget) —
  recorded here as a real, named gap rather than silently declared "done".

**Performance (§13.1)**:
- `Order`/`Shipment` had no `@@index([createdAt])` despite every report
  and the dashboard filtering/grouping by a `createdAt` range on every
  call. Added both (new migration).
- Facet counts were computed fresh on every listing request despite the
  spec naming "facet counts cached per category" as a technique. Added
  an in-memory cache (`CacheService`, 60s TTL, keyed by
  category/collection/tag id) around `StoreCatalogService`'s facet
  computation — a short TTL rather than wiring precise invalidation into
  every place a product's price/attributes/stock can change, consistent
  with this cache's own "lost on restart, single-process" free-tier
  philosophy.
- `infra/loadtest/browse-cart-checkout.js` (k6, browse+search+cart+COD
  checkout mix, §13.1's own p95 thresholds as k6 thresholds) is written
  but not run — no k6 binary and nothing to point it at here, same
  limitation as every other "not verified in this environment" item.
- Third-party tracking script deferral (`afterInteractive`, not idle/
  interaction-gated) and the full `next/image` migration were both
  looked at and left as the M8/M9 trims they already were — see "Security,
  considered and explicitly deferred" above for the image one; the
  script-deferral one still has no settings-driven timing knob, same
  trim M8 already recorded.

**Accessibility**: an automated sweep (not exhaustive) found one real
unlabeled icon-only button (`orders/new/page.tsx`'s line-item remove "×")
and fixed it with a new `common.remove` i18n key; every other icon-only
control checked already had a real accessible name (via adjacent text or
an existing `aria-label`). `@axe-core/playwright` is wired into both new
E2E specs (see below) rather than run as a separate manual pass — a real
browser is needed for a real axe scan, which this sandbox doesn't have.

**Testing (§14)**:
- Integration tests (Supertest + real Postgres), E2E (Playwright), and
  `packages/db/factories` were *entirely* greenfield before this
  milestone — confirmed by audit: `test:integration` was still M0's
  placeholder `echo`, `e2e/tests/` was one `test.skip`, no `factories`
  directory existed. Built: a scoped factory module (staff user,
  customer, category, product+variant+stock, stock location — not every
  model, just what the integration/E2E specs below actually need); a
  real `apps/api/test/setup.ts` harness (boots the real `AppModule` via
  `Test.createTestingModule`, same wiring `main.ts` uses); three
  integration spec files (auth/mandatory-2FA/RBAC/login-lockout; the
  concurrent-last-unit-purchase race — M5's own acceptance line, never
  actually run before now; courier webhook secret verification); two
  Playwright specs (storefront guest COD checkout with browse→PDP→cart→
  checkout→success→track, using response interception to capture the
  order number since the success page doesn't surface it for a "track
  it now" link — a real, separate UX gap recorded here, not fixed, since
  fixing it is a product decision about what the success page should
  show, not a hardening task; and the admin Super-Admin setup→forced-
  2FA→re-login flow, computing real TOTP codes from the `otpauthUrl` the
  API returns rather than trying to read the QR code image).
- None of this can actually run here (no live Postgres, no browser) — it
  was still verified as far as this sandbox allows: `pnpm test:integration`
  reaches real Prisma queries inside the test bodies and fails with
  exactly one error, `PrismaClientInitializationError: Can't reach
  database server`, on all 8 tests across all 3 files — meaning the full
  `AppModule` DI graph, every import, and every query's syntax are
  correct; only a live database is missing. The two E2E spec files
  typecheck and lint clean (`e2e/` gained its own `tsconfig.json`/
  `eslint.config.cjs` — it had neither before, so `pnpm typecheck`/`pnpm
  lint` were silently skipping it entirely).
- CI (`.github/workflows/ci.yml`) gained `dependency-audit`,
  `integration-tests` (real Postgres 16 service container, migrate+seed
  then `pnpm test:integration`), and `e2e` (Postgres + demo seed + all
  three apps started for real, Playwright smoke — tests tagged
  `@smoke` — on PRs to `main`, the full suite nightly via a cron
  trigger) jobs, plus coverage-artifact upload on the existing `build`
  job.
- A missing unit test the audit specifically flagged (return eligibility
  — §14 names it, `ReturnsService` had zero tests) was added
  (`returns.service.spec.ts`, the delivered-status/window/type/quantity/
  exchange-variant gates in `createRequest`).

**Demo seed (§16 M9 "demo seed polish")**: there was nothing to polish —
`seedDemoBrand()`'s own comment said demo catalog/pages/menus/orders were
"not implemented yet" despite M2–M8 all shipping the features that would
need them. Built a small `seedDemoCatalog()` (2 categories, 4 products —
one with real S/M/L size options, the rest free-size, one deliberately
low-stock to exercise the dashboard alert — real stock at the default
location): enough for the E2E journeys above and a screenshot-ready
storefront, deliberately not a realistic full catalog. CMS pages/menus/
demo orders are still unseeded — nothing in `e2e/` or the launch checklist
needs them, unlike the catalog.

**`pnpm build`'s pre-existing static-export crash** (flagged M4/M6,
re-investigated here since M9's own acceptance line is "all CI checks
green"): confirmed it is **not** fixable by any change made this
milestone. Reproduces identically — `TypeError: Cannot read properties of
null (reading 'useContext')` prerendering `/_global-error` plus one other,
different-every-run page (e.g. `/en/checkout`, `/bn/orders`+`/en/
discounts`+`/en/segments` in one admin run) — across: Turbopack vs.
`--webpack`; Next 16.4.2 vs. 16.4.5 (upgraded regardless, since it's a
legitimate patch bump even though it didn't fix this); `experimental.
serverMinification: false` alone (no effect); `experimental.
prerenderEarlyExit: false` (made things *worse* — 30 pages failed with a
different error instead of 2). The one thing that **does** avoid it —
`next build --debug-prerender` — is explicitly documented by Next.js as
unsafe for production use, so it's not a real fix, just the clearest
signal yet that this is a genuine upstream Next.js 16.4.x production
static-generation-worker bug (the pervasive "each child in a list should
have a unique key" warnings on Next's *own* internal elements — `<head>`,
`<meta>`, `<__next_viewport_boundary__>` — during every build, success or
failure, point the same way: something inside Next's own rendering
machinery, not this project's application code, which never touches
those elements directly). Recorded here as confirmed-not-app-code rather
than re-deferred with the same vague note a fourth time; CI's `build` and
`e2e` jobs will go red on this until an upstream fix lands or someone can
attach a debugger to the actual worker process, neither of which was
possible in this sandbox. **Separately, and already fixed**: this
investigation surfaced a real, newly-introduced bug of this milestone's
own making — adding `apps/storefront/middleware.ts` for CSP conflicted
with the `proxy.ts` the app already had for next-intl's locale routing
(Next 16 renamed `middleware.ts` → `proxy.ts`; having both is a hard
build error, not the pre-existing crash above). Fixed by merging the CSP
logic into the existing `proxy.ts` instead of adding a second file.

**Launch checklist** (§16 M9): built as a computed page, not a plain
checkbox list — every item queries real state (policy pages with
`needsContent: true`, a non-mock enabled provider per capability, a
`TrackingEventLog` row with `status: "sent"`, active staff with
`totpEnabled: false`, a `ops.lastBackupAt` setting fresher than 48h)
except "sitemap submitted" (no system signal exists for that one — a
plain settings-backed toggle the owner flips themselves). "Backups
running" needed something to report success back to the app, so a
`POST /public/cron/backup-heartbeat` endpoint (same `CRON_SECRET` pattern
as the existing cron endpoint) was added, called by both the new
`.github/workflows/backup.yml` (free mode) and an upgraded
`infra/scripts/backup-cron.sh` (VPS sidecar — previously local-only, now
uploads to R2 and prunes anything older than 30 days too, closing out a
TODO that had been sitting in that script since M0). Backup credentials
(`R2_ACCOUNT_ID`/`R2_BUCKET`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`)
are deliberately separate env vars from `STORAGE_DRIVER`'s `S3_*` ones,
even when pointed at the same R2 account — a token scoped to only the
backup bucket can't also touch live media storage if it ever leaks, and
vice versa.

**`pnpm test` vs. `pnpm e2e`**: `e2e/package.json`'s `"test"` script
(`playwright test`) existed since M0, but it only ever ran one
`test.skip` placeholder, so root `pnpm test` (`turbo run test`, which
matches *any* package with a `test` script) silently included it at zero
cost. Adding real spec files this milestone turned that into root
`pnpm test` launching a real browser against `localhost:3000`/`3001` and
failing with connection-refused whenever those apps aren't already
running — contradicting `CLAUDE.md`'s own documented split (`pnpm test` =
unit tests, `pnpm e2e` = end-to-end). Fixed by excluding `e2e` from the
root script (`turbo run test --filter=!e2e`) rather than renaming its
own `test` script, since `pnpm e2e` is itself defined as `pnpm --filter
e2e test` and renaming would have broken that instead.

## 2026-11-08 — Milestone 10: conversion features

**Context.** §16 M10: size recommender + customer measurements,
shop-the-look bundles and lookbook hotspots block, abandoned-cart
recovery (SMS/WhatsApp/email sequence with optional coupon), preorders,
self-service exchange portal, Q&A (already shipped M8), storefront PWA +
web push, audience-targeted blocks, blog/lookbook. Acceptance (§16):
"each feature has its toggle, admin UI, tests, and guide entry" (the
Phase 2 umbrella acceptance line, since M10 itself names no single
end-to-end scenario the way M1–M9 each did).

**Decision — web push is deliberately outside the generic
provider-instance framework (golden rule 2).** Every other integration
(SMS/email/WhatsApp/payment/courier/tracking) is a *choice between real
vendors* behind one interface, with a mock driver standing in for all of
them. Web Push has no such choice: the browser's push service is
addressed directly via the W3C standard, authenticated by *our own*
VAPID keypair, not a vendor's API key. There is nothing to swap a
"driver" for. So `PushService` lives next to the settings registry
(`pwa.vapidPublicKey`/`vapidPrivateKey`, generated once via `POST
/admin/push/generate-vapid-keys`, never typed by hand) rather than as a
`provider_instances` row — the same reasoning already applied to the
SSRF guard and the app's own JWT/encryption secrets, which also aren't
"providers." It still plugs into the *existing* notification pipeline as
a 4th `NotificationChannel` (`push`), because that part — queued,
retried, logged, falling back to the next channel — has nothing to do
with vendor choice and everything to do with delivery reliability, which
push needs exactly as much as SMS does.

**Decision — `web-push` pinned to 3.6.7, not the 4.0.0 major that was on
npm the same day this was written.** Checked the registry directly
(same practice as every prior milestone's dependency additions): 4.0.0
had been published *the day before*, with no matching `@types/web-push`
release (still at 3.6.4, a v3-API-shaped `.d.ts`). A same-day major with
no matching types package is exactly the kind of "deviation from
latest" M0's own dependency-version review already established a
pattern for (TypeScript 7.0, Prisma 7/8) — pin to the last stable minor
in the line the types package actually describes, re-evaluate next
milestone that touches this dependency.

**Decision — bundle discounts are computed live in `CartPricingService`,
not as a new discount-engine value type.** M8 already deliberately
scoped `buy_x_get_y`/`bundle_price`/`tiered` out of the pricing engine
(see that milestone's own entry) because each is a genuinely new pricing
algorithm. A shop-the-look bundle needs exactly one of those shapes
("this exact set of components, together, at a different combined
price") — but routing it through `Discount`/`discount-math.ts` would
mean teaching that engine to recognize "is every required component
variant present in at least the required quantity," which is catalog
structure, not a discount condition vocabulary it already has a slot
for. Simpler and just as correct: `packages/shared/src/catalog/
bundle-pricing.ts`'s `matchBundles()` is pure cart-line-math (no Prisma,
no settings), called once per `price()` from `CartPricingService.
applyBundleDiscounts()`, mutating each matched line's `lineTotal`
*before* the discount engine ever sees it. A coupon and a bundle match
therefore just stack — the discount engine has no idea a bundle
discount already happened, and doesn't need to.

**Decision — a bundle `Product` is never itself a cart line; its
`BundleItem` rows name *exact* component variants, not "any variant of
this product."** A shop-the-look photo shows one specific outfit — the
red top in size M, not "a top, any color, any size." Requiring an exact
variant pick at bundle-authoring time (not at add-to-cart time) keeps
`CartPricingService`'s matching logic a simple "is this exact variant id
present in sufficient quantity" check, with no combinatorial "which of
the bundle's size options did the customer mean" resolution needed
anywhere. The trade-off: a bundle can't flex to "any size, matching
across all three pieces" — each size needs its own bundle `Product` if
that's wanted. Acceptable for a styled-look feature, which is inherently
about one specific combination anyway.

**Decision — preorders bypass the stock-sufficiency guard entirely
rather than reserving against a fake "preorder location."** §6.7's own
stock-reservation invariant ("`reserved += q` only commits when
`available >= q`, in one conditional UPDATE") is specifically about real,
finite on-hand stock racing under concurrent checkout — the exact thing
M5's "two buyers race for the last unit" acceptance scenario tests.
Preorder stock isn't finite in that sense; the only real limit (if any)
is `Product.preorderLimit`, a *sales count* cap, not an inventory count.
Modeling it as a second, infinite-capacity stock location would still
need every other inventory-aware code path (low-stock lists, barcode
labels, the storefront's "X in stock" copy) to specifically know to
ignore it — more surface area than the chosen approach:
`StockReservationService.reserve()` takes a per-line `allowNegative`
flag that skips the `available >= q` clause in the same raw SQL (still
one atomic UPDATE, still inside the order's own transaction — just
unconditional), and `CartPricingService`'s per-item loop computes a
preorder line's `available` from real non-cancelled order-item sales
against `preorderLimit` instead of querying `inventory_levels` at all.
A regular product's race-condition guarantee is completely untouched; a
preorder line simply never enters that code path.

**Decision — audience-targeted blocks gate client-side, not at the
page-cache layer.** The storefront's whole caching story (§3, free-tier
friendly — no mandatory Redis/CDN build step) depends on a page's HTML
being the same for every visitor until a revalidation tag fires (M3's
publishing pipeline). Personalizing a block's visibility by login state
or segment membership at *render* time would mean either personalizing
the entire page's cache key (defeating the point) or re-fetching the
whole page per viewer. `AudienceGate` instead wraps the block's
already-server-rendered output in a small client component that calls
`GET /store/audience/me` on mount and shows/hides — the page itself
stays one cached document; only blocks that actually declare a
non-`"all"` audience (`needsAudienceGate()`) pay this cost at all, and a
failed/slow check fails open (shows the block) rather than hiding
content over a network hiccup.

**Decision — `BlogService` deliberately has no edit-lock, autosave, or
version history, unlike `PagesService`.** All three exist in M3's pages
editor because CMS pages are the single highest-traffic admin surface
(every brand edits its homepage/policies constantly, often by more than
one staff member) — that's what justified building them. A blog/lookbook
post is lower-frequency, typically single-author content; duplicating
three more features' worth of machinery for it now would be the kind of
premature generalization the project's own working norms warn against.
If post volume or multi-author contention ever becomes real, the fix is
additive (the exact same mechanisms `PagesService` already has, pointed
at `BlogPost` instead of `Page`), not a redesign.

**Decision — the self-service exchange portal's M10 scope is "close the
guest-access gap M6 flagged," not "build the missing exchange-variant
picker."** M6's own progress notes named one specific, narrow gap: the
order-tracking page links out to login instead of also supporting
phone+order-number verification for a return/exchange request, the way
`OrdersController`'s track/cancel endpoints already do. That's exactly
what `ReturnsService.createByTracking()` + `POST /store/returns/track`
close — verified the identical way (`order.billingContact.phone ===`
the phone supplied). While building it, a *second*, deeper gap surfaced:
neither this new guest form nor the M6 account-area form actually lets a
customer pick a replacement variant, so `type: "exchange"` always fails
server-side validation (`EXCHANGE_VARIANT_REQUIRED`) on both paths. That
one needs a real product/variant search-and-pick UI — out of scope for
"close the flagged gap," recorded honestly in docs/PROGRESS.md rather
than silently left for someone to discover as a support ticket.

**Decision — `NotifyMeService.fulfillForVariant()` triggers off
`InventoryService.adjust()`'s own 0→positive `available` crossing, not a
scheduled sweep.** There's no cheap way to ask "which variants changed
stock status since the last tick" without either a sweep that scans
every variant's inventory level every run (wasteful at any real catalog
size) or a dedicated change-log table (real complexity for a
notification that's inherently tied to one specific mutation already
happening in one specific place). `adjust()` already knows the exact
before/after `available` for the exact row it just changed — checking
`level.available <= 0 && updated.available > 0` right there is free.
The trade-off: a stock import/bulk operation that doesn't go through
`InventoryService.adjust()` per row wouldn't fire this — not a path that
exists anywhere in the codebase today, so not a real gap yet.

**Decision — push notification "address" in the generic notification
pipeline is a customerId, not a device token.** Every other channel's
`contacts.<channel>` is literally what gets dialed/emailed; push doesn't
work that way — a customer can have several subscriptions (phone +
desktop), and the actual delivery targets live in `push_subscriptions`,
keyed by `customerId`. Rather than inventing a different shape for one
channel, `contacts.push` carries the customerId (set by whichever caller
already knows it, same as `recipientId`), and `PushService.sendRaw()`
looks up every subscription for that customer and sends to all of them,
treating "zero subscriptions" as a send failure like any other
unreachable channel — so the existing retry/fallback-to-next-channel
machinery (§6.11, M7) just works for push with no new branch. The
accepted gap: an anonymous (never-logged-in) PWA install has no
customerId to attach a subscription to, so it can subscribe but will
never receive anything through this generic pipeline — only a logged-in
customer's push actually fires today.

## 2026-11-11 — `inventory_levels.available` must not be written by Prisma

**Context.** The first run against a real Postgres (Neon) failed in `pnpm db:seed:demo` with
`428C9 cannot insert a non-DEFAULT value into column "available"`. The column is a
`GENERATED ALWAYS AS (on_hand - reserved) STORED` column (see the M2 migration), but
`schema.prisma` declared it as `Int @default(0)`, so Prisma's `create`/`upsert` sent an explicit `0`.
Every `inventoryLevel.create/upsert` (seed, `InventoryService.ensureLevelsForVariant`, catalog import)
was affected; earlier milestones had no live database, so it was never exercised.

**Decision.** Declare it `Int @default(dbgenerated())` so Prisma omits the column on insert and
Postgres computes it. No migration is needed (the DB column was already generated, with no default).

**Alternatives.** Making the field optional/removing it from the model and reading via raw SQL
(rejected: loses typed reads of `available` everywhere); using `Unsupported` (rejected: not readable).

## 2026-11-11 — M11: automation triggers go through a transactional outbox on `scheduled_tasks`

**Context.** Automation rules (and the placement built-ins: queue auto-assignment, self-confirmation request) must react to order state changes. Those changes happen inside caller-owned transactions (`OrdersLifecycleService.transition(…, tx)`, checkout placement), so running rules inline could read rows that later roll back, and a rule's own `set_status` action would re-enter the lifecycle service mid-transaction.

**Decision.** `AutomationOutboxService.enqueue(tx, trigger, orderId)` writes a `scheduled_tasks` row (`type: "automation.trigger"`) in the same transaction as the state change; the existing scheduler tick runs `AutomationEngineService.handle()` after commit. It lives in its own tiny module (`AutomationOutboxModule`) so lifecycle/checkout depend on it without depending on the engine (which depends on lifecycle). Cost: a rule fires up to one scheduler tick (60 s embedded, or the external-cron cadence) after the event — acceptable for confirmations/tags/assignment, and it keeps the free-tier "no Redis, no extra worker" rule. A per-rule/per-order loop guard (3 runs/hour, recorded as a `skipped` run) stops two rules from flipping an order back and forth. `order.placed` for an online-payment order fires from `onPaymentSucceeded`, not at placement, because until then it isn't a workable order.

**Alternatives.** In-process event emitter after commit (rejected: events lost on a crash between commit and emit, and the `tx`-passing callers have no "after commit" hook); a separate queue/worker (rejected by the free-tier rule).

## 2026-11-11 — M11: merge and split semantics

**Context.** §8.2 asks for merge/split orders but defines nothing. Orders carry stock reservations, coupon usages and money.

**Decision.** Only `pending`/`confirmed`/`on_hold` orders (nothing physical has happened). **Merge**: same customer account or same billing phone; absorbed orders must have `paidTotal = 0`; items, order discounts and coupon usages move to the survivor; the survivor keeps *its own* shipping fee (one parcel, one delivery charge); the absorbed orders are set to `cancelled` *directly* (not via `transition()`), with `mergedIntoOrderId` and `reservationReleasedAt` set, because the lifecycle's cancellation would release the stock that just moved and message the customer "your order was cancelled". **Split**: order must have no payment; chosen units move to a new `admin`-channel order in the same status (`splitFromOrderId`); the order-level discount is divided by subtotal share with the remainder staying, so both halves always sum to the original; the new order's delivery charge is staff-entered (default 0, since shipping was already charged). Stock reservations don't change (same variants/quantities). All arithmetic is in `merge-split-math.ts`, unit-tested. `Customer.ordersCount/totalSpent` are adjusted.

**Alternatives.** Splitting into several shipments of one order (`ShipmentItem` supports it, but it changes fulfillment, packing and COD reconciliation — left for a later fulfillment milestone; the new-order approach gets the same physical result today). Re-running the pricing pipeline on merge (rejected, same reasoning as `OrderEditService`: existing discounts are kept as-is).

## 2026-11-11 — M11: customer self-confirmation is a link, not a vendor-specific button

**Context.** §6.8 lists "SMS link / WhatsApp button". A WhatsApp interactive button needs a template pre-approved by Meta and a driver that supports interactive messages; golden rule 2 forbids depending on one vendor.

**Decision.** One new notification event, `order_confirmation_request`, carrying `{confirm_link}` (`/{locale}/confirm-order/{token}` on the storefront). It goes through the normal channel matrix (WhatsApp first, SMS fallback), so it works on every driver including mock. The token is 24 random bytes (192 bits), stored on the order, scoped to that one order, and can only move a `pending` order to `confirmed` (or `cancelled` when `orders.selfConfirm.allowCancel`). It expires after `orders.selfConfirm.expiryHours`; responding twice is idempotent. A WhatsApp driver that wants a real button can post the same `{action}` to the same endpoint. Off by default (`orders.selfConfirm.enabled`).

**Alternatives.** Short numeric reply codes ("reply 1 to confirm") — needs inbound-message plumbing no driver has yet.

## 2026-11-11 — M11: courier assignment rules reuse the automation condition model

**Decision.** `CourierAssignmentRule` stores the same `{match, rules[]}` JSON the automation builder edits, evaluated by the same pure `evaluateConditions` over the same `OrderContextService` field map, so "order.codAmount ≥ 10,000 ৳" means the same thing in both places and there is one builder component. Booking with `auto: true` picks the first active rule by priority and then goes through the normal driver path; no match is a clear `NO_COURIER_RULE_MATCH` error (no silent fallback to a random courier). Manual selection is unchanged.

## 2026-11-11 — M11: approvals replay the gated action; gating is setting-driven

**Context.** §5.10 defines `approval_requests` (type, entity, payload, requested_by, status, decided_by); §8.2 wants an inbox.

**Decision.** A gated action is **not executed**; its request payload is stored and the caller gets `{approvalRequired: true, approvalRequestId}`. An approver (`approvals.decide`, never the requester — four-eyes) approves → the stored payload is replayed through the same service method with `approved: true` as the requester; reject just records the note. Feature modules register an executor per `type` in `onModuleInit`, so `ApprovalsModule` depends on nothing. The decision is claimed with a guarded `updateMany` before replay so two approvers can't both run it; a replay that throws marks the request `failed` with the error. Two gates ship: order edits that override a unit price or the shipping fee (`approvals.priceOverride.required`, default off) and completing a refund above `approvals.refund.thresholdAmount` poisha (default 0 = off). `approvals.bypass` skips both. The order-edit page now only sends `shippingFeeOverride` when the fee actually changed (it used to send it every time, which would have triggered the gate on every edit).

**Alternatives.** Gating every mutation generically via an interceptor (rejected: replaying arbitrary HTTP bodies is unsafe; explicit per-feature executors are reviewable).

## 2026-11-11 — M11: field-level permissions are enforced behind a setting, default off

**Context.** §4/§11: "field-level permissions exist for sensitive fields (cost price, profit, customer full phone number)". Turning masking on by default would blank every phone number for the existing non-super-admin roles (e.g. call-centre) the moment this deploys.

**Decision.** New permissions `fields.customer_phone.read` and `fields.order_cost.read` (cost price also honours the existing `catalog.cost.read`). `security.fieldMasking.enabled` (default **false**) switches enforcement on; the "Field access" screen is a focused role × field-permission matrix over the normal role editor. When enforced, the order list/detail and the Kanban/queue cards mask phones (`01712•••678`) and null `costPrice`; super-admin/system roles are not special-cased (the seeded Super Admin holds every permission). Scope is deliberately the order endpoints plus queue/Kanban — customers list/profile/export, returns and reports still show full phone numbers and are tracked as a known gap.

## 2026-11-11 — M11: admin PWA service worker caches nothing

**Decision.** `apps/admin/public/sw.js` handles `push` and `notificationclick` only — no fetch handler, no caches. The admin app shows customer phone numbers, order data and staff sessions; an offline shell cache could serve stale or another user's authenticated pages. Installability only needs the manifest + a registered worker. The manifest and icons are generated from the brand settings (`lib/brand.ts` → public store config), like the storefront's. The admin CSP header's `Permissions-Policy` changed from `camera=()` to `camera=(self)` so the barcode scanner can open the camera (same-origin only). The camera scanner uses the browser's built-in `BarcodeDetector` (Chromium/Android) — no scanning library; elsewhere it explains itself and the text input / USB scanner (keyboard wedge) path is unchanged.

## 2026-11-11 — M11: admin push events and staff push subscriptions

**Decision.** `PushSubscription` gained a nullable `staffUserId` (a subscription belongs to a customer *or* a staff member; re-subscribing an endpoint as staff clears its `customerId`). Any signed-in staff member may register their own devices (`/admin/staff-push/*`, authentication only — it only ever delivers notifications they'd already see in the bell). `StaffNotificationsService` now fans every in-app notification out to push as well (best effort, never throws), gated by `pwa.adminPushEnabled`. New alert sources: new order (existing), high-risk order at placement, a payment failure, an approval request, and a low-stock *crossing* (available stock falling to/below the variant's threshold because of an order — a variant already below it does not re-alert on every order).

## 2026-11-11 — M11: confirm page copy is inline bilingual, following the track page

**Context.** Golden rule 1 says storefront copy comes from the database. The existing storefront order-tracking view (M5/M6/M10) already uses inline `bn`/`en` strings for the same kind of tokenised, account-less page.

**Decision.** `ConfirmOrderView` follows that precedent rather than inventing a second mechanism for one page; it is listed as a known gap to move to `ui_strings` together with the tracking view when those pages are next touched.

## 2026-11-12 — Admin CSP must allow Next's inline bootstrap scripts

**Context.** First run of the admin app in a real browser: `/en/setup` rendered but nothing
hydrated (console: "Expected a request ID to be defined for the document via self.__next_r"),
so the setup form submitted as a native `GET /en/setup?`. Cause: `apps/admin/next.config.mjs` set
`script-src 'self'` on the false assumption that the admin renders no inline `<script>`; Next.js's
App Router always emits inline bootstrap scripts.

**Decision.** `script-src 'self' 'unsafe-inline'` (plus `'unsafe-eval'` and the HMR websocket in
development only) — the same trade-off already documented for the storefront (`proxy.ts`).

**Alternatives.** Per-request nonces (needs a proxy/middleware that forwards a nonce header into
the render; next-intl's middleware composition makes this non-trivial — revisit before launch).

## 2026-11-12 — Admin `/` is the dashboard; first-run redirect moved to the login page

**Context.** After a successful login the admin bounced straight back to `/login`. M1's
`app/[locale]/page.tsx` (a server redirector: `hasSuperAdmin ? /login : /setup`) and M8's
`app/[locale]/(dashboard)/page.tsx` (the real dashboard) both resolve to `/`; the redirector won,
so `router.push("/")` after login always ended on `/login` and `/auth/me` was never called.

**Decision.** Delete the root redirector so `/` is the dashboard (its layout already redirects
unauthenticated visitors to `/login`). The "no Super Admin yet → `/setup`" behaviour moved into the
login page (client-side `GET /setup/status`).

**Alternatives.** Keep the redirector and have it send authenticated staff on (rejected: the server
component can't cheaply know the session; the layout already handles it).

## 2026-11-12 — M12: one transactional stock-movement path for multi-line documents

**Context.** Purchase receiving, transfers and stock takes each change many inventory levels at once, and M2's `InventoryService.adjust()` is single-line and not transaction-composable.

**Decision.** `InventoryService.applyMovementTx(tx, …)` runs inside the caller's `$transaction`; decrements use a conditional `updateMany` (`onHand >= qty`, or `available >= qty` for transfer dispatch) so a race can't drive stock negative. Back-in-stock (M10) fires from `afterMovementsCommitted()` after commit, never inside the transaction.

**Alternatives.** Row locks via raw `SELECT … FOR UPDATE` (rejected: a second raw-SQL path for no gain over the conditional update).

## 2026-11-12 — M12: stock take applies counted − snapshot, not counted − live

**Context.** Shops keep selling while a count is in progress.

**Decision.** Starting a stock take snapshots on-hand as `expectedQty`; applying adds `(counted − expected)` to the *current* on-hand (clamped at zero). Uncounted lines are left alone unless staff choose "treat as zero". Applying has its own permission (`inventory.stock_takes.apply`) because it rewrites a whole location.

**Alternatives.** Overwrite on-hand with the count (rejected: silently undoes sales made during counting).

## 2026-11-12 — M12: cost price on receiving = weighted average across all locations (configurable)

**Context.** Variants carry one `costPrice`, but stock sits in several locations.

**Decision.** `procurement.costMethod` (default `weighted_average`; also `last_cost`, `none`), blended against the variant's total on-hand across every location before the receipt. Order lines keep their cost snapshot (M5), so history is unaffected.

**Alternatives.** Per-location cost / FIFO layers (deferred: needs cost layers; revisit with M17 materials & BOM).

## 2026-11-12 — M12: markdowns become ordinary price schedules

**Context.** Dead-stock suggestions need to change prices.

**Decision.** Accepting suggestions creates M2 variant price schedules (start now, revert on end), so they appear in and can be cancelled from the existing Price schedules screen. Suggestions are tiered by days unsold (`inventory.markdownTiers`) and floored at cost × (1 + `pricing.marginGuard.minMarginPercent`), rounded down to whole taka.

**Alternatives.** A separate markdown mechanism (rejected: two ways to change a price).

## 2026-11-12 — M12: COD reconciliation is file-first; API only where the driver supports it

**Context.** §16 M12 asks for "file import + API where available". Our Steadfast/Pathao/RedX drivers have no documented payout/settlement endpoint.

**Decision.** `CourierDriver.getCodSettlement?()` is optional; only the mock implements it. Settlement files (CSV/XLSX) are imported with staff-mapped columns (headers auto-guessed), amounts parsed to poisha without floats. Lines match by consignment id (tracking code fallback); flags: unmatched, variance > `finance.codVarianceTolerance`, duplicate (in the file or in another draft), already settled, not delivered. Confirming posts `codSettledAt`/`codSettledAmount` and the courier's charge as `deliveryChargeActual` (the true profit report's courier cost) with a `codSettledAt IS NULL` guard. Order payment status is not changed.

**Alternatives.** Marking COD orders "paid" on confirm (deferred: the order payment model has no COD payment rows today; changing that is a wider M5 change).

## 2026-11-12 — M12: true profit scope and estimates

**Context.** §8.2 wants profit with courier charges, gateway fees, ad spend and returns.

**Decision.** Orders placed in the range with a final delivery outcome only. Sold: total − rejected-line value − refunds (completed + outstanding); COGS on kept units. Failed delivery: retained advance + door fee; no COGS; courier cost is a loss. Courier cost falls back to the order's shipping fee (flagged) until a COD settlement records the actual charge. Gateway fees use `finance.gatewayFeeBps` estimates unless gateway settlements cover the range, in which case recorded fees replace the estimate per method. Ad spend is 0 until M13. Needs `finance.profit.read`.

**Alternatives.** Include in-pipeline orders at expected values (rejected: not "true" profit; they're counted separately).

## 2026-11-12 — M12: scheduled report cadence and safety

**Context.** Scheduled emails send data to arbitrary addresses.

**Decision.** Daily / weekly (Saturday, start of the BD work week) / monthly (1st) at `reports.scheduled.sendHour` Dhaka time, covering the previous day / 7 days / calendar month. Creating or editing a schedule requires the permission needed to view that report (e.g. profit needs `finance.profit.read`). Runs are claimed with a compare-and-set on `nextRunAt` so the embedded tick and an external cron never double-send. Email is an escaped HTML table (the email driver interface has no attachments).

**Alternatives.** CSV attachments (deferred until the email driver interface supports attachments).

## 2026-11-12 — M12: anomaly alerts are a simple, explainable baseline comparison

**Context.** Staff need to trust and understand alerts.

**Decision.** Once per Dhaka day: yesterday vs the mean of the previous `alerts.anomaly.baselineDays` days. Orders and revenue alert on ±`thresholdPercent`; cancellation and rejection rates alert only on increases, with a 5-point floor; critical at twice the threshold. Silent when average daily orders < `minBaselineOrders`. Deduped per metric/day; notifies `reports.read` staff (in-app, push, email).

**Alternatives.** Z-scores / seasonality models (rejected for now: noisy on small stores, hard to explain).

## 2026-11-12 — M12: dashboard layouts resolve staff → role → store default → built-in

**Context.** §8.2 "customizable widgets per role".

**Decision.** `dashboard_layouts` rows scoped `staff` / `role` / `default`; the most specific wins (a staff member with several roles gets the first role by name that has a layout). Anyone can save their own; role/default layouts need `dashboard.layouts.manage`. Widgets the viewer lacks permission for are filtered at read time, so a shared layout can include e.g. the profit widget safely.

**Alternatives.** Free-form grid positions (deferred: an ordered list with automatic two-up pairing covers the need on mobile and desktop).

## 2026-11-12 — M12: admin-only tools have no on/off toggle

**Context.** Phase 2 acceptance says "each feature has its toggle".

**Decision.** Features that run by themselves have settings toggles (`reports.scheduled.enabled`, `alerts.anomaly.enabled`). Staff-driven tools (suppliers, POs, transfers, stock takes, analysis, reconciliation, profit, layouts) do nothing unless used and are switched per role via their permissions.

**Alternatives.** A feature flag per screen (rejected: duplicates the permission system).

## 2026-11-13 — M13: loyalty is a lot-based ledger; balance is a cached sum

**Context.** §5.8/§6.12 need earn-after-delivery with a pending period, redemption at checkout, per-point expiry and refunds on cancellation.

**Decision.** `loyalty_transactions` is the source of truth; earned rows are *lots* with `remaining`, spent soonest-expiring first (`consumeLotsFifo`), and `customers.points_balance` changes only in the same transaction as the row that explains it, with a conditional `updateMany` (`balance >= points`) so two checkouts can't overspend. Every grant is idempotent via unique `(reason, reference)`. Earning, release, reversal, expiry and bonuses are scheduler sweeps — no hooks into order/review code. Turning loyalty on only rewards orders delivered in the last 30 days (no mass back-award). Release re-checks the order and recomputes points so returns during the window reduce them.

**Alternatives.** Balance computed on read (rejected: checkout needs a cheap, race-safe check); event hooks in the order lifecycle (rejected: more coupling, sweeps are already the pattern).

## 2026-11-13 — M13: points pay only for goods, and are kept out of `discountTotal`

**Context.** §6.3 step 9 caps points at a % of the order; shipping is the brand's cost.

**Decision.** The cap is `loyalty.maxRedeemPercent` of goods after discounts; shipping is never paid with points. Orders store `points_redeemed`/`points_discount` separately from coupon discounts; order edit keeps the points discount; merge/split refuse orders that used points (simplest rule that can't lose or double-refund points). Points never earn points (`eligibleSpendForOrder` removes the points share). Tiers use `customers.total_spent` (the existing lifetime metric).

**Alternatives.** Treating points as a payment method (rejected: changes COD/advance maths and refunds).

## 2026-11-13 — M13: RFM is stored on the customer, scored nightly by quintiles

**Decision.** Nightly (after 02:00 Dhaka, once per day — "already ran" is read from `rfm_scored_at`, so it survives restarts and spun-down free-tier hosts), score R/F/M 1–5 by quintile within the store over `crm.rfm.windowDays`, map R × avg(F,M) to 11 named segments, write them onto `customers` grouped into ≤125 `updateMany`s. Segment rules filter on them like any field; presets are ordinary segments.

**Alternatives.** Fixed thresholds (rejected: wrong for both tiny and large shops); a membership table (rejected, same reasoning as M8 segments).

## 2026-11-13 — M13: marketing sends reuse the notification pipeline with their own copy

**Decision.** Broadcasts and journeys write `notification_logs` rows directly (new events `marketing_broadcast`, `journey_message`) with copy rendered from their own bn/en text, so M7's dispatcher, retries, logs and per-channel drivers are reused unchanged. Because the copy isn't in `message_templates`, a failed channel is retried but not re-routed to another channel. Broadcasts always require marketing consent on the channel; journeys default to requiring it (post-purchase review requests may opt out — they're service messages). Broadcasts queue `batchSize` recipients per tick, id-ordered with a stored cursor, so a crash resumes without double sends; cancelling withdraws queued-but-unsent rows.

**Alternatives.** A separate marketing sender (rejected: duplicate retry/log logic).

## 2026-11-13 — M13: unique-code campaigns mint codes assigned to the recipient

**Decision.** A broadcast (or journey step) linked to a code-type discount mints one `discount_codes` row per recipient with `assigned_to = customer id`; the discount engine now rejects an assigned code used by anyone else ("NOT_YOURS", or "log in" for guests). Code prefix = staff prefix + 3 chars of the broadcast id, so the report can count issued/used codes and their orders per broadcast. Single-use comes from the discount's own limits.

## 2026-11-13 — M13: audience sync is add-only and consent-gated

**Decision.** New provider capability `audience` (mock, Meta Custom Audiences, Google Ads Customer Match), SHA-256 of normalized phone/email per each platform's spec. Uploads are add-only (platforms dedupe); leaving a segment doesn't remove someone from the platform list — recreate the audience to prune. `marketing.audienceSync.requireConsent` (default on) uploads only customers with any marketing consent. Google uses OAuth refresh-token + OfflineUserDataJob; API version is a config field (default `v22`) since it changes often. Neither real driver has been run against a live account.

## 2026-11-13 — M13: ad spend is file-imported into poisha; ROAS joins by UTM

**Decision.** Same inspect → map → import flow as M12 COD files; rows are keyed (date, platform, campaign id, campaign name) and re-imports overwrite. USD accounts convert with a staff-entered rate, integer-only (`spendToPoisha`). ROAS: platform from `utm_source` via an editable map; campaign from `utm_campaign` = campaign id or name; unmatched paid orders get their own row. Revenue basis is a setting (placed vs delivered), net of refunds. The storefront now captures `utm_*` on landing (session storage) and sends them at checkout — previously no UTM ever reached orders. Ad spend for the period is subtracted in the true profit summary (`profitAfterAdSpend`), closing the M12 gap.

## 2026-11-13 — M13: AI is multi-provider per feature, with a code-owned output contract

**Decision.** Capability `ai` with drivers mock, Anthropic (official `@anthropic-ai/sdk`, default `claude-opus-5-5`, server-side refusal fallback opted in for models that support it; no `temperature` because current Claude models reject sampling parameters — effort is the knob), OpenAI and Gemini (plain `fetch`, model required). Each feature has a config row (provider, model, effort/temperature, max tokens, versioned prompt, monthly cents/token budgets). Staff edit the prompt; the JSON output contract is appended by code so edits can't break parsing, and the mock driver echoes the contract's example so everything works without keys. Budgets are hard stops (feature and store-wide); one alert per feature per month at `ai.budgetAlertPercent`. Fallback to the next enabled provider is a setting. Cost is an estimate in micro-USD from per-instance prices in US cents per million tokens (integers). All output is an `ai_drafts` row applied through the normal product services (versioned, audited) — never auto-published. Images are downscaled to 1024 px JPEG before sending.

**Alternatives.** Raw `fetch` for Anthropic too (rejected: the SDK is the supported client); free-form prompts with parse-what-comes-back (rejected: fragile).

## 2026-11-13 — M13: admin-only analysis tools have no toggle; broken links resolve against the DB

**Decision.** Product quality, SEO score, broken link checker, promo calendar and ROAS are admin-only analysis (same rule as M12). Customer-facing or spending features have toggles: loyalty, journeys, broadcasts, audience sync, AI. Link checking resolves internal paths against the database using the storefront's route table (`matchStorefrontRoute`, following one redirect) — no HTTP to our own site, so it works on the free tier; external links get a HEAD check only when `seo.brokenLinks.checkExternal` is on, SSRF-guarded, capped at 300 per scan. Seasonal themes aren't on the promo calendar because no scheduled-theme entity exists yet.

## 2026-11-13 — M13: storefront profile endpoint for birthday and consent

**Context.** Journeys/broadcasts need birthday and per-channel marketing consent; no storefront endpoint could set them.

**Decision.** `GET/PATCH /store/account/profile` (name, email, birthday stored as UTC-midnight date, locale, three consent flags), plus `/store/account/loyalty`. Storefront copy follows the existing inline-bilingual pattern of the account screens.

## 2026-11-13 — M14: recommendations are nightly item-to-item affinities, hand-picked first

**Context.** §16 M14 asks for "for you" and "frequently bought together from order data" on the free-tier stack (no ML service, no Redis).

**Decision.** A nightly pass (after 03:00 Dhaka, once per day) builds `product_affinities` from two kinds of baskets: products in the same order over `recommendations.windowDays` (cancelled/expired/unpaid excluded) and products one browser viewed over `recommendations.viewWindowDays` (first-party `view_item` events; visitors with more than 60 distinct products are skipped as likely crawlers). Pairs are scored by cosine of co-occurrence (not raw counts, so best sellers don't pair with everything; not lift, so tiny counts don't explode), need `recommendations.minSupport` co-occurrences, and are capped at 20 per product. Storefront reads are an indexed lookup plus in-memory ranking: hand-picked `product_relations` always come first (complete-the-look/cross-sell → "bought together", similar → "similar"); "similar" then uses the visual index and finally same-category products with shared title/tag words. "For you" seeds are the browser's recently-viewed ids (sent as plain product ids — nothing personal leaves the browser) plus, when logged in, the last year's purchases; viewed-together counts 0.6 of bought-together; best sellers fill in. With `recommendations.enabled` off only hand-picked relations show. Baskets are per order, not per customer — per-customer baskets would help tiny shops but mix unrelated purchases months apart.

**Alternatives.** Matrix factorisation / an external recommender (rejected: not free-tier, opaque to staff); computing on request (rejected: a self-join over orders per page view).

## 2026-11-13 — M14: "for you" and A/B variants are chosen in the browser so pages stay cached

**Decision.** Same rule as M10 audience-targeted blocks: pages are ISR-cached HTML shared by everyone, so anything per-visitor happens client-side after load. The `for_you` block fetches its products in the browser; an A/B-tested block or announcement bar is server-rendered once per variant inside `ExperimentSwitch`, which shows the visitor's variant. While the assignment loads the control holds its space invisibly for at most 800 ms (no layout shift; a slow network just shows the control). Crawlers and no-JS visitors see the control.

**Alternatives.** Varying the cache by visitor (rejected: defeats ISR on the free tier); edge middleware rewriting (rejected: ties the storefront to a host feature).

## 2026-11-13 — M14: A/B assignment is a hash of the API's anonymous_id cookie

**Decision.** The visitor id is the API's own httpOnly `anonymous_id` cookie (already used for guest carts), never a client-supplied value. `assignVariant` = FNV-1a of (experiment id, visitor id): one salt decides traffic inclusion, another the variant, so raising traffic only adds visitors and nobody changes variant mid-test; lowering traffic of a started test is refused for the same reason. The API recomputes the variant on every call (exposures, offer pricing), so the browser can say which experiments it rendered but never pick a variant. Exposure = first time the browser reports rendering it; goals are credited under the variant recorded at exposure: clicks (links inside the tested element), add-to-cart (cart controller) and purchases (a per-minute set-based sweep joining orders by the new `orders.visitor_id` to exposures, so checkout isn't coupled to experiments). Revenue is tracked for every test as a secondary metric. Logging in on another device is a different visitor — accepted.

## 2026-11-13 — M14: results use a two-proportion z-test with Bonferroni correction

**Decision.** Conversion rate = visitors who reached the goal / exposed visitors. Each challenger is compared with the control by a two-sided two-proportion z-test; with several challengers alpha is divided by their number. No verdict until every variant has `experiments.minVisitorsPerVariant` (default 100) — this is the guard against peeking; the admin also shows the sample size needed to detect a 10% uplift. Confidence level is a setting (default 95%).

**Alternatives.** Bayesian "probability to beat control" (rejected for now: harder to explain to non-technical staff and needs priors); sequential testing (deferred).

## 2026-11-13 — M14: what A/B tests can target, and what is frozen

**Decision.** Three kinds: a block on a *published* page (variants are replacement props validated against the block type's schema, stored on the experiment — the page builder is untouched and the public page payload carries the variants), an announcement bar (per-variant message/link), and an offer (per-variant discount or none). Popups aren't testable: the storefront doesn't render popups yet. One running/paused test per block or bar; a discount can belong to only one offer test. Variants, target and goal freeze at start. "Apply winner" writes a block's props into the page *draft* (staff publish through the normal flow), writes a bar's text, or disables the losing offer discounts.

## 2026-11-13 — M14: offer tests gate discounts in the engine, and pausing doesn't leak them

**Decision.** `DiscountsService.evaluate` asks `ExperimentAssignmentsService.offerGate(visitorId)`: a discount referenced by an offer test applies only to visitors whose variant names it (automatic ones are skipped, codes rejected as "not active"). Paused tests, and every test while `experiments.enabled` is off, keep gating and give everyone the control's offer — otherwise pausing would hand every variant's discount to every shopper at once. Completing a test lifts the gate, which is why the admin defaults "switch off the other variants' discounts" to on and warns about it. Pricing gets the visitor from the cart/checkout request's cookie; an order created without one (admin manual orders) gets the control.

## 2026-11-13 — M14: visual search is a local pixel feature vector, AI vision optional

**Context.** "Image upload → similar products via AI embeddings/vision". Anthropic has no embeddings endpoint, image embeddings differ per vendor, and a vector database isn't free-tier.

**Decision.** Every product's first 3 gallery images get a 100-number vector computed locally with sharp (`computeVisualVector`): a 52-bin colour histogram of the garment — the background is estimated from the image border and ignored — plus a 6×8 silhouette grid; similarity = 70% histogram intersection + 30% silhouette agreement. It costs nothing, works with every provider (including none) and fits in memory (the index is cached 5 minutes). AI is layered on top through the M13 AI framework as a new `visual_tags` feature (its own prompt, budget and provider): the shopper's photo (and optionally each product's main image, once) is read into garment/colours/pattern/keywords, and text agreement gets 40% of the score. Any AI failure — off, no provider, budget exhausted — falls back to pixels only. A sweep indexes 12 images per minute; failed images are retried after a day; `VISUAL_VECTOR_VERSION` forces re-indexing if the vector layout changes. Uploads are sniffed (no SVG/markup), limited to 8 MB, rate-limited per visitor per hour (in-memory, like other free-tier caches) and never stored. The admin can test it while it's still off for shoppers.

**Alternatives.** Vendor image embeddings + pgvector (rejected: not available on every provider and adds an extension requirement; the vector column could be added later behind the same service); AI-only tagging (rejected: costs per search and fails closed).

## 2026-11-13 — M14: "for you" is a block, recommendations are existing PDP/cart sections

**Decision.** "For you" is the `for_you` CMS block (§9.1 phase 2) with optional headings for personalised and fallback (best sellers) states, so staff place it like any other block. The PDP shows "Frequently bought together" and "Similar products" from `/store/recommendations/products/:id` (ISR-cached, not personal) in place of the hand-picked similar/complete-the-look/cross-sell sections, which they already include; upsell relations still show as before. The cart page gets a "Frequently bought together" slot. Storefront copy follows the existing inline-bilingual pattern.

## 2026-11-13 — M15: inbox channels are providers; WhatsApp reuses its capability

**Decision.** WhatsApp stays on the existing `whatsapp` capability (one Cloud API number serves notifications and the inbox); its driver gained `sendSession` (reports the message id) and `parseWebhook`, plus optional `appSecret`/`verifyToken` config. Messenger and Instagram are a new `chat_channel` capability (`messenger`, `instagram`, `mock`) sending through the Graph API `/{page-id}/messages` with the page token. Webhooks arrive at `/api/v1/webhooks/inbox/:instanceId`: the GET answers Meta's `hub.verify_token` check; POSTs must carry a valid `X-Hub-Signature-256` HMAC of the raw body (the API now keeps `req.rawBody`). A real Meta instance without an app secret can't receive at all — refused, never trusted. Every event is stored raw in the new `webhook_events` table, processed, and retried by a sweep on failure (max 5); Meta still gets a 200 so it doesn't disable the webhook. Each mock channel accepts an unsigned `{ contactId, text }` webhook, and the admin can post a test message, so the whole flow runs with no Meta app.

**Alternatives.** One "meta" capability for all three (rejected: WhatsApp notification config already lives on `whatsapp`; staff would configure the same number twice).

## 2026-11-13 — M15: one conversation per channel + contact

**Decision.** `conversations` is unique on (channel, contact id) — WhatsApp number, Messenger PSID, Instagram-scoped id, or the visitor's `anonymous_id` for live chat. A second WhatsApp number on the same store would share threads for a customer who writes to both; accepted for a single-brand deployment. Customers are linked by phone (WhatsApp) or login (live chat). Webhook retries are harmless: (conversation, provider message id) is unique. Media from WhatsApp is recorded by type/caption only (downloading needs a second authenticated call); Messenger/Instagram attachment URLs are kept.

## 2026-11-13 — M15: Meta's 24-hour window is enforced, not worked around

**Decision.** Staff (and the assistant) can only reply within 24 h of the customer's last message on WhatsApp/Messenger/Instagram — the platforms' free-form reply window. Outside it the composer is disabled and suggests calling. Template-based re-engagement messages stay out of scope (same M7 limitation for business-initiated WhatsApp).

## 2026-11-13 — M15: the chat assistant is tool-using chat through the M13 AI framework

**Context.** §10.4: "answers about products, sizes, stock, order status via tool calls to our API, with strict guardrails and handoff to human".

**Decision.** `AiDriver` gained an optional `chat()` over a vendor-neutral transcript (user / assistant + tool calls / tool results); Anthropic (official SDK, `tool_use`/`tool_result` blocks), OpenAI (function calling), Gemini (`functionDeclarations`) and the mock implement it. `AiService.chat` applies the same switches, per-feature budgets, provider fallback (skipping drivers without `chat`) and usage logging as `generate`; the `chat_assistant` feature's editable prompt is the system prompt. The API runs the loop (max 4 tool rounds; the last round only offers `handoff_to_human`) with five tools: `search_products`, `get_product` (incl. stock), `size_advice` (M10 recommender), `order_status`, `handoff_to_human`. Guardrails live in code, not only the prompt: tool inputs are re-validated with zod; `order_status` only answers when the order's phone matches the phone the channel vouches for (WhatsApp number or the logged-in account) or one the customer typed, and gives the same "not found" for wrong-phone and no-such-order; results are capped at 3,000 characters; replies at 1,500. Handoff happens when the model calls the tool, when the customer asks for a person (deterministic Bangla/English/Banglish detection before any AI), when AI is off/over budget/failing, or when the model has no answer. A staff reply switches the assistant off for that conversation. The assistant runs inline after an inbound message (fire-and-forget so webhooks answer fast) with a sweep for anything missed. Thinking is not enabled for chat (latency), so rebuilding assistant turns from text + tool calls loses nothing.

**Alternatives.** Letting the model call our HTTP API directly (rejected: no per-tool guardrails); the SDK tool runner (rejected: vendor-specific; the loop must work for all three vendors and the mock).

## 2026-11-13 — M15: AI reply suggestions are composer drafts only

**Decision.** The `reply_suggestion` feature returns up to three replies in the customer's language (Bengali script → Bangla) from the last 20 messages plus a short customer/order summary; staff click one into the composer and edit before sending. Nothing is sent automatically. Requires `ai.use`.

## 2026-11-13 — M15: ticket SLA is calendar minutes with two deadlines

**Decision.** Tickets get a first-response and a resolution deadline from their priority (`support.sla.*` settings, minutes). Calendar time, not business hours — a business-hours calendar (holidays, Eid) is a larger feature and the defaults are generous. Re-prioritising recomputes both from creation time and clears a breach the new deadline no longer has. The first customer-facing reply meets first response (internal notes don't); resolving/closing meets resolution. A sweep marks each breach once (conditional `updateMany`) and alerts the assignee, or everyone with `support.tickets`. A customer-visible ticket reply is sent through the linked conversation when there is one; otherwise it is logged (and counts as the response — the agent contacted them by phone/SMS). Numbers are `TCK-YYMMDD-NNNN` like M12 documents.

## 2026-11-13 — M15: click-to-call is a generic HTTP provider with a tel: fallback

**Decision.** New `telephony` capability: `generic_http` (admin-configured request template with `{agent}`, `{customer}`, `{reference}`, `{api_key}`, `{caller_id}`, number format, call-id path, and a status-webhook mapping with a status map and optional shared secret) and `mock`. The provider rings the agent's own phone (a new `staff_users.phone`, set on Support → Calls) then bridges to the customer; our call-log id is passed as the reference so the status webhook (`/api/v1/webhooks/telephony/:instanceId`) finds the call. Without a provider, Call still logs the call and opens a `tel:` link, and the agent records the outcome. No named BD PBX driver ships: none could be verified here, and the generic driver covers the common "call bridge" API shape.

## 2026-11-13 — M15: live chat polls and is identified by the API cookie

**Decision.** The storefront widget (in the floating chat stack, behind `support.liveChat.enabled`) polls every 4 s only while open — no websockets on the free tier; the admin inbox polls every 5–10 s. The visitor is the httpOnly `anonymous_id` cookie (linked to the customer when logged in); name and phone are optional on the first message. Messages are rate-limited per visitor (in-memory, setting). "Talk to a person" sets the conversation to waiting-for-agent and alerts staff. Storefront copy follows the inline-bilingual pattern.

## 2026-11-13 — M15: create order from chat reuses the manual order screen

**Decision.** "Create order" in the inbox opens the existing manual order form (§8.2) pre-filled with channel, phone and name; on save the order is linked to the conversation (`conversations.order_ids` + a system note) and staff return to the thread. No second order-entry path.

## 2026-11-13 — M16: gift cards and store credit are payments, not discounts

**Context.** §6.3 step 9 groups gift card / store credit / points redemption, and step 11 writes `total = … − credits`. But §5.6 lists `store_credit` and `gift_card` as payment methods, a gift card's money was already received when it was sold, and M12's profit report already treats `store_credit` as a non-gateway payment. M13 implemented points as a discount (`orders.points_discount`, subtracted from `total`).

**Decision.** Points stay a discount (M13, unchanged). Gift cards and store credit are tenders: `total` keeps the order's value; placement records a succeeded `payments` row per tender (`method` `gift_card`/`store_credit`), `paid_total` includes them, and `cod_amount`/advance/online amounts are taken from the new `amount_due` (what's left). The order keeps `gift_card_used`, `gift_card_id`, `store_credit_used` for display and reversal. Payment rules still see the order value. Gift card is spent first (it can expire), then the wallet; both may pay for delivery. A cancelled or expired order gives the tenders straight back to the card/wallet inside the same transaction (idempotent ledger rows, payment rows marked `cancelled`) and only the cash part becomes a refund record. `onPaymentSucceeded` now derives an advance-paid order's COD amount from `paid_total`, so tenders aren't collected twice.

**Alternatives.** Subtracting credits from `total` like points (rejected: understates revenue and makes refunds of mixed-tender orders ambiguous).

## 2026-11-13 — M16: ledgers for store credit and gift cards, in a dependency-free core module

**Decision.** `store_credit_transactions` and `gift_card_transactions` are append-only ledgers with `balance_after`; `customers.store_credit_balance` and `gift_cards.balance` change only in the same transaction as their row, debits use a guarded `updateMany` (balance ≥ amount) so concurrent spends can't overdraw, and `(reason, reference)` is unique so automatic credits (refund id, return id, order id, referral id) are idempotent. In-transaction credits check for an existing row first because a unique violation would abort the caller's whole transaction. Both ledgers and the tender spend/restore live in `RewardsCoreModule` (Prisma + config only) so order lifecycle, checkout, refunds and returns use them without module cycles. Returns resolved as store credit and refunds completed with method `store_credit` now credit the wallet through the ledger (M6 incremented the balance directly); a store-credit refund on a guest order is refused with a clear message. Store credit has no expiry (the spec sets none).

## 2026-11-13 — M16: gift card codes are hashed, delivered once, re-issued rather than recovered

**Context.** §5.8: "code (hashed + last4)".

**Decision.** 16 characters from a 30-letter alphabet without look-alikes (0/O/1/I/L/U), ~78 bits, generated with rejection sampling from `crypto.randomBytes`; stored as HMAC-SHA256 keyed with `APP_ENCRYPTION_KEY` plus `last4`. The plaintext exists only in the delivery message (`gift_card_received`, so also in that notification log row — unavoidable for a queued SMS) and, for staff-issued cards, in the one API response that shows it to the issuer. Lost code → *new code*: a fresh code replaces the hash and is sent again; there is no "show code". Lookups (apply at checkout, balance check, add to wallet) share an hourly per-visitor limit (`giftCards.checksPerHour`, in-process like M15's live-chat limiter) and answer unknown codes with one generic message.

## 2026-11-13 — M16: storefront gift card purchases use the payment drivers without an order

**Context.** A digital gift card has nothing to ship, but `payments` rows belong to orders and checkout requires an address.

**Decision.** A purchase is a `gift_cards` row in status `pending` (placeholder hash, zero balance) paid through `PaymentsService.initiateStandalone`, which runs the same drivers but stores the gateway reference on the card. Gateway callbacks for a reference no `payments` row knows are offered to registered standalone handlers (the gift card module registers one), and a sweep re-verifies pending purchases and cancels them after `payment.timeoutMinutes`. On success the card gets its code and balance, the code is sent to the recipient and a receipt (last 4 only) to the buyer. A payment confirmed after the timeout still issues the card — the money was taken. COD isn't offered. The result page polls by an unguessable purchase token and never shows the code.

**Alternatives.** A `gift_card` catalog product sold through the normal checkout (rejected: needs address-less, shipping-less orders through fulfilment); making `payments.order_id` nullable (rejected: touches every payment consumer). Known gap: these payments don't appear in M12 gateway settlement matching.

## 2026-11-13 — M16: referral rules

**Decision.** Each customer's existing `referral_code` (M5) is their code; links are `?ref=CODE`, and a referral code typed into the coupon box is moved to the cart's referral slot. The referee discount (percent with cap, or fixed; minimum order; doesn't stack with coupons unless allowed) is a pricing step after coupon discounts, kept in `orders.referral_discount` beside `points_discount`, and points are capped on the goods total after it. It applies only to a first order (no orders by that account or phone), never to the referrer themself (account or phone), and once per referee phone (`referrals.referee_phone` unique — a lost race rolls back the order instead of double-discounting). The referrer's reward (store credit or points) is granted by a sweep when the order reaches `completed` (after the return window, matching loyalty and affiliate approval); cancelled/refused/returned orders void it, as does exceeding `referral.maxRewardsPerMonth` (Dhaka calendar month). Points rewards wait while loyalty is switched off. Staff can void a pending referral.

## 2026-11-13 — M16: affiliate attribution and commission

**Decision.** An affiliate has a link code (`?aff=CODE`, stored on the cart with the click time, last click wins) and optionally one coupon. At placement the coupon's affiliate wins; otherwise a link click within the window (`affiliates.attributionDays`, overridable per affiliate). No commission on the affiliate's own phone. Commission is percent (basis points) or fixed per order on kept goods after coupon, referral and points discounts (never shipping or gift wrap), created `pending`; a sweep approves it when the order completes — recomputed for returned items, never above the original — or rejects it if the order failed. Payouts happen outside the system: *Record payout* marks every approved commission paid in one payout row with the transaction id (`affiliates.payouts` permission). Clicks are counted per Dhaka day (no per-click rows, free-tier friendly). Partners get a private read-only page (`/affiliate/:token`, noindex, no customer data) whose token staff can rotate.

## 2026-11-13 — M16: what the feature toggles switch off

**Decision.** Per §4.2, storefront endpoints for a disabled feature answer `FEATURE_DISABLED` (applying a gift card, using store credit, setting a referral code, balance check, purchase); admin screens stay usable so staff can prepare first. A customer can always see their wallet balance and history even while store credit payment is off, and refunds/returns keep crediting it. Affiliate clicks and attribution simply stop while affiliates are off.

## 2026-11-14 — M17: demand forecast is a transparent blend, not a model

**Context.** §16 M17 asks for demand forecasting and reorder suggestions. A shop with a few hundred SKUs has a handful of sales per variant per week — too sparse for seasonal or ML models to beat a simple method, and staff must be able to see why a number came out.

**Decision.** `forecastDemand` (procurement/forecast.ts): daily rate = 0.5 × EWMA (14-day half-life) + 0.3 × mean of the last 30 days + 0.2 × mean of the whole window (default 90 days, `forecast.lookbackDays`), multiplied by `1 + ½(clamp(trend, 0.5, 1.5) − 1)` where trend is the last 14 days over the 14 before. Reorder policy is the classic reorder point: order when on hand + on order ≤ rate × lead time + safety stock, up to rate × (lead time + cover days) + safety stock, rounded to pack size/MOQ. Lead time = supplier's `lead_time_days` ?? `procurement.leadTimeDays`; safety/cover/history are settings. The supplier proposed for a variant is the one on its most recent non-cancelled PO.

**Alternatives.** Holt-Winters / Prophet-style seasonality (no data to fit it for most SKUs); per-variant lead times (suppliers, not variants, have lead times); correcting for stock-out days (needs historical stock levels, which the movement ledger could reconstruct but at real cost — deferred, and called out in the UI). Sales are read with one aggregating SQL query because a quarter of order lines is too many rows to ship to Node.

## 2026-11-14 — M17: materials are integer quantities of a chosen unit; BOM consumption rides on production-order receiving

**Context.** Fabric is bought by the metre but cut by the centimetre; the whole codebase keeps quantities and money as integers.

**Decision.** `materials.on_hand` is a whole number of the material's own `unit` (the admin picks a fine one — cm, g, pcs), `cost_price` is poisha per one unit, and every change goes through `MaterialsService.applyMovementTx`, which writes a `material_movements` ledger row in the same transaction and refuses to go below zero (`updateMany … onHand ≥ n`). A BOM line is quantity per finished unit + whole-percent wastage, rounded up (`ceil(q × units × (100+w) / 100)`); a variant-specific line replaces the product-wide line for the same material (uniqueness is enforced in the service because Postgres treats NULL `variant_id`s as distinct). Consumption happens when finished goods are received on a **production** purchase order and `procurement.materials.autoConsume` is on (default off), inside the receiving transaction, so a shortage rolls the receipt back unless the receiver passes `allowMaterialShortage` (then it consumes what is there and notes the shortfall in the ledger). Materials have no purchase orders of their own: a delivery is booked with *Receive stock*, which blends cost with `procurement.costMethod`.

**Alternatives.** Decimal quantities (breaks integer rule and complicates every sum); a separate material PO type (more screens for the same ledger — revisit if suppliers need paperwork); consuming at confirmation of a production order rather than at receipt (would deduct materials for units that may never arrive); FIFO cost layers (still deferred, as in M12).

## 2026-11-14 — M17: P&L builds on the true-profit report; ad spend can be switched off to avoid double counting

**Decision.** `PnlService` calls `ProfitService.report` for revenue (already net of refunds and door rejections), COGS, courier and gateway fees, adds imported `ad_spend` and recorded `expenses`, and the pure `buildPnl` produces gross profit → contribution → net profit. `expenses.category` is a free string validated against the editable `finance.expenseCategories` setting (golden rule 1) — on create, and on update only when the category changes, so old rows survive a category being removed. `finance.pnl.countAdSpend` (default on) lets a shop that also keys ad spend in as expenses stop counting it twice. Expense dates are Dhaka calendar days stored as `@db.Date`. The monthly view splits at Dhaka month boundaries (max 12 months) and runs one profit report per month.

**Alternatives.** Cash-basis P&L (the shop's accounting is out of scope; this is an operating view); a separate "marketing" expense category fed from ad spend (hides where the number came from); materialising monthly P&L rows (premature — the report is computed on demand like the M12 profit report).

## 2026-11-14 — M17: cohorts and LTV on realized orders, aggregated in SQL

**Decision.** A cohort is the Dhaka month of a customer's first delivered/partially delivered/completed order (the M12 "sold" set); activity is later realized orders by placement month, revenue net of `refunded_total`. Guest orders (no customer id) are excluded. Offsets beyond the current month are `null`, not 0, so young cohorts don't look like churn. LTV summary (average, median, repeat rate, top-decile share, percentiles) is computed over all-time per-customer totals. Both are `GROUP BY` queries; `cohorts.ts` only shapes the result.

**Alternatives.** Cohorting by first *placed* order (pulls in orders that later fail, inflating cohort size); phone-number matching to follow guests (privacy and accuracy trade-offs, deferred); acquisition-channel cohorts (the report builder can already slice by source).

## 2026-11-14 — M17: the report builder is live aggregation over two fixed datasets

**Decision.** Two datasets — `sales` (one row per order) and `products` (one row per order line) — each with a fixed list of dimensions and metrics defined once in `@clothing/shared/analytics` (shared by API validation and the admin pickers). A saved report is that config as JSON in `custom_reports`. Rows are loaded with Prisma over the placement-date range and aggregated in `aggregate()`; `reports.builder.maxRangeDays` (366) and `reports.builder.maxSourceRows` (50,000) bound the work, and exceeding the row cap is an error asking for a narrower range rather than a silently wrong answer. Cancelled/expired/unpaid orders are excluded unless `includeUnsold`. Units are placed quantities (before returns) and COGS uses the cost snapshot on the order line; the profit reports remain the place for realized numbers. Running needs `reports.read`, saving `reports.builder.manage`; CSV export is audit-logged like the other exports.

**Alternatives.** User-written SQL (rejected: injection and resource risk); arbitrary joins/fields (unbounded UI and validation surface); pre-aggregated daily metrics tables (the spec's `daily_metrics` — worth it only once report volume hurts).

## 2026-11-14 — M17: API keys are hashed, scoped, read-only, and off by default

**Decision.** Keys are `ck_live_` + 256 random bits. Only the SHA-256 hash and a 16-character prefix (for lookup/display) are stored — a fast hash is appropriate for high-entropy secrets and keeps per-request latency low; the plaintext is returned once at creation and never logged or audited. Lookup is by prefix, comparison is constant-time, and revoked/expired keys fail authentication. Scopes are `products.read`, `inventory.read`, `orders.read`; the public API is read-only. `publicApi.enabled` (default off) gates every request, and a per-key fixed-window limiter (`publicApi.rateLimitPerMinute`, in memory per instance) returns 429 with `Retry-After`. Keys are accepted only in `Authorization: Bearer` / `X-API-Key`, never the query string. Responses are explicit field allow-lists (no cost price, risk, IP, device, internal notes); orders do include the delivery contact because the typical consumers (couriers, ERPs) need it. The API is served at `/api/v1/public/v1/*`, cursor-paginated by id.

**Alternatives.** Write scopes (each needs idempotency and audit design — deferred until a concrete integration asks); JWT/OAuth client credentials (heavier for the "paste a key into my ERP" use case); a Redis-backed limiter (golden rule 8).

## 2026-11-14 — M17: outbound webhooks are an at-least-once queue on the existing scheduler

**Decision.** Order events reuse the after-commit automation trigger (`order.placed`, `.confirmed`, `.on_hold`, `.cancelled`, `.shipped`, `.delivered`, `.rejected_at_door`): `AutomationModule`'s task handler first calls `WebhooksService.dispatchOrderEvent` (errors are logged and swallowed so rules still run), which writes one `pending` `webhook_deliveries` row per subscribed active endpoint. A recurring `webhooks.deliver` handler on the scheduler tick sends due rows (25 per tick), signed `t=<unix>,v1=HMAC-SHA256(secret, "<t>.<body>")` with `X-Webhook-Id/Event/Signature`, 8 s timeout, **no redirects**, https only, and the destination re-checked against private/loopback/metadata addresses at send time (SSRF; shared `assertPublicHttpsUrl` with the automation webhook action). 2xx = delivered; otherwise retry after 1, 2, 4 … minutes (cap 6 h) up to `webhooks.maxAttempts`, then `failed` (staff can retry). After `webhooks.autoDisableAfterFailures` consecutive failed attempts an endpoint is switched off with a reason. Signing secrets are AES-256-GCM encrypted with `APP_ENCRYPTION_KEY` (HMAC needs the plaintext, so hashing isn't an option) and shown once at creation/rotation. Delivery history is pruned after 30 days. Payloads carry an order summary without risk, IP or device fields.

**Alternatives.** pg-boss jobs per delivery (adds a second retry mechanism and no admin-visible state); a separate outbox table per domain event (only order events exist today); delivering inline in the order transaction (couples checkout latency to customers' servers).

## 2026-11-14 — M17: config bundle imports merge, never delete, and are previewed first

**Context.** §4 item 5: export settings, theme, menus, CMS pages, UI strings, message templates, categories/attributes (no orders/customers) and import them elsewhere; the Phase 3 acceptance is launching a brand from a bundle in under an hour.

**Decision.** A bundle is `{ format: "clothing-config-bundle", version: 1, sections, data }` covering settings (non-secret, registry-known keys only), UI strings, message templates, categories (parent by slug), attributes (+values by slug), menus and CMS pages. Import only creates or updates (matching on natural keys: setting key, UI string key, event+channel, slug/code), never deletes, and defaults to a **dry run** that reports created/updated/unchanged/skipped/warnings per section. Settings go through `SettingsService.setValue`, so each still needs its own permission and is audited individually; the other sections are applied in one transaction. Ids don't travel: menu items are exported with `targetSlug` instead of `targetId` and re-resolved on import (unresolvable links are kept without a target and reported); page blocks are free-form JSON, so embedded media/product/collection ids are detected and reported as warnings rather than rewritten. Imported pages are drafts unless `publishPages` is ticked; soft-deleted pages are skipped. The import route accepts a 10 MB body (the global default is 100 kB). Theme lives in settings, so it travels with them.

**Alternatives.** Bundling media (needs storage-provider-agnostic file copy — deferred); remapping block ids by walking block schemas (the CMS block registry would have to expose which props are references); replace-all import semantics (too dangerous on a store with live content).

## 2026-11-14 — M17: what the new feature toggles switch off

**Decision.** `publicApi.enabled` and `webhooks.enabled` default to off and gate the public API and event queueing respectively (test pings and already-queued deliveries still work so staff can debug). Materials auto-consumption is off by default so existing production orders behave as before. Forecasting, expenses, P&L, cohorts, the report builder, materials and config bundles are admin-only screens guarded by their own permissions rather than feature toggles, matching how M12's finance and inventory tools were done.

## 2026-11-14 — Route-scoped body parser must not be named `jsonParser`

**Context.** After M17, every JSON POST to the API (admin login included) failed with
`VALIDATION_ERROR ... expected object, received undefined`. M17 added
`app.use("/api/v1/admin/config-bundle/import", json({ limit: "10mb" }))` in `apps/api/src/main.ts`.
Express's `json()` returns a function named `jsonParser`; Nest's ExpressAdapter checks the router
stack for a middleware with that name and, finding one, skips registering its own global JSON
parser — so no other route had a parsed body.

**Decision.** Keep the route-scoped 10 MB parser but register it through an arrow-function wrapper,
so Nest still installs its default parser for every other route.

**Alternatives.** `app.useBodyParser("json", { limit: "10mb" })` (rejected: raises the limit for
every route, which the M17 comment explicitly avoided).

## 2026-11-14 — §8.2 catalog import completed: column mapping, ZIP/URL images

**Context.** M2 shipped the import with one fixed template and deferred the column mapper and
image import (entries above, "picked up whenever catalog import needs more than the fixed
template handles"). They were never picked up. A real merchant template (Shopify-style
`product_handle` / `variant_sku` / `price_bdt`, `option1_name/value`, `Men > Panjabi` category
paths, product fields only on a product's first row, `;`-separated lists, an `images` column of
ZIP file names) matched almost none of the fixed columns — every row failed — and its taka prices
would have been read as poisha (100× too low).

**Decisions.**
- **Mapping:** the server suggests a header → field mapping from aliases (`mapping.ts`), which
  covers the old template too, so old files and API callers keep working unchanged. Staff can
  change it per column in the admin screen and save it as a named preset
  (`catalog_import_presets`). The chosen mapping is stored on the job.
- **Price unit** is an explicit option (taka/poisha), auto-suggested from money headers
  (`price_bdt` → taka; bare `price` → poisha, the old template's unit). Always stored as poisha.
- **Product-level cells only need one row.** Blank cells on a product's other rows never overwrite
  anything; option names left blank on continuation rows resolve to the product's option at the
  same position. Localized text is merged into what the product already has.
- **Option types** from names: Size/Waist/Age/Length/Chest → size, Color/Colour → colour (gets
  the row's `color_hex`), anything else → generic.
- **Category paths** create missing levels (slug = joined path, e.g. `men-panjabi`) and report
  them as warnings. `categorySlug` (old template) still requires an existing category.
- **Size charts** are matched by name only, never created (they need measurement data the sheet
  doesn't have) — a warning instead.
- **Fit / Occasion** become `fit` (select) / `occasion` (multiselect) attributes, created on first
  use with editable default names.
- **Single-language cells** (care, fabric, model info, SEO) go to `bn` if they contain Bangla
  script, else `en`; explicit `…_bn` / `…_en` columns win.
- **Warnings vs errors:** an error skips the row; a warning (missing image, missing size chart,
  created categories, bad hex) imports it and is listed in the downloadable report
  (`warning_rows` counter on the job).
- **Images:** a ZIP (new dependency `fflate`, pure JS) is unpacked in memory at upload — base
  names only, junk/non-image entries skipped, per-file (15 MB) / total (300 MB) / count (2 000)
  limits checked from the central directory before inflating — and held per job in
  `catalog_import_files` until the job finishes. Files match the `images` column; without that
  column, the SKU (`SKU.jpg`, `SKU-2.jpg`). https URLs are downloaded with the automation
  webhook's SSRF guard (public addresses only, no redirects, 15 s, 15 MB, `image/*`). Every image
  goes through `MediaService.upload` (sniffing + sized variants), joins the gallery tied to the
  row's colour value, and is skipped on re-import if the product already has that file name.
  A chunk stops after 12 images so a tick stays short.
- **Related bug fixes found on the way:** a CSV's UTF-8 BOM became part of the first header; a
  product slug that `slugify` changed (e.g. upper case) created a second product on the next row;
  a SKU clash was detected only after the product had been written; and the admin `api.upload`
  sent `Content-Type: application/json` with FormData bodies, so no admin file upload (media
  library included) could be parsed by the API.

**Alternatives.** A drag-and-drop mapper (rejected: a per-column dropdown with auto-suggestion
does the same job with far less UI); creating size charts from a name (rejected: an empty chart is
worse than none on the PDP); storing the whole ZIP on the job and re-reading it each tick
(rejected: re-downloads tens of MB from the database every chunk).

## 2026-11-14 — CSP `img-src` allows the API origin (local media)

**Context.** The first real catalog import put product images in local storage, served from
`${API_URL}/media` (`apps/api/src/storage/storage.module.ts`). In development that is
`http://localhost:4000`, which the storefront's and admin's `img-src 'self' data: blob: https:`
did not cover — every product image (and the admin media library's thumbnails) was blocked.
R2/S3/Cloudinary media is https and was never affected.

**Decision.** Both CSPs add the `API_URL` origin to `img-src`. The storefront CSP also gets the
development-only `'unsafe-eval'` and HMR websocket the admin got on 2026-11-12.

**Also found in the same run (not changed here):** a scheduled task whose handler hangs (the
database connection dropped mid-chunk) stays `running` forever — the scheduler never reclaims it,
so that import's last chunk stalled until the task was requeued by hand. And `nest start --watch`
once crashed natively on Windows (exit 3221226505) while restarting after a file change; a fresh
`pnpm dev` boots normally.

## 2026-11-14 — Scheduler: atomic task claims and stale-task recovery

**Context.** During the first live catalog import the database connection dropped while a chunk
was running. The handler never returned, its `scheduled_tasks` row stayed `running` forever, and
the import's last chunk stalled until the task was requeued by hand (entry above). Two more gaps
in `SchedulerService.runDueTasks()`: it claimed tasks with a plain `update` after a `findMany`, so
overlapping ticks (a hung tick doesn't stop the 60 s interval; an external cron can fire alongside)
could run one task twice; and a hung handler that eventually returned would overwrite whatever had
happened to its task since.

**Decisions.**
- **Atomic claim:** `updateMany where { id, status: "pending" }` → `running`, stamping the claim
  time into `updatedAt`; a tick that gets `count = 0` skips the task.
- **Owned completion:** the done/failed write is conditional on `{ status: "running", updatedAt:
  claimedAt }`, so a late-returning handler can't overwrite a re-run's outcome (logged instead).
- **Stale recovery:** each tick first looks for tasks `running` for more than 15 minutes (far above
  any handler's normal run time). The first time, the task is requeued with a marker in
  `lastError`; if it goes stale again it is failed ("Gave up …"), so a handler that reliably hangs
  can't loop forever. No schema change — the marker lives in `lastError`.
- **Catalog import:** the chunk's job update is conditional on the cursor it started from; a chunk
  that finishes after a re-run already advanced the job is discarded (no cursor rewind, no second
  chain of chunks). Rows it touched were upserts, so the duplicate work is harmless.

**Alternatives.** An `attempts`/`lockedUntil` column (cleaner, but a migration on every deployment
for no behavioural gain over the marker); per-handler timeouts (a timed-out promise keeps running
in Node, so it would still need the ownership check above).

**Verified live:** a probe task inserted as `running` an hour ago was requeued and run on the next
tick of the real dev server, then removed.

## 2026-11-15 — Admin Menus screen, storefront header rebuild, storefront UI strings

**Context.** The storefront navbar showed only search and cart. Menus had an API and storefront
rendering since M3, but the admin screen was deferred ("Admin UI for menus … a real gap") and never
built, so no menu existed. The header itself had no account, wishlist, language switch or mobile
menu, dropdowns only existed in the `mega` variant and opened on hover only, and the footer linked
every non-URL item to `#`. Storefront chrome text was inline `locale === "bn" ? … : …` copy, while
the `ui_strings` table was never read by the storefront.

**Decisions.**
- **Admin → CMS → Menus** (`/cms/menus`): tabs for the two layout slots (`header`, `footer`),
  create-if-missing, an item tree (≤ 3 levels) with bn/en labels, a type (category, collection,
  page, product, URL) and a target picker. Targets are stored as **slugs** in `targetId` (the
  storefront routes look up by slug — no per-render id→slug lookup). Picking a target fills empty
  labels from its name. Validation: a label in one language, and a target — except an item with
  children, which may be a heading only (footer column, dropdown title); URLs must start with `/`,
  `https://`, `mailto:` or `tel:`. Tree logic is pure (`lib/menu-tree.ts`) and unit-tested; the
  admin app now runs Vitest.
- **Header**: mobile-first — below `lg` a menu drawer (accordion submenus, account, wishlist,
  order tracking, language switch; Escape/backdrop/navigation close it, focus moves in and back,
  page scroll locked), logo, search icon (full-width search row) and cart icon with badge; from
  `lg` the menu inline with dropdowns for every variant (wide panel for `mega`) that open on hover
  **and** keyboard focus, plus wishlist, account and language. Sticky. Header variants keep their
  meaning (`centered` puts the menu on its own row; `minimal` hides it).
- **Footer**: links resolve through the same menu → href code as the header; a target-less column
  heading renders as text; contact details are `tel:`/`mailto:` links.
- **Storefront UI strings**: every key under `storefront.` is public via `GET /store/ui-strings`
  (60 s cache, `ui_strings` tag; admin string edits under that prefix trigger revalidation). Missing
  keys fall back to the seeded defaults. Header/footer copy uses this; older storefront components
  still use inline copy and can migrate key by key.

**Alternatives.** A drag-and-drop tree (rejected for now: up/down buttons are fully keyboard
accessible and need no library); storing database ids and resolving them per render (rejected:
an extra lookup on every page for no benefit, and the M3 header already expected slugs).

**Found, not changed:** `REVALIDATE_SECRET` is empty in both `.env` files, so the storefront
answers the API's revalidation call with 403 and changes appear only when the 60 s cache expires.
Set the same random value in `apps/api/.env` and `apps/storefront/.env.local` to make admin edits
show immediately. The header still gets `logoUrl={null}` (brand-logo → URL resolution is an M3
known gap), so the brand name is shown instead of a logo.

## 2026-11-15 — Integrations form built from each driver's config schema

**Context.** The Integrations screen (built in M1 as the generic provider pattern) asked for a
driver's whole config as raw JSON, with English-only labels, no edit, no on/off switch and no
delete — even though the API supported PATCH and DELETE. Editing would also have been unsafe: the
list returns secrets masked (`••••1234`), so saving an edited config would have stored the mask.

**Decisions.**
- `describeConfigFields()` (`packages/shared/src/providers/config-fields.ts`) turns a driver's zod
  `configSchema` into form descriptors via zod's JSON Schema export on the input side (text, secret,
  number, boolean, select, json; required/nullable/default/min/max/url). The catalog endpoint
  returns them as `fields`, plus `supportsUsage`. New drivers get a form with no UI code; a unit test
  covers every driver in the catalog.
- The admin form renders one input per field; records (e.g. generic HTTP `params`) fall back to a
  small JSON box, PEM keys to a textarea. Field labels come from `integrations.fields.<key>` (bn/en)
  when present, otherwise a humanized key; capability tabs are translated.
- On PATCH, a secret that is blank, missing or still masked keeps the stored value
  (`ProviderRegistryService.mergeKeptSecrets`, unit-tested). The update audit entry now also records
  mode, primary and whether the config changed (never the values).
- New connections start enabled, in sandbox mode, and *Primary* if they are the first for that
  capability.

**Alternatives.** Hand-written forms per driver (40 drivers — rejected: drifts from the schemas);
sending decrypted secrets to the edit form (rejected: secrets never leave the API, spec §4.1).


## 2026-11-17 — Product trash with permanent delete in the admin

**Context.** Deleting a product only soft-deletes it (`deletedAt` + `archived`), with no way to see,
restore or erase deleted products. A store owner who wants to clear the catalog and re-import, or
just remove junk for good, had to ask a developer to run SQL. The platform has to be operable by
the owner alone.

**Decisions.**
- The product list gets a *Trash* tab (`GET /admin/products/trash`). From there products can be
  restored (as drafts, never straight to live) or deleted permanently
  (`POST /admin/products/purge`). Bulk "Delete selected" on the catalog tab moves products to Trash.
- Permanent delete only accepts products already in Trash, needs a new `catalog.purge` permission on
  top of `catalog.manage`, and a typed confirmation word in the UI. Each erased product gets a
  `product.purge` audit entry (title and slug kept).
- Products whose variants appear on orders, purchase orders or stock transfers are never erased —
  those foreign keys are `onDelete: Restrict` on purpose. Trash marks them and purge reports them
  as kept. Everything else cascades in the database (variants, options, gallery links, stock levels
  and movements, reviews, questions, versions, cart lines). Media files stay in the media library.
- The system *Super Admin* role now implicitly holds every permission in `PERMISSIONS`
  (`StaffAuthGuard`). Its `role_permissions` rows are only written by the seed, so any permission
  added in a release (like `catalog.purge`) was missing for the owner until someone re-ran
  `pnpm db:seed` against production. Other roles still get exactly what is assigned to them.

**Alternatives.** A developer-only CLI purge (rejected: the owner must be able to do it from the
panel); hard delete straight from the catalog list (rejected: no undo for a misclick); also deleting
order-linked products (rejected: breaks order history and accounting); a migration or seed step to
grant new permissions to Super Admin (rejected: easy to forget on each release).


## 2026-11-17 — Owner-facing admin: forms instead of JSON, taka instead of poisha, names instead of ids

**Context.** Several milestones shipped admin screens as "honest MVPs": page-builder sections,
discount conditions, payment rules, segment rules, blog bodies, A/B variants and five settings were
raw JSON; collections, flash sales, bundles, price schedules, courier mappings, merges and
automation asked for database ids; product prices and many money fields were typed in poisha. The
platform is meant to be run by a clothing-brand owner without a developer, so these screens were
not usable by the intended user.

**Decisions.**
- Every owner-facing structured value gets a form. Page-builder blocks are described declaratively in
  `apps/admin/lib/block-fields.ts` (validated against `@clothing/blocks/schemas`, the API's own
  source of truth) and rendered by `components/block-form.tsx`; the same editor serves CMS pages,
  blog posts and A/B variants. Raw JSON remains only as a fallback for a block type with no form
  description and for the developer-facing config bundle.
- Records are picked by name: product, variant, customer, order, category, collection, location and
  staff pickers replace id inputs.
- Money is typed and shown in taka everywhere in the admin and converted to poisha at the edge;
  storage stays poisha (golden rule 3). Settings with `widget: "money"` render in taka.
- Datetime inputs are sent as ISO with the browser's offset, and payment-rule weekday/hour
  conditions use `locale.timezone`; hosting runs in UTC, six hours behind Bangladesh.
- PATCH schemas are built with `updateSchemaFrom()` so a toggle never resets unsent fields to their
  create-time defaults.

**Alternatives.** Generating forms from zod/JSON Schema for blocks (rejected: pickers and
taka/poisha conversion need per-field intent the schemas don't carry); keeping JSON with better help
text (rejected: owners still can't use it).

---

## 2026-11-17 — Storefront visual refresh: premium-fashion preset, fonts, shared tiles

**Context.** The storefront rendered in the browser's default sans-serif (no font was being served,
see M3 "deferred"), on pure white, with plain 2xl headings and identical grey-on-white product
cards. It read as a wireframe next to the quality of the product photography.

**Decisions.**
- **Fonts are now served** with `next/font/google` (self-hosted at build time). `theme.fontLatin` and
  `theme.fontBangla` pick the body pair (defaults Inter + Hind Siliguri, the pair suggested in
  "Still owed"); this closes the font-pair item. Headlines use a display serif — Instrument Serif for
  Latin with Noto Serif Bengali for Bangla glyphs — as part of the default look. Bangla headings are
  set one step smaller and Bangla body gets extra line height, because Bengali glyphs run larger and
  taller than Latin at the same size.
- **Tokens are overridden for the storefront only** (`apps/storefront/app/[locale]/globals.css`), so
  the admin keeps the neutral preset: a faintly warm surface/muted/border so photos sit on the page,
  a 4px radius, and a zari-gold `--color-accent` used only for hairline ornaments, focus rings and
  the FAQ marker, never for text. The brand color still comes from `theme.brandColor`.
- **One product tile.** `ProductTileContent` (in `@clothing/blocks`) now backs the product-grid and
  for-you blocks and the storefront `ProductCard`; it adds a percent-off tag computed from the two
  server prices and a two-line title. `SectionHeading` is the shared block heading.
- Hero text sits on a scrim tinted with the page color (bottom fade on phones, side fade from `sm`),
  so it stays legible over any photo and for light or dark brands. The footer is painted in the brand
  color.
- Product-grid and category-tile links now carry the `/en` prefix in English (the for-you block
  already did), so an English shopper is no longer sent to the Bangla page.

**Not done / follow-ups.** The display font is not yet an admin setting; a `theme.fontDisplay` option
(and a radius/accent token editor) belongs with the Design screen. Product cards still show one
photo — a second-image hover and quick-add are the next presentation step (§4.4.3).

**Alternatives.** Changing the shared `packages/config` preset (rejected: would restyle the admin);
per-block bespoke headings (rejected: three copies of the product card had already drifted).

---

## 2026-11-17 — Brand logo and favicon upload (navbar, footer, browser tab)

**Context.** `brand.logoLight`, `brand.logoDark` and `brand.favicon` existed as settings but the admin showed
them as plain text boxes and the storefront ignored them (`logoUrl={null}`; the footer had no logo at all).

**Decisions.**
- Admin → Settings → Brand: every `image` setting now uses the media picker (upload or choose from the
  library, preview shown whole on a light or dark plate). Pasting a link is off here, because settings save
  on every change. Bilingual help text states the file expectations.
- The navbar shows `brand.logoLight`, the footer (brand-colored background) shows `brand.logoDark`, the
  favicon comes from `brand.favicon`. Any that is unset falls back to the brand name as text, so a missing
  logo never leaves an empty header or a dark logo on a dark footer.
- SVG stays refused by the media API (no sanitizer, §12), so logos are transparent PNG/WebP.

**Not done.** PWA/app icons (`icon-192`, `icon-512`) are still generated from the brand color and initial;
they need a raster-friendly source (the library's WebP variants are not supported by the image renderer used there).

---

## 2026-11-17 — Admin shell: fixed sidebar, grouped menu, canvas look

**Context.** The admin shell was `min-h-screen` with a sidebar that was not height-bound, so the whole page
grew with the content and the sidebar scrolled away with it. The menu was one flat list of 65 links, no fonts
were loaded, and white cards sat on a white page.

**Decisions.**
- **The shell is one window tall (`h-dvh overflow-hidden`).** Only `<main>` scrolls; the sidebar keeps its
  brand header and account area pinned and scrolls just its menu. Under `lg` the sidebar becomes a drawer
  behind a top bar (Escape and the backdrop close it; it is `visibility:hidden` when closed so its links are
  not tab stops).
- **The menu is grouped** into nine sections plus Dashboard (`apps/admin/lib/admin-nav.ts`), collapsible and
  remembered per browser, with the section holding the current page always open, a "find a page" filter and
  longest-prefix active matching (`/orders/123` lights up Orders). Every previous link is kept; labels are
  bilingual `shell.*` keys.
- **Brand in the sidebar** comes from the public store config (name, `brand.logoLight`), so the admin is the
  store's own; "Admin" is the fallback. The notification bell moved to the sidebar header (icon + count) and a
  bn/English switch was added to the account area (the admin had none).
- **Look:** admin-only token overrides — a light canvas (`--color-canvas`) with white surfaces for cards,
  inputs and the sidebar, softer borders, Inter + Hind Siliguri via `next/font`, visible focus rings. Shared
  `Card/Button/TextField/Toggle/Banner` get a hairline shadow, hover/active feedback, a secondary button with a
  border, and a Toggle whose "off" track is visible on white.

**Not done.** Individual admin pages keep their own table/filter markup (about 150 tables); they pick up the
canvas, fonts and tokens but were not restyled one by one. A table/page-header component the pages could adopt
is the natural next step.

---

## 2026-11-22 — Payment and discount integrity fixes (audit)

**Context.** A code audit found ways to get goods without paying: the checkout accepted `paymentMethod: "mock"`
and a COD advance defaulted to `advanceMethod: "mock"`, and `PaymentsService` built a mock driver (which always
reports success) even when no mock provider was enabled. A gateway confirming a different amount was only
logged, single-use bulk codes were never checked for prior use, a payment arriving after its order expired was
silently dropped, and concurrent callbacks could credit one payment twice.

**Decisions.**
- **No mock fallback.** The mock gateway only runs when staff enabled a mock provider instance in admin.
  Checkout rejects any method not in `availableMethods()` (`PAYMENT_METHOD_UNAVAILABLE`), which also makes the
  `payment.codEnabled` setting authoritative server-side.
- **COD advance method** is the requested `advanceMethod` if enabled, else the first enabled online method not
  disabled by a payment rule; with none, the order is refused (`ADVANCE_PAYMENT_UNAVAILABLE`) rather than
  collected through a gateway that doesn't exist.
- **Amount mismatch** → the payment is marked failed, the order is not credited, an order event is written, a
  pending refund is opened for whatever the gateway did take, and staff with `orders.manage` are alerted.
- **Atomic settlement.** Payment rows are claimed with a conditional `updateMany` (`initiated|pending` only),
  and the order moves `pending_payment →` only via a conditional update. The expiry sweep claims the order the
  same way, so a payment and the sweep can't both win.
- **Late or duplicate payment** (order expired, cancelled or already moved) → the money is recorded in
  `paidTotal` and a pending refund opened for staff, instead of being dropped.
- **Bulk codes are single-use.** Rejected at pricing once `used_count ≥ 1`, and claimed `0 → 1` inside the
  order transaction (`CODE_ALREADY_USED` rolls the order back on a race). Releasing coupon usage on cancel now
  also decrements `discount.usedCount` and the bulk code's `used_count`.
- **Mock pay page** only redirects to the storefront's own origin (was an open redirect).

**Alternatives considered.** Keeping the mock fallback outside production only — rejected: `NODE_ENV` defaults
to `development`, so a misconfigured deploy would reopen the hole. A per-code `maxUses` column for bulk codes —
not needed yet; the spec describes them as single-use.

**Operational note.** A store that relied on the old behaviour (COD advance rules with no online gateway
enabled) will now see those orders refused until a real gateway is enabled in admin → Integrations.

---

## 2026-11-23 — Order bookkeeping, client IPs, OTP and 2FA hardening (audit, part 2)

**Context.** Follow-up to the 2026-11-22 audit fixes. (The audit's claim that loyalty points were never returned
on cancel was wrong: `LoyaltyService.reversalSweep` already gives them back — no change made there.)

**Decisions.**
- **Cancel / expiry reverse the order's bookkeeping** (`checkout/order-bookkeeping.ts`, inside the same
  transaction): the customer's `ordersCount`/`totalSpent` (web orders only — the only channel that increments
  them; clamped at 0), flash-sale `sold_count` (order lines now keep `flashSaleItemId` in `optionsSnapshot`), and
  coupon usage with its counters. Cancel follows `orders.releaseCouponUsageOnCancel`; an order that expires
  unpaid always releases its coupons, since it never really happened.
- **Everything an order records is written inside its transaction:** discount usage, flash-sale sold count,
  duplicate links, cart conversion and the customer counters. Staff alerts and purchase tracking stay outside,
  best effort, and now run only after the payment page opened.
- **Payment page fails to open** → the order is cancelled by the system (stock, tenders, coupons, counters
  back), the cart is reactivated, and the customer gets `PAYMENT_START_FAILED` and can simply retry. Previously
  the order sat in `pending_payment` with an emptied cart and no way to pay.
- **`TRUST_PROXY` env (default 1)** sets Express `trust proxy`, so `req.ip` is the client, not the platform
  proxy. Render alone is 1 hop; requests reaching the API through the storefront/admin Next.js `/api` rewrite on
  Vercel are 2. Not guessed higher by default: too many hops lets a client spoof `X-Forwarded-For` (and with it
  the staff IP allowlist).
- **OTP:** a per-IP send limit (`auth.otpMaxSendsPerIpPer10Min`, default 10, admin-editable; new
  `otp_codes(ip, created_at)` index). Attempts are claimed atomically *before* the code is compared, and a code
  is consumed with a conditional update, so parallel requests can't exceed the attempt limit or reuse a code.
  OTP now sends through `NotificationDriversService.resolveSms()` — the gateway configured in admin — instead of
  the M5 `SmsProvidersService`, which always resolved to the mock driver (real customers never received a code).
  `devCode` is returned only when the active driver is the mock **and** `NODE_ENV` isn't production.
- **2FA:** `POST /auth/totp/setup` is refused while 2FA is on (`TOTP_ALREADY_ENABLED`); it used to replace the
  secret and switch 2FA off immediately, without a code.

**Alternatives considered.** A global request rate limiter — deferred: the free-tier stack has no shared store
(golden rule 8), and an in-memory limiter is per instance. Keeping post-order writes outside the transaction
with retries — rejected; a single transaction is simpler and the writes are small.

**Operational note.** Set `TRUST_PROXY=2` on Render once it is confirmed that storefront/admin traffic reaches
the API through the Vercel rewrite with the client in `X-Forwarded-For`. Apply the new migration
(`pnpm db:migrate:deploy`) — the index is not required for correctness, only for the per-IP count's speed.

---

## 2026-11-24 — Medium audit items

**Context.** The remaining medium items from the 2026-11-22 audit. Two of them turned out not to be real: the
storefront already sends a CSP and security headers from `apps/storefront/proxy.ts` (the audit only looked at
`next.config.mjs`), and the CORS `origin: true` fallback could never trigger because `STOREFRONT_URL`/`ADMIN_URL`
are required by `env.schema.ts`. The OTP-attempt and expiry/payment races were already fixed on 2026-11-22/23.

**Decisions.**
- **JSON-LD** is written with `serializeJsonLd` (`apps/storefront/lib/theme.ts`), which escapes `<`, `>`, `&`,
  U+2028/2029 — a product name containing `</script>` can no longer break out of the tag. The brand color is
  only used when it is a plain hex color (`safeHexColor`), since it lands in an inline `<style>`.
- **CORS** falls back to `false` instead of reflecting any origin — belt and braces, given the env validation.
- **Idempotency-key race:** the request that loses the unique index on `orders.idempotency_key` now gets the
  winner's order back (a replay) instead of a 500. Its own transaction has already rolled back.
- **Review "helpful" votes:** one per visitor per review (`review_helpful_votes`, unique `(review_id,
  voter_key)`; voter = customer id or the anonymous-id cookie), approved reviews only, and the endpoint returns
  just the count — it used to return the whole review row, including pending/rejected ones.
- **2FA login ticket** is a signed, stateless token (HMAC, key derived from `APP_ENCRYPTION_KEY`) instead of an
  in-memory map that every restart (free-tier spin-down) emptied. Because a ticket can now be presented more than
  once within its 5 minutes, wrong 2FA codes count toward the account's login lockout, and a locked or disabled
  account is refused at the 2FA step.

**Alternatives considered.** A DB table for login tickets — rejected: the signed token needs no migration and the
lockout bounds guessing. Clearing a guest's cookie gives them another helpful vote; acceptable for a "helpful"
counter (a sign-in requirement would cost far more real votes than it stops fake ones).

**Found, not fixed:** the storefront never renders a Turnstile widget, so turning on `checkout.turnstileEnabled`
makes every checkout fail with `CAPTCHA_REQUIRED` — leave it off until the widget is built.

**Operational note.** Apply migration `20261124090000_review_helpful_votes` (`pnpm db:migrate:deploy`) before or
right after deploying; until then the helpful button returns an error (nothing else is affected).
