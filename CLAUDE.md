# CLAUDE.md

## Project summary

A white-label, production-grade e-commerce platform for clothing brands
selling in Bangladesh (BDT, Bangla + English, COD-first, mobile banking,
local couriers, SMS/WhatsApp notifications). Three apps on one backend:
`apps/storefront` (shoppers), `apps/admin` (staff), `apps/api` (NestJS,
all business logic and integrations). One codebase, single-tenant per
deployment, reusable for any clothing brand via a setup wizard and config
export/import — no code changes per brand. Full scope is specified in
`docs/PROJECT_SPEC.md`; it is built milestone by milestone (§16), currently
starting Milestone 5. Check `docs/PROGRESS.md` before starting work to see
exactly what exists.

## Golden rules

1. **No hardcoded brand or content.** No brand name, logo, color, phone
   number, address, text copy, banner, menu item, policy text, price rule,
   delivery fee, or message template may be hardcoded in UI code. All of it
   comes from the database via settings, CMS, or UI strings, and is editable
   in the admin panel. Code may contain only *default seed values* (spec
   §17) and developer-facing fallbacks.
2. **Every integration is a provider behind an interface,** toggleable and
   configurable from the admin panel, with a mock driver. No feature may
   hard-depend on a specific vendor.
3. **Money is stored as integers in poisha** (1 BDT = 100 poisha). Never use
   floating point for money.
4. **Bangla and English everywhere.** Every customer-facing text field is
   localized (spec §4.5). The admin UI is bilingual too.
5. **Mobile-first.** Design and test every storefront screen at 360px width
   first.
6. **Server-side validation is authoritative.** Validate with shared zod
   schemas; never trust the client for prices, discounts, stock, or shipping
   fees.
7. **Every admin mutation is permission-checked and audit-logged.**
8. **Free-tier friendly.** The system must run on the free-tier stack (spec
   §15) — no mandatory Redis, no mandatory separate search server — and move
   to a VPS by configuration only.
9. **TypeScript strict mode, no `any`** except at well-commented integration
   boundaries.
10. **Write tests alongside features** (spec §14). Business rules in spec
    §6 must have unit tests.

## Working mode

- Work continuously, milestone after milestone (spec §16), without pausing
  for approval between milestones.
- When something is ambiguous, pick the most reasonable option consistent
  with the principles above, implement it so it's changeable from the admin
  panel where possible, and record the decision in `docs/DECISIONS.md`
  (date, context, decision, alternatives).
- Only stop and ask if continuing requires something unobtainable (e.g. real
  merchant credentials) *and* no mock/sandbox path exists. Missing
  credentials are not a blocker — every integration has a mock driver.
- After each milestone: update `docs/PROGRESS.md`, commit with a
  Conventional Commits message, and push.

## Commands

```bash
pnpm install              # install all workspace dependencies
pnpm dev                  # run storefront (:3000), admin (:3001), api (:4000)
pnpm dev:storefront        # just the storefront
pnpm dev:admin              # just the admin panel
pnpm dev:api                # just the API
pnpm build                 # build all apps/packages (Turborepo)
pnpm lint                  # ESLint across the workspace
pnpm typecheck              # tsc --noEmit across the workspace
pnpm test                   # unit tests (Vitest) across the workspace
pnpm test:integration        # API integration tests (Postgres service container)
pnpm e2e                      # Playwright end-to-end tests

pnpm db:generate            # regenerate the Prisma client
pnpm db:migrate              # create/apply a dev migration
pnpm db:migrate:deploy        # apply migrations (CI/production)
pnpm db:seed                   # base data only (roles, permissions, BD locations, defaults)
pnpm db:seed:demo                # + the "Demo Fashion" demo brand/catalog/orders

pnpm sdk:generate                 # regenerate packages/sdk from the API's OpenAPI document

docker compose -f infra/compose/docker-compose.dev.yml up -d   # Postgres, MinIO, MailHog
```

## Pointer

Full specification, confirmed decisions, domain model, business rules, and
the milestone plan: [`docs/PROJECT_SPEC.md`](docs/PROJECT_SPEC.md). Decision
log: [`docs/DECISIONS.md`](docs/DECISIONS.md). Build status:
[`docs/PROGRESS.md`](docs/PROGRESS.md).
