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

## Still owed (tracked here so they are not forgotten)

- BD location dataset source (divisions/districts/upazilas/thanas + Dhaka city
  areas) and its license — due when §5.2 is implemented (M1/M2).
- The two named BD SMS gateway drivers — due when §10.3 is implemented (M7).
- PDF rendering approach for invoices/labels on the free tier
  (Playwright/Chromium vs. `@react-pdf/renderer`) — due when §6.8/§8.2
  fulfillment (invoices, labels) is implemented (M6).
- Font pair for Bangla + Latin (default suggestion: Hind Siliguri + Inter) —
  due when the theme system is implemented (M3).
