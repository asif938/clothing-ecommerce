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
