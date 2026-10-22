# Fashion Commerce Platform — Full Project Specification

> **Audience:** Claude Code (implementing agent) and the project owner.
> **Status:** Approved requirements, v1.0 — 22 Oct 2026.
> **Product:** A white-label, production-grade e-commerce platform for clothing brands selling in Bangladesh. The first deployment is for one large, online-only clothing brand; the same codebase must be reusable for any other brand without code changes.

---

## Table of contents

0. [Instructions for Claude Code](#0-instructions-for-claude-code)
1. [Product summary and core principles](#1-product-summary-and-core-principles)
2. [Confirmed decisions](#2-confirmed-decisions)
3. [Architecture and tech stack](#3-architecture-and-tech-stack)
4. [Platform foundations: settings, providers, white-label, i18n](#4-platform-foundations)
5. [Domain model](#5-domain-model)
6. [Business rules](#6-business-rules)
7. [Storefront specification](#7-storefront-specification)
8. [Admin panel specification](#8-admin-panel-specification)
9. [CMS specification](#9-cms-specification)
10. [Integrations](#10-integrations)
11. [API design](#11-api-design)
12. [Security](#12-security)
13. [Performance, SEO and analytics](#13-performance-seo-and-analytics)
14. [Testing and quality](#14-testing-and-quality)
15. [Deployment and environments](#15-deployment-and-environments)
16. [Milestone plan](#16-milestone-plan)
17. [Default values](#17-default-values)
18. [Out of scope and open items](#18-out-of-scope-and-open-items)

---

## 0. Instructions for Claude Code

Read this entire document before writing any code. It is the single source of truth.

### 0.1 Working mode

- **Work continuously.** The owner has asked you to keep going milestone after milestone without stopping for review. Do not pause to ask for approval between milestones.
- **When something is ambiguous,** choose the most reasonable option that is consistent with the principles in section 1, implement it so it can be changed from the admin panel where possible, and record the decision in `docs/DECISIONS.md` (date, context, decision, alternatives).
- **Only stop and ask** if continuing would require something you cannot obtain (for example real merchant credentials) *and* no mock/sandbox path exists. Missing credentials are **not** a blocker: every integration has a mock driver (see 4.3).
- Follow the milestone order in section 16. A milestone is done only when every acceptance criterion is met and CI is green.
- After each milestone: update `docs/PROGRESS.md` (what was built, what is left, known issues), commit with a conventional commit message, and push.

### 0.2 First actions (Milestone 0)

1. Create the monorepo described in 3.2.
2. Create `CLAUDE.md` at the repo root containing: a one-paragraph project summary, the "golden rules" from 0.3, the commands (dev, build, test, lint, db migrate, seed), and a pointer to `docs/PROJECT_SPEC.md`.
3. Copy this file to `docs/PROJECT_SPEC.md`. Never delete requirements from it; if a requirement changes, mark it as changed and record why in `docs/DECISIONS.md`.

### 0.3 Golden rules (put these in CLAUDE.md)

1. **No hardcoded brand or content.** No brand name, logo, color, phone number, address, text copy, banner, menu item, policy text, price rule, delivery fee, or message template may be hardcoded in UI code. All of it comes from the database via settings, CMS, or UI strings, and is editable in the admin panel. Code may contain only *default seed values* (section 17) and developer-facing fallbacks.
2. **Every integration is a provider behind an interface,** toggleable and configurable from the admin panel, with a mock driver. No feature may hard-depend on a specific vendor.
3. **Money is stored as integers in poisha** (1 BDT = 100 poisha). Never use floating point for money.
4. **Bangla and English everywhere.** Every customer-facing text field is localized (see 4.5). The admin UI is bilingual too.
5. **Mobile-first.** Design and test every storefront screen at 360px width first.
6. **Server-side validation is authoritative.** Validate with shared zod schemas; never trust the client for prices, discounts, stock, or shipping fees.
7. **Every admin mutation is permission-checked and audit-logged.**
8. **Free-tier friendly.** The system must run on the free-tier stack in section 15 (no mandatory Redis, no mandatory separate search server), and move to a VPS by configuration only.
9. **TypeScript strict mode, no `any`** except at well-commented integration boundaries.
10. **Write tests alongside features** (section 14). Business rules in section 6 must have unit tests.

### 0.4 Conventions

- Package manager: `pnpm`. Monorepo tool: Turborepo.
- Node.js: current LTS at implementation time. Use the latest stable major versions of all libraries at implementation time and pin them.
- Code style: ESLint + Prettier, shared config in `packages/config`.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:` …).
- Naming: database tables `snake_case` plural; TypeScript `camelCase`/`PascalCase`; API paths `kebab-case`.
- Dates stored in UTC; displayed in the store time zone setting (default `Asia/Dhaka`).

---

## 1. Product summary and core principles

### 1.1 What we are building

Three applications sharing one backend:

| App | Users | Purpose |
| --- | --- | --- |
| **Storefront** | Shoppers (guest and registered) | Browse, search, buy clothing; track orders; manage account, returns, wishlist, loyalty |
| **Admin panel** | Brand staff (owner, managers, catalog, call centre, warehouse, marketing, content) | Manage everything: catalog, inventory, orders, shipping, payments, customers, promotions, content, design, settings, reports, automation |
| **API** | Both apps above, plus webhooks from providers | All business logic, data, integrations, background jobs |

### 1.2 Core principles

1. **Admin-managed everything.** A non-technical owner must be able to run and restyle the entire site from the admin panel: content, layout, theme, menus, pages, prices, shipping, payment rules, messages, integrations, AI providers, staff, and policies.
2. **White-label.** One codebase, any clothing brand. A new brand is a new deployment plus the setup wizard; no code edits (see 4.4).
3. **Bangladesh-first commerce.** BDT, Bangla + English, COD as the default payment, mobile banking (bKash, Nagad), local couriers (Steadfast, Pathao, RedX), SMS-first notifications, phone-number identity, fake-order protection.
4. **Clothing-specific.** Flexible variants (size, color, fit, or no size at all), size charts, size guidance, lookbooks, seasonal collections (Eid, Puja, Pohela Boishakh, winter), exchange-heavy returns.
5. **Fast on cheap phones and slow networks.** Performance budgets in 13.1.
6. **Pluggable and degradable.** If a provider is disabled or down, the site keeps working (for example, if online payment is down, COD still works; if SMS is down, orders are still placed and the message is retried).
7. **Phased delivery.** The full scope is specified here and is built in phases (section 16). Data models should anticipate later phases so later work does not require destructive migrations.

### 1.3 Users and roles

Customer types: **Guest**, **Registered customer**.

Staff roles (seeded, editable; custom roles can be created):

| Role | Default scope |
| --- | --- |
| Super Admin | Everything, including staff, roles, integrations, danger-zone settings |
| Manager | Everything except staff/roles and integration credentials |
| Catalog Executive | Products, categories, attributes, inventory, media |
| Order / Call Executive | Orders (view, confirm, edit, notes), customers (limited view), returns |
| Warehouse / Packer | Pick/pack lists, invoices, labels, shipments, return receiving, stock movements |
| Marketing | Promotions, coupons, banners, CMS, SEO, campaigns, segments, reports (marketing) |
| Content Editor | CMS pages, blog, media, UI strings (draft only unless also Publisher) |

Permissions are granular strings (`orders.read`, `orders.update`, `orders.confirm`, `products.cost_price.read`, `settings.integrations.write`, …). Roles are sets of permissions. Field-level permissions exist for sensitive fields (cost price, profit, customer full phone number).

---

## 2. Confirmed decisions

These were confirmed with the owner. Do not change them without recording a decision.

| Topic | Decision |
| --- | --- |
| Market | Bangladesh only. Currency BDT. Online-only (no physical store / POS). |
| Scale | Large catalog (design for 10,000+ variants), high traffic during campaigns. |
| Stack | Custom: Next.js (storefront + admin), NestJS API, PostgreSQL, Prisma. Own CMS (no third-party CMS). |
| Repository | Monorepo (Turborepo + pnpm). |
| Hosting | Start on free-tier services; must be movable to a VPS (Docker) later by configuration. See section 15. |
| Scope | All phases, built milestone by milestone (section 16). |
| Delivery fee | Configurable rules combining: flat inside/outside Dhaka (which may also be the same amount), extra charge by weight, free above an order amount, and zone-specific rates. All managed in admin. |
| COD / advance payment | Fully rule-based from admin (by amount, area, risk score, customer history, product, etc.). |
| Returns / exchange | Fully configurable in admin (window days, refund allowed, exchange allowed, who pays delivery). **Plus doorstep rejection:** if the customer does not like the product at delivery, they return it to the delivery person immediately and pay only the delivery charge. |
| VAT | Not applied now. Keep a disabled VAT setting (inclusive/exclusive, rate) for later. |
| Categories | Men, Women, Kids, Accessories at launch; category tree fully admin-managed. |
| Variants | Admin-defined options per product (size, color, fit, sleeve, anything), including single-variant "free size / one size" products. |
| Size systems | Admin-managed: letter (S–XXL), numeric (38, 40, 42…), kids by age, free size, or any custom system. |
| Customer login | Phone OTP + Google sign-in (no passwords for customers). |
| Checkout | Guest checkout allowed. OTP verification at checkout is an admin setting: off / all orders / only orders matching risk rules. |
| Design | Created by Claude Code (no Figma). Direction from the reference sites in 7.1. Must be themeable from admin. |
| Data migration | None. Fresh start; products enter via admin and CSV/Excel import. |
| Warehouses | One at launch; data model and code support multiple locations. |
| Admin language | Bangla + English, per-user choice. |
| Merchant accounts | None exist yet (payment, courier, SMS). Build all integrations with mock and sandbox modes; switch to live from admin when credentials arrive. |
| WhatsApp | Both: simple click-to-chat button, and WhatsApp Business (Cloud) API messaging. Admin chooses which is active. |
| AI | Multi-provider: Anthropic, OpenAI, Google Gemini (and extensible). Provider and model selectable per AI feature from admin. |
| Policy texts | Provided by the owner later. Create placeholder pages flagged "needs content". |
| Reuse for other brands | Required. See 4.4. |

---

## 3. Architecture and tech stack

### 3.1 System overview

```
 Shoppers (mobile web / PWA)          Staff (admin web / PWA)
            │                                   │
            ▼                                   ▼
   apps/storefront (Next.js)           apps/admin (Next.js)
   SSR + ISR, bn/en, SEO               Client-heavy SPA-like UI
            │                                   │
            └──────────────┬────────────────────┘
                           ▼
                 apps/api (NestJS, REST /api/v1)
       ┌──────────┬────────┴─────────┬──────────────┬───────────────┐
       ▼          ▼                  ▼              ▼               ▼
  PostgreSQL   Job queue        Object storage   Cache           Providers
  (Prisma)     (pg-boss on      (S3-compatible:  (in-memory;     (payments, couriers,
               Postgres;        Cloudflare R2;   Redis optional) SMS, email, WhatsApp,
               BullMQ optional) local disk dev)                  AI, tracking, search…)
```

- Storefront and admin never touch the database directly. They call the API through a typed SDK (`packages/sdk`) generated from the API's OpenAPI document.
- The storefront uses Next.js server components to fetch from the API at render time, with ISR/tag-based caching. The API calls the storefront's revalidation endpoint when content, products, prices, or settings change.
- Background work (notifications, courier sync, tracking events, feeds, reports, AI jobs, scheduled publishing, abandoned carts) runs through the job queue, processed by a worker inside the API process (free tier) or a separate worker process (VPS), controlled by `WORKER_MODE=embedded|separate`.

### 3.2 Monorepo layout

```
/
├─ apps/
│  ├─ storefront/        Next.js App Router — public site
│  ├─ admin/             Next.js App Router — admin panel
│  └─ api/               NestJS — REST API, webhooks, workers, cron
├─ packages/
│  ├─ db/                Prisma schema, migrations, seed scripts, BD location data
│  ├─ shared/            zod schemas, types, enums, money/phone/date utils, permission list, settings registry
│  ├─ sdk/               generated typed API client (from OpenAPI)
│  ├─ ui/                shared React primitives used by both apps (buttons, inputs, icons, money/date formatters)
│  ├─ blocks/            CMS block definitions: schema (zod), default props, admin form metadata, storefront React components
│  ├─ email-templates/   React Email templates (rendered with DB-provided content)
│  └─ config/            eslint, prettier, tsconfig, tailwind preset
├─ infra/
│  ├─ docker/            Dockerfiles for api, storefront, admin
│  ├─ compose/           docker-compose.vps.yml (+ Caddy), docker-compose.dev.yml
│  └─ scripts/           backup/restore, deploy helpers
├─ docs/                 PROJECT_SPEC.md, DECISIONS.md, PROGRESS.md, ADMIN_GUIDE.md, DEPLOYMENT.md
├─ e2e/                  Playwright tests
├─ CLAUDE.md
└─ turbo.json, pnpm-workspace.yaml, .env.example
```

### 3.3 Tech stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript (strict) | Everywhere |
| Storefront | Next.js App Router, React Server Components, Tailwind CSS | ISR + on-demand revalidation by cache tags |
| Admin | Next.js App Router, Tailwind, shadcn/ui (Radix), TanStack Query, TanStack Table, React Hook Form + zod, dnd-kit (drag-and-drop), Tiptap (rich text), Recharts (charts) | |
| i18n | next-intl (both apps) | Locales `bn`, `en`; default from settings |
| API | NestJS, nestjs-zod (DTOs from shared zod schemas), @nestjs/swagger (OpenAPI), Pino logger | |
| ORM / DB | Prisma + PostgreSQL 16+ | Extensions: `pg_trgm`, `unaccent` (if available), `citext` |
| Jobs | pg-boss (Postgres-backed) by default; BullMQ driver when `REDIS_URL` is set | Behind a `QueueService` interface |
| Cache | In-memory LRU by default; Redis when `REDIS_URL` set | Behind a `CacheService` interface |
| Search | PostgreSQL full-text + trigram (default); Meilisearch driver (optional) | Behind `SearchProvider` |
| Files | S3-compatible (Cloudflare R2 recommended); local disk driver for dev | Behind `StorageProvider` |
| Images | sharp (resize, WebP/AVIF, blur placeholder) at upload time; responsive `srcset` | Pre-generate sizes: 160, 320, 480, 640, 960, 1280, 1920 |
| Auth | Customers: phone OTP + Google OAuth, JWT access (15 min) + rotating refresh token in httpOnly cookie. Staff: email + password (argon2) + mandatory TOTP 2FA, server-side sessions | |
| PDF | Invoices/labels via HTML templates rendered to PDF (Playwright/Chromium in VPS mode; `@react-pdf/renderer` fallback in serverless/free mode) | Choose one that works on free tier; record decision |
| Email | React Email templates + provider adapters | |
| Testing | Vitest (unit), Supertest (API integration), Playwright (E2E), Testcontainers or a CI Postgres service | |
| Monitoring | Sentry (optional, toggled by env), structured logs, `/health` and `/ready` endpoints | |
| CI | GitHub Actions: lint, typecheck, unit, integration, build, E2E (smoke) | |

### 3.4 API module structure (NestJS)

One Nest module per bounded context:

`auth`, `staff`, `rbac`, `audit`, `settings`, `setup-wizard`, `i18n` (UI strings), `media`, `catalog` (products, variants, options, attributes, categories, collections, size systems, size charts), `inventory`, `search`, `pricing` (price lists, scheduled prices), `cart`, `checkout`, `shipping`, `payment-rules`, `payments`, `orders`, `fulfillment` (pick/pack, shipments), `couriers`, `returns`, `customers`, `addresses` (incl. BD locations), `reviews`, `wishlist`, `notify-me`, `promotions` (discounts, coupons, flash sales, bundles), `loyalty`, `gift-cards`, `store-credit`, `referrals`, `affiliates`, `risk` (fraud scoring, blocklist), `notifications` (templates, dispatch, logs), `messaging` (SMS, email, WhatsApp providers), `cms` (pages, blocks, menus, theme, popups, announcement bars, blog, FAQ, redirects), `seo` (sitemaps, feeds), `tracking` (Meta CAPI, GA4 MP, TikTok Events), `ai` (providers, features, usage), `automation` (rules, runs), `approvals`, `reports`, `finance` (COD reconciliation, settlements, expenses), `procurement` (suppliers, purchase/production orders, materials, BOM), `support` (inbox, tickets), `webhooks` (inbound provider webhooks, outbound webhooks), `api-keys`, `jobs` (queue, scheduler), `health`.

Each module: `controller(s)` (store and/or admin), `service`, `repository` (Prisma access), `dto` (re-exported zod schemas), `events` (domain events emitted via an in-process event bus; listeners enqueue jobs).

---

## 4. Platform foundations

These four foundations make "manage everything from admin" and "reuse for any brand" possible. Build them in Milestone 1, before any feature.

### 4.1 Settings registry

A single typed registry in `packages/shared/settings` declares every configurable setting.

```ts
defineSetting({
  key: 'shipping.freeDeliveryThreshold',
  group: 'shipping',            // admin settings section
  type: z.number().int().min(0).nullable(), // poisha; null = disabled
  default: null,
  label: { bn: 'ফ্রি ডেলিভারির ন্যূনতম অর্ডার', en: 'Free delivery minimum order' },
  help:  { bn: '…', en: '…' },
  secret: false,                // true => encrypted at rest, never sent to clients, write-only in UI
  public: true,                 // true => included in storefront public config payload
  permission: 'settings.shipping.write',
  ui: { widget: 'money' },      // money | text | textarea | localizedText | select | toggle | color | image | json | code
});
```

Rules:
- Stored in table `settings (key PK, value JSONB, updated_by, updated_at)`. Missing keys fall back to `default`.
- Secrets (API keys, tokens) are encrypted with AES-256-GCM using `APP_ENCRYPTION_KEY` from the environment. The admin shows them as `••••1234` with "replace" and "test connection" actions.
- The admin Settings area is **generated from the registry** (grouped tabs, widgets, validation, help text), so adding a setting never needs custom UI.
- The API exposes `GET /store/config` with all `public` settings (brand, theme tokens, locales, contact, feature toggles, tracking IDs). Cached and tagged; invalidated on change.
- Every change is audit-logged with old and new values (secrets masked).
- **Environment variables are only for infrastructure**: database URL, encryption key, storage bucket credentials, public URLs of the three apps, revalidation secret, Sentry DSN, optional Redis URL, optional Meilisearch URL. Everything else lives in settings.

### 4.2 Feature toggles

Every non-core feature has a toggle setting (`features.loyalty.enabled`, `features.reviews.enabled`, `features.preorder.enabled`, `features.giftCards.enabled`, …). When off: the storefront hides its UI, the API rejects its endpoints with `FEATURE_DISABLED`, and the admin shows the module with an "enable" prompt.

### 4.3 Provider framework

Every external service is a **provider** implementing a typed interface. Providers are registered in a `ProviderRegistry` per capability.

| Capability | Interface (key methods) | Drivers to implement |
| --- | --- | --- |
| Payment | `createPayment`, `verifyCallback`, `queryStatus`, `refund` | `cod` (built-in), `sslcommerz`, `bkash` (tokenized checkout), `nagad`, `mock` |
| Courier | `quote?`, `createParcel`, `getStatus`, `cancel`, `parseWebhook`, `getCodSettlement?` | `steadfast`, `pathao`, `redx`, `manual` (no API), `mock` |
| SMS | `send(to, text, { unicode })`, `balance?` | `generic_http` (configurable URL/params template for any BD gateway), 2 named BD gateways (choose two widely used ones and implement from their current official docs), `mock` |
| Email | `send({ to, subject, html, text })` | `smtp`, `brevo`, `resend`, `mock` |
| WhatsApp | `sendTemplate`, `sendText`, `parseWebhook` | `click_to_chat` (link only, no API), `whatsapp_cloud` (Meta Cloud API), `mock` |
| AI | `generateText`, `generateStructured(schema)`, `vision?`, `embed?` | `anthropic`, `openai`, `gemini`, `mock` |
| Storage | `put`, `get`, `delete`, `signedUrl`, `publicUrl` | `s3` (R2/S3/MinIO compatible), `local` |
| Search | `index`, `remove`, `search`, `suggest` | `postgres`, `meilisearch` |
| Captcha | `verify(token, ip)` | `turnstile`, `none` |
| Fraud check | `lookupPhone(phone) → { totalParcels, delivered, returned, sources }` | `internal` (own order history), `courier_history` (generic HTTP adapter for BD courier-success-ratio services), `mock` |
| Server-side tracking | `track(event)` | `meta_capi`, `ga4_mp`, `tiktok_events` |

Rules for all providers:
1. Each driver declares a zod **config schema** (fields, which are secret, sandbox/live mode). The admin "Integrations" screen is generated from it.
2. Each provider instance has: `enabled`, `mode` (`sandbox`/`live`), `priority`/`default`, config, and a **Test connection** action that calls a harmless endpoint and reports the result.
3. Calls go through a wrapper that adds timeouts, retries with backoff (idempotent calls only), circuit breaking, and logs to `provider_logs` (provider, operation, duration, status, redacted request/response, correlation id).
4. The `mock` driver simulates success, failure, and delay (configurable) so the full purchase/ship/notify flow can be demoed and tested with no credentials.
5. Inbound webhooks: `POST /webhooks/:capability/:driver/:instanceId`, signature-verified per driver, stored raw in `webhook_events` (deduplicated by provider event id) and processed by a job.

### 4.4 White-label (multi-brand reuse)

**Model:** single-tenant per deployment. One deployment = one brand = one database. A second brand gets its own deployment of the same code. (Rationale: simpler security and performance; no cross-brand data leakage. Record this in DECISIONS.md. Keep code free of brand assumptions so a future multi-tenant mode remains possible.)

Requirements:
1. **Setup wizard** (first run, when no Super Admin exists): create Super Admin → brand basics (name bn/en, legal name, logo light/dark, favicon, default locale, phone, email, address, social links) → theme preset and brand colors/fonts → shipping defaults → payment methods → finish. Everything can be changed later.
2. **Theme system:** design tokens (colors, radii, font families, font sizes scale, spacing density, button style, card style, header style, product-card style) stored as settings, emitted as CSS variables on `:root` by the storefront layout. Tailwind is configured to use these CSS variables. Ship **3 theme presets** (e.g. "Minimal", "Classic", "Bold") inspired by the references in 7.1; admin can start from a preset and customize.
3. **Layout variants:** header (centered logo / left logo / with mega menu / minimal), footer (columns / compact), product card (standard / with hover image / with quick-add), product page (gallery left / gallery grid / sticky info). Selected in admin.
4. **Fonts:** choose from a curated list that supports both Bangla and Latin (e.g. Hind Siliguri, Noto Sans Bengali, Noto Serif Bengali, plus Latin pairs), or upload custom font files (WOFF2) to media.
5. **Config export/import:** admin can export settings, theme, menus, CMS pages, UI strings, message templates, categories/attributes (no orders/customers) as a JSON bundle, and import it into another deployment — used to bootstrap a new brand quickly.
6. **Demo seed:** `pnpm db:seed --demo` creates a fictional brand ("Demo Fashion") with sample categories, ~60 products with placeholder images, pages, menus, and orders so the site is testable end-to-end. `pnpm db:seed` (no flag) creates only required base data (roles, permissions, BD locations, default settings, default templates).
7. Domain-agnostic: all absolute URLs come from settings/env; no domain names in code.

### 4.5 Internationalization

- Locales: `bn` and `en`. Default locale and enabled locales are settings. URL strategy: locale prefix only for the non-default locale (e.g. default `bn` at `/`, English at `/en/...`), configurable.
- **Localized content fields** use a JSONB type `LocalizedText = { bn?: string; en?: string }`. Shared helper `t(field, locale)` falls back to the default locale, then to any available value. Applies to product titles/descriptions, category names, attribute/option labels, CMS content, menus, templates, SEO fields, etc.
- **UI strings** (button labels, error messages, microcopy) live in table `ui_strings (key, bn, en, updated_at)`, seeded from defaults in `packages/shared/i18n/defaults.ts`. Admin "UI Text" screen lists all keys with search and inline edit. Code references keys only.
- Numbers: setting to display Bangla digits (০-৯) or Latin digits in the `bn` locale. Currency display: `৳1,250` (configurable symbol position and thousands separator; support the Bangladeshi lakh grouping as an option).
- Dates: localized month names; store time zone setting.
- Admin: each staff user picks admin UI language.
- Missing translation report in admin (content and UI strings).

---

## 5. Domain model

This is the logical model. Design the exact Prisma schema from it. Conventions for every table unless stated otherwise: `id` (cuid2 or UUIDv7 string), `created_at`, `updated_at`; soft delete (`deleted_at`) for catalog, CMS, customers, staff; money fields are `Int` poisha (use `BigInt` only where totals may exceed 2^31); `LocalizedText` is JSONB. Add indexes for every foreign key, every status column used in lists, and every search/filter field listed in section 8.

### 5.1 System and staff

| Entity | Key fields |
| --- | --- |
| `settings` | key (PK), value JSONB, updated_by |
| `ui_strings` | key (PK), bn, en |
| `staff_users` | name, email (citext unique), password_hash, totp_secret (encrypted), totp_enabled, locale, avatar, status (active/disabled), last_login_at |
| `staff_sessions` | staff_user_id, token_hash, ip, user_agent, expires_at, revoked_at |
| `roles` | name, description, is_system |
| `role_permissions` | role_id, permission (string) |
| `staff_roles` | staff_user_id, role_id |
| `audit_logs` | actor_type (staff/system/customer/api_key), actor_id, action, entity_type, entity_id, before JSONB, after JSONB, ip, user_agent, created_at (append-only) |
| `approval_requests` | type (price_change, discount, refund, …), entity, payload, requested_by, status, decided_by, decided_at, reason |
| `notifications_admin` | staff_user_id (or role), type, title, body, link, read_at |
| `saved_views` | staff_user_id (or shared), module, name, filters JSONB, columns JSONB, sort |
| `api_keys` | name, key_hash, prefix, scopes[], last_used_at, revoked_at |
| `outbound_webhooks` | url, events[], secret (encrypted), enabled; `outbound_webhook_deliveries` (attempts, status) |
| `provider_instances` | capability, driver, name, enabled, mode, is_default, priority, config (encrypted JSONB) |
| `provider_logs` | provider_instance_id, operation, status, duration_ms, request/response (redacted), correlation_id |
| `webhook_events` | provider_instance_id, external_event_id (unique per provider), payload, status, processed_at, error |
| `jobs` | managed by pg-boss/BullMQ; plus `scheduled_tasks` (type, payload, run_at, status) for admin-visible schedules |

### 5.2 Locations (Bangladesh)

| Entity | Key fields |
| --- | --- |
| `divisions` | name LocalizedText, code |
| `districts` | division_id, name, code |
| `areas` | district_id, name (upazila/thana/city area), type, is_dhaka_city (bool), postcode? |

Seed all 8 divisions, 64 districts and their upazilas/thanas plus Dhaka city areas from a reliable open dataset (record the source and license in DECISIONS.md). Admin can add/rename/disable areas. Courier-specific area IDs are stored in `courier_area_mappings (area_id, courier_driver, external_id)`, with an admin tool to map or auto-match by name.

### 5.3 Catalog

| Entity | Key fields |
| --- | --- |
| `categories` | parent_id, name, slug (unique per locale strategy), description, image, banner, sort_order, is_active, seo, size_chart_id (default), attribute_set (which attributes apply) |
| `collections` | name, slug, description, image, banner, type (manual/automatic), rules JSONB (for automatic: conditions on tags/category/price/attributes/stock/date), sort_mode, is_active, starts_at, ends_at, seo |
| `collection_products` | collection_id, product_id, position (manual) |
| `attributes` | code, name, type (select/multiselect/text/number/boolean/color), is_filterable, is_visible_on_pdp, sort_order |
| `attribute_values` | attribute_id, value LocalizedText, slug, color_hex?, image?, sort_order |
| `size_systems` | name (Letter, Numeric, Kids age, Free size, custom), values ordered (e.g. XS…XXXL / 36…48 / 0-3M…14Y / "Free size") |
| `size_charts` | name, unit default (inch/cm), columns (measure names, LocalizedText), rows (size → measurements), how_to_measure (rich content + image), notes |
| `products` | title, slug, subtitle?, description (rich, LocalizedText), short_description, category_id (primary) + `product_categories` (additional), brand_label? (sub-brand/line), tags[], status (draft/active/archived/scheduled), published_at, unpublish_at, product_type (standard / bundle / gift_card / preorder), size_chart_id, care_instructions, fabric (or via attributes), model_info (e.g. "Model is 5'10\", wears M"), video_url?, seo, is_featured, sort_weight, requires_shipping, weight_grams default, hs_code?, search_document (tsvector, generated), rating_avg, rating_count, sales_count (denormalized) |
| `product_attribute_values` | product_id, attribute_id, attribute_value_id / value_text / value_number |
| `product_options` | product_id, name LocalizedText (e.g. Size, Color, Fit), type (size/color/generic), size_system_id?, position |
| `product_option_values` | product_option_id, value LocalizedText, color_hex?, swatch_image?, position |
| `product_variants` | product_id, sku (unique), barcode?, option_value_ids[] (combination), price, compare_at_price?, cost_price (permission-protected), weight_grams?, is_active, position, image_ids[] |
| `product_media` | product_id, media_id, option_value_id? (e.g. images for a specific color), position, alt LocalizedText |
| `product_relations` | product_id, related_product_id, type (similar / complete_the_look / upsell / cross_sell), position |
| `price_schedules` | target (variant/product/collection/category/tag), new price or % change, starts_at, ends_at, revert_on_end, status, created_by |
| `product_versions` | product_id, snapshot JSONB, created_by (for history and rollback) |

Single-variant products ("free size"): product has zero options and exactly one variant.

### 5.4 Inventory and procurement

| Entity | Key fields |
| --- | --- |
| `stock_locations` | name, address, is_default, is_active, fulfills_online (bool) |
| `inventory_levels` | variant_id, location_id, on_hand, reserved, available (generated = on_hand − reserved), low_stock_threshold, bin_location? |
| `stock_movements` | variant_id, location_id, quantity (+/−), reason (sale, cancel, return_restock, damage, adjustment, transfer_in, transfer_out, purchase_receive, stock_take), reference_type, reference_id, note, actor |
| `stock_reservations` | variant_id, location_id, order_id or cart_id, quantity, expires_at, status |
| `stock_transfers` | from_location, to_location, status, items |
| `stock_takes` | location_id, status, counted items, variance report |
| `suppliers` | name, contact, phone, email, address, notes |
| `purchase_orders` | supplier_id, type (purchase/production), status (draft/sent/partially_received/received/cancelled), expected_at, items (variant_id, qty_ordered, qty_received, unit_cost), total_cost |
| `materials` (phase 3) | name, unit (yard/meter/piece), on_hand, cost |
| `bill_of_materials` (phase 3) | product_id or variant_id, material_id, quantity |

### 5.5 Customers

| Entity | Key fields |
| --- | --- |
| `customers` | phone (normalized E.164, unique, nullable for Google-only until phone added), name, email?, google_id?, gender?, birthday?, locale, tier_id?, points_balance, store_credit_balance, total_spent, orders_count, delivered_count, returned_count, rejected_at_door_count, risk_score, tags[], notes, marketing_consent_sms/email/whatsapp, status (active/blocked), referral_code, referred_by, first_utm, last_seen_at |
| `customer_sessions` | customer_id, refresh_token_hash, device, ip, expires_at, revoked_at |
| `otp_codes` | phone, purpose (login/checkout/change_phone), code_hash, attempts, expires_at, ip |
| `addresses` | customer_id, label (Home/Office), recipient_name, phone, alt_phone?, division_id, district_id, area_id, address_line, landmark?, is_default |
| `customer_measurements` (phase 2) | customer_id, height_cm, weight_kg, preferred_fit, chest/waist etc. optional |
| `wishlists` | customer_id or anonymous_id, variant_id/product_id |
| `notify_me_requests` | variant_id, phone/email, channel, status, notified_at |
| `reviews` | product_id, variant_id?, order_item_id (verified purchase), customer_id, rating 1-5, title, body, fit_feedback (small/true/large), media_ids[], status (pending/approved/rejected), admin_reply, helpful_count |
| `product_questions` | product_id, customer_id?, question, answer, status |
| `segments` | name, rules JSONB (filter on customer fields, order history, RFM), is_dynamic, member_count cache |

### 5.6 Cart, checkout, orders, payments

| Entity | Key fields |
| --- | --- |
| `carts` | customer_id? / anonymous_id, items (or `cart_items`), coupon_codes[], locale, utm, status (active/converted/abandoned), last_activity_at, recovery_sent_at[], contact phone/email (captured as soon as typed at checkout, for abandoned-cart recovery, only with consent setting) |
| `cart_items` | cart_id, variant_id, quantity, added_price (for change detection), bundle_id? |
| `orders` | order_number (human, unique, format from settings), customer_id?, channel (web/admin/phone/messenger/whatsapp), status, payment_status (unpaid/partially_paid/paid/partially_refunded/refunded), fulfillment_status (unfulfilled/partially_fulfilled/fulfilled/returned), currency, subtotal, discount_total, shipping_fee, shipping_discount, advance_required, advance_paid, cod_amount (amount to collect at door), total, paid_total, refunded_total, shipping_address snapshot (incl. division/district/area ids and names), billing_contact, customer_note, internal_notes (via events), risk_score, risk_reasons[], risk_level (low/medium/high), requires_review (bool), assigned_to (staff), confirmed_by/at, cancelled_reason, source attribution (utm_source, utm_medium, utm_campaign, utm_content, fbclid, gclid, ttclid, referrer, landing_page), ip, user_agent, device_id, idempotency_key, tags[] |
| `order_items` | order_id, variant_id, product snapshot (title, sku, options, image), unit_price, compare_at_price, quantity, discount_allocated, line_total, cost_price snapshot (protected), fulfilled_qty, returned_qty, rejected_qty |
| `order_discounts` | order_id, discount_id?, code?, type, amount, allocation details |
| `order_events` | order_id, type (status_change, note, call_attempt, edit, payment, shipment, notification_sent, risk_flag, …), data JSONB, actor (append-only timeline) |
| `payments` | order_id, provider_instance_id, method (cod/bkash/nagad/card/store_credit/gift_card), purpose (full/advance/balance), amount, status (initiated/pending/succeeded/failed/cancelled/expired), external_ref (trx id), raw (redacted), paid_at |
| `refunds` | order_id, payment_id?, amount, method (original/bkash_manual/nagad_manual/bank/store_credit), status, reason, approved_by, external_ref |
| `shipments` | order_id, location_id, courier_provider_instance_id, consignment_id, tracking_code, tracking_url, cod_amount, weight_grams, status (pending/booked/picked_up/in_transit/out_for_delivery/delivered/partially_delivered/returned_to_sender/rejected_at_door/cancelled/lost), delivery_charge_actual (courier cost), booked_at, delivered_at, items |
| `shipment_events` | shipment_id, status, raw_status, message, occurred_at |
| `returns` | order_id, type (refund/exchange/store_credit), status (requested/approved/rejected/pickup_scheduled/received/inspected/completed/cancelled), reason_code, customer_comment, media_ids[], resolution, return_shipping_paid_by (customer/brand), items (order_item_id, qty, condition, restock bool), exchange_order_id? |
| `invoices` | order_id, number, pdf_media_id, generated_at |

### 5.7 Shipping and payment rules

| Entity | Key fields |
| --- | --- |
| `shipping_zones` | name, priority, match: list of division/district/area ids and/or flag `dhaka_city`; is_active |
| `shipping_rates` | zone_id, name (shown to customer, LocalizedText), base_fee, included_weight_grams, extra_fee_per_step, weight_step_grams, free_over_amount?, min_order?, max_order?, conditions JSONB (e.g. product tags, categories), estimated_days_min/max, is_active, position |
| `payment_rules` | name, priority, is_active, conditions JSONB, actions JSONB, stop_processing (bool) |
| `courier_assignment_rules` (phase 2) | conditions (zone/district/weight/COD amount), courier instance, priority |

### 5.8 Promotions, loyalty, credit

| Entity | Key fields |
| --- | --- |
| `discounts` | name, type (code/automatic), code (citext unique for code type), value_type (percent/fixed/free_shipping/buy_x_get_y/bundle_price/tiered), value, conditions JSONB (min subtotal, min qty, categories/collections/products/tags included/excluded, customer segment/tier, first order only, channels, payment method), limits (total uses, per customer, per phone), combinable_with (other discounts / codes / automatic), priority, starts_at, ends_at, status, margin_guard_override (bool, permission) |
| `discount_codes` | discount_id, code (for bulk unique codes), used_count, assigned_to? |
| `discount_usages` | discount_id, code, order_id, customer_id, phone, amount |
| `flash_sales` | name, starts_at, ends_at, items (variant/product, sale price or %, stock cap), banner, countdown settings, status |
| `bundles` | name, products/variants with quantities, pricing (fixed bundle price / % off), "shop the look" media + hotspots |
| `loyalty_tiers` | name, min_spent or min_points, earn_multiplier, perks LocalizedText |
| `loyalty_transactions` | customer_id, points (+/−), reason (order_delivered, review, referral, redeem, expire, adjust), reference, expires_at |
| `store_credit_transactions` | customer_id, amount (+/−), reason (refund, cashback, gift_card, adjust, order_payment), reference |
| `gift_cards` | code (hashed + last4), initial_amount, balance, currency, expires_at, purchaser, recipient, status |
| `referrals` | referrer_customer_id, referee_customer_id, code, status, reward details |
| `affiliates` | name, code, coupon?, commission type/rate, payout info; `affiliate_conversions` (order_id, amount, status) |

### 5.9 CMS and content

| Entity | Key fields |
| --- | --- |
| `pages` | type (home/standard/landing/collection_story/policy/system), title, slug, status (draft/scheduled/published/archived), published_version_id, draft JSONB (blocks), seo, layout options (hide header/footer for landing), needs_content (bool), locked_by/at, publish_at, unpublish_at |
| `page_versions` | page_id, version, blocks JSONB, seo, created_by, note, published_at |
| `global_blocks` | name, block JSONB, used_in count (reusable blocks) |
| `menus` | location (header_main, header_mobile, footer_1…4, account), items tree JSONB (label LocalizedText, link type: category/collection/product/page/url, badge, image, columns, visibility rules) |
| `announcement_bars` | messages[] (LocalizedText, link, colors), rotation seconds, pages targeting, schedule, active |
| `popups` | type (newsletter/offer/exit_intent/custom), content blocks, trigger (delay/scroll/exit), frequency, pages, audience rules, schedule |
| `theme_presets` | name, tokens JSONB, layout variants JSONB; active preset + overrides live in settings |
| `seasonal_themes` | name, token overrides, banner set, schedule (auto-activate/deactivate) |
| `media_assets` | storage_key, url, mime, size_bytes, width, height, variants JSONB (generated sizes), blur_data_url, alt LocalizedText, focal_point {x,y}, folder_id, tags[], uploaded_by, checksum (dedupe) |
| `media_folders` | name, parent_id |
| `media_usages` | media_id, entity_type, entity_id, field (to show "where used" and block unsafe deletes) |
| `blog_posts` | title, slug, excerpt, body (blocks), cover, category, tags, author, status, publish_at, seo |
| `faq_groups` / `faq_items` | question/answer LocalizedText, group, position, show_on (pages/products) |
| `redirects` | from_path (unique), to_path, status_code (301/302), hits, is_auto |
| `message_templates` | channel (sms/email/whatsapp), event (order_placed, order_confirmed, shipped, out_for_delivery, delivered, cancelled, otp, abandoned_cart_1, abandoned_cart_2, back_in_stock, review_request, refund_processed, return_update, welcome, win_back, birthday …), locale, subject?, body (with variables), whatsapp_template_name?, is_active |
| `notification_logs` | channel, template, to, customer_id?, order_id?, provider_instance_id, status, error, cost?, sent_at |

### 5.10 Automation, AI, analytics, finance, support

| Entity | Key fields |
| --- | --- |
| `automation_rules` | name, trigger (event name or schedule), conditions JSONB, actions JSONB (add tag, set status, assign, send message, notify staff, create task, call webhook), is_active, run_count |
| `automation_runs` | rule_id, trigger payload, result, error |
| `ai_feature_configs` | feature (product_description, translation, alt_text, review_summary, chat_assistant, reply_suggestion, size_advice, seo_meta …), provider_instance_id, model, temperature, max_tokens, prompt_template (editable, versioned), enabled, monthly_budget? |
| `ai_usage_logs` | feature, provider, model, input_tokens, output_tokens, est_cost, latency_ms, status, actor |
| `analytics_events` | lightweight first-party events (session_id, customer_id?, type: page_view/product_view/add_to_cart/begin_checkout/purchase/search, product_id?, value, utm, device, created_at); partition or roll up daily |
| `daily_metrics` | date, metric rollups for dashboards (orders, revenue, AOV, conversion, by source) |
| `ad_spend` | date, platform (meta/google/tiktok), campaign_id, campaign_name, spend, impressions, clicks (CSV import first; API later) |
| `cod_settlements` | courier_instance, settlement_ref, period, total_collected, total_charges, net_amount, received_at, status; `cod_settlement_lines` (shipment_id, collected, charge, matched bool, variance) |
| `gateway_settlements` | provider, period, gross, fees, net, received_at |
| `expenses` | date, category, amount, note, attachment |
| `conversations` (phase 3) | channel (messenger/whatsapp/instagram/live_chat), external_id, customer_id?, assigned_to, status; `conversation_messages` |
| `tickets` | customer_id, order_id?, type, priority, status, assigned_to, sla_due_at, messages |
| `blocklist_entries` | type (phone/ip/device/email/address_keyword), value, reason, expires_at, created_by |
| `ab_tests` (phase 3) | target (block/banner/price/offer), variants, traffic split, metric, status, results |

---

## 6. Business rules

All rules here are implemented in the API as pure, unit-tested functions where possible (`packages/shared` or `apps/api/src/<module>/domain`). Every number shown as "default" is a setting (section 17).

### 6.1 Money and numbers

- Store and compute in integer poisha. Round only at defined points: percentage discounts round **down** to the nearest poisha per line, then the order total is rounded to whole taka using the `pricing.roundingMode` setting (default: round to nearest taka; show prices without decimals).
- Percentage discounts are allocated across eligible lines proportionally to line value; the last line absorbs remainder poisha so allocations sum exactly.

### 6.2 Phone numbers

- Accept `01XXXXXXXXX`, `+8801XXXXXXXXX`, `8801XXXXXXXXX`, with spaces/dashes, and Bangla digits. Normalize to E.164 `+8801XXXXXXXXX`.
- Valid BD mobile: `^\+8801[3-9]\d{8}$` (operator prefix list kept in settings so it can be updated).
- Display format setting (default `01XXX-XXXXXX`). Mask for restricted staff: `017XX-XXX123`.

### 6.3 Cart pricing pipeline

Executed server-side on every cart change and again at order placement (never trust client totals):

1. **Resolve lines:** variant active, product active, current price (apply active `price_schedules` and active `flash_sales`; flash sale price wins if lower; respect flash-sale stock caps).
2. **Stock check:** quantity ≤ available (across fulfilling locations). Over-quantity lines are clamped and flagged with a message.
3. **Automatic discounts:** evaluate active automatic discounts by priority; apply those whose conditions match; respect `combinable_with`.
4. **Code discounts:** validate each entered code (exists, active, dates, limits, per-customer/per-phone usage, conditions, combinability). Max number of codes per order: setting (default 1).
5. **Margin guard** (if `pricing.marginGuard.enabled`): if any line's net price after discounts falls below cost price × (1 + min margin %), block the discount for that line (or the whole discount, per setting) unless the discount has `margin_guard_override`.
6. **Subtotal after discounts.**
7. **Shipping fee** (6.4) using the selected/default address area and cart weight.
8. **Shipping discounts** (free-shipping discounts, free-over threshold).
9. **Gift card / store credit / loyalty points redemption** (if enabled and selected), capped by settings (e.g. max % of order payable by points).
10. **Payment rules** (6.5) → `advance_required`, allowed methods, OTP requirement.
11. **Totals:** `total = subtotal − discounts + shipping_fee − shipping_discount − credits`; `cod_amount = total − advance_paid` for COD.

The cart response includes a full breakdown, applied/rejected discounts with localized reasons, the free-delivery progress ("৳450 more for free delivery"), and warnings (price changed since added, stock reduced).

### 6.4 Shipping fee calculation

Input: destination area (or district/division), cart total weight (sum of variant weight or product default weight × qty; fall back to `shipping.defaultItemWeightGrams`), subtotal after discounts, cart contents.

1. Find **zones** matching the destination (area > district > division > "dhaka_city" flag > catch-all "Rest of Bangladesh"); choose the highest-priority active zone.
2. Within the zone, list active **rates** whose conditions match (min/max order, product tags/categories). If several match, show all as customer choices (e.g. "Standard", "Express") ordered by position; default to the first.
3. Rate fee = `base_fee` + `ceil(max(0, weight − included_weight) / weight_step) × extra_fee_per_step`.
4. If `free_over_amount` is set on the rate, or the global `shipping.freeDeliveryThreshold` is set, and subtotal ≥ threshold → fee 0 (configurable whether weight surcharges still apply; default: all free).
5. If no zone matches → use `shipping.fallbackFee` or block checkout with a message (setting).
6. Default seed: zone "Inside Dhaka City" (Dhaka city areas) and zone "Outside Dhaka" (everything else). Admin can set both to the same amount, which covers the "same fee everywhere" case.
7. Delivery estimate shown on product page and checkout: from the rate's `estimated_days_min/max`, with optional cut-off time and holiday calendar settings ("Order before 5 PM, delivery in 1–2 days").

### 6.5 Payment rules engine (COD and advance payment)

Evaluated in priority order at checkout. Each rule = conditions (ALL/ANY) + actions. If `stop_processing`, later rules are skipped. Actions from multiple matching rules merge with the **strictest** outcome winning.

**Conditions available:** order total (≥, ≤, between), subtotal, item count, destination zone/district/area, is_dhaka_city, customer type (guest/registered/new/returning), customer orders count, delivered count, past return/rejection rate, customer tags/segment/tier, risk level/score, product/category/collection/tag in cart, flash-sale item in cart, payment method chosen, day/time window, UTM source, phone in blocklist.

**Actions available:**
- `disable_cod` / `disable_method(method)`
- `require_advance(kind)` where kind = `delivery_fee` | `fixed(amount)` | `percent(p)` | `full`
- `require_otp`
- `require_manual_review` (order placed as `on_hold`)
- `block_order(message)` (e.g. blocklisted)
- `show_message(text)` at checkout

Default seeded rules (inactive except the first, owner decides):
1. *(active)* Blocklisted phone/IP/device → block order with a polite message.
2. Risk level high → require advance = delivery fee + require OTP.
3. Order total ≥ ৳10,000 → require advance = 20%.
4. Customer has ≥ 2 doorstep rejections → require advance = delivery fee.

When an advance is required and the customer chooses COD: checkout collects the advance via an online method; the order is created as `pending_payment`; on success it moves to `pending` with `advance_paid` set and `cod_amount = total − advance`. Unpaid `pending_payment` orders expire after `checkout.paymentTimeoutMinutes` (default 30), releasing stock reservations.

### 6.6 Risk scoring (fraud and fake-order protection)

Score 0–100 computed at order placement (and recomputed on demand). Each signal has an admin-editable weight; defaults:

| Signal | Default weight |
| --- | --- |
| Phone in blocklist | +100 (auto high) |
| Courier history: delivery success ratio < 50% with ≥ 3 parcels | +40 |
| Courier history: success 50–75% | +20 |
| Own history: previous doorstep rejections (each, max 3) | +15 |
| Own history: previous cancelled-after-confirm orders (each, max 3) | +10 |
| New customer + order total above `risk.highValueThreshold` (default ৳5,000) | +15 |
| Same phone or device placed ≥ 3 orders in last 24 h | +20 |
| Same IP placed ≥ 5 orders in last 24 h with different phones | +25 |
| Address too short / missing area / contains test words ("test", "asdf") | +15 |
| Name looks invalid (digits, single char, repeated chars) | +10 |
| Customer has ≥ 3 delivered orders and 0 rejections | −30 |
| Phone verified by OTP at checkout | −10 |

Levels: low < 30 ≤ medium < 60 ≤ high (thresholds editable). Store `risk_reasons` (human-readable, localized). High-risk orders get a red badge and, if setting `risk.holdHighRisk` is on, start in `on_hold`.

Duplicate-order detection: same phone + same items within `risk.duplicateWindowMinutes` (default 60) → flag as possible duplicate and link both orders; admin can merge or cancel.

### 6.7 Stock reservation and overselling

- On **order placement** (any status other than `pending_payment`), reserve stock: atomic update `UPDATE inventory_levels SET reserved = reserved + :q WHERE variant_id = :v AND location_id = :l AND on_hand - reserved >= :q`. If zero rows updated → out of stock → reject with a clear message. Do this for all lines in one transaction.
- `pending_payment` orders hold a reservation with `expires_at` (payment timeout). A job releases expired reservations every minute.
- On **ship** (shipment booked/picked up, setting decides which): decrement `on_hand` and `reserved`, write `stock_movements (sale)`.
- On **cancel** before ship: release reservation.
- On **return received** with `restock = true`: increment `on_hand`, movement `return_restock`. Damaged → movement `damage` (no restock).
- On **doorstep rejection**: when the courier marks returned and the warehouse receives the parcel, restock (after QC step, setting).
- Location choice: default location; multi-location allocation rule (phase 2): prefer the default, otherwise the location that can fulfill the whole order.
- Preorder products: sell beyond stock up to `preorder_limit`; no reservation against on-hand; shown as "Ships by {date}".
- Back-in-stock: when `available` goes from 0 to > 0, enqueue notify-me messages.

### 6.8 Order lifecycle

Statuses:

```
pending_payment ─(paid / advance paid)─► pending ─► confirmed ─► processing ─► packed ─► shipped ─► out_for_delivery ─► delivered ─► completed
       │                                   │            │             │           │           │                      │
       └─(timeout)─► expired               ├─► on_hold ◄┘             │           │           ├─► partially_delivered ─► completed
                                           └─► cancelled ◄────────────┴───────────┘           ├─► rejected_at_door ─► returned_to_warehouse
                                                                                              └─► returned_to_sender (failed delivery) ─► returned_to_warehouse
delivered/completed ─► return_requested / exchange_requested (handled by returns module)
```

| Transition | Who/what | Side effects |
| --- | --- | --- |
| → pending | checkout | reserve stock, risk score, confirmation SMS/email/WhatsApp, server-side Purchase event (setting: send Purchase on placement or on confirmation), staff notification, automation trigger |
| pending → confirmed | call executive, customer self-confirm link/WhatsApp button/IVR (phase 2), or auto-confirm rule | timeline event, "order confirmed" message |
| pending/confirmed → on_hold | staff or rule | reason required |
| → cancelled | staff (reason required), customer (only while `pending`, setting), system (payment expiry) | release stock, refund any paid amount (creates refund record), cancellation message, coupon usage released (setting) |
| confirmed → processing → packed | warehouse | pick list; packing step can require scanning each item barcode (setting) |
| packed → shipped | booking with courier (API or manual) | shipment record, tracking code, stock decrement (setting), "shipped" message with tracking link |
| shipped → out_for_delivery / delivered / partially_delivered / rejected_at_door / returned_to_sender | courier webhook/poll or staff | messages, loyalty points on delivered (after `loyalty.pendingDays`), review request after N days, COD expected amount recorded for reconciliation |
| delivered → completed | automatic after return window ends | points become available, affiliate commission approved |

Rules:
- Only allowed transitions are accepted (enforced in service; return `INVALID_TRANSITION`).
- Every transition writes an `order_events` row and an audit log.
- Staff can edit items, quantities, prices (permission), address, shipping fee, and discounts only before `shipped`; edits re-run pricing (with a manual-override option and reason) and re-reserve stock.
- Order number format setting, default `{PREFIX}{YYMMDD}{SEQ4}` with prefix from brand settings.

### 6.9 Doorstep rejection ("customer does not like it at delivery")

This is a confirmed requirement.

1. At delivery, the customer may refuse the parcel and pay only the delivery charge to the delivery person.
2. The courier marks the parcel as returned with delivery charge collected (or partially delivered if some items are kept). The courier adapter maps this to `rejected_at_door` or `partially_delivered` and records the amount collected (`delivery_fee_collected`).
3. If some items were kept (partial delivery): `cod_amount` collected = price of kept items + delivery charge; kept items are delivered, others returned. The order's totals are recalculated and the difference recorded; loyalty points only on kept items.
4. If the customer had **paid in advance** (advance or full online payment): the refundable amount = paid − delivery charge (− charge for kept items). Refund method per setting `returns.doorstepRefundMethod` (default: same mobile-banking method, manual transfer by finance staff with transaction id; alternative: store credit). A refund record is created in `pending` for staff to process.
5. Parcel return arrives at warehouse → `returned_to_warehouse` → QC → restock.
6. The customer's `rejected_at_door_count` increments and feeds risk scoring and payment rules.
7. Whether doorstep rejection is allowed at all, and what the customer pays (delivery charge only / delivery charge + return charge / free), are settings. The policy text shown on product and checkout pages comes from CMS.

### 6.10 Returns and exchanges (after delivery)

All configurable in admin (`returns.*` settings):
- Enabled types: exchange (size/color/other product), refund, store credit.
- Window: N days after delivery (default 7) — per category override allowed (e.g. undergarments non-returnable).
- Non-returnable flag on products/categories; final-sale items (e.g. flash sale, setting).
- Reasons list (admin-managed, localized): size too small, size too large, damaged, wrong item, not as described, changed mind.
- Who pays return/re-delivery shipping, per reason (e.g. brand pays for damaged/wrong item; customer pays for size change).
- Flow: customer requests from account or order-tracking page (photos optional/required per reason) → staff approves/rejects → pickup (courier reverse pickup if supported, or customer sends) → received → inspected (pass/fail per item) → resolution: exchange creates a new linked order at 0 (or price difference charged/credited), refund creates a refund record, store credit credits the wallet.
- Exchange stock is reserved at approval time.

### 6.11 Notifications

- Each order/customer event maps to message templates per channel. Admin chooses per event which channels are active (SMS / email / WhatsApp) and the order of preference (e.g. WhatsApp first, fall back to SMS if not delivered or not available).
- Variables available in templates: `{customer_name}`, `{order_number}`, `{order_total}`, `{cod_amount}`, `{tracking_link}`, `{courier_name}`, `{tracking_code}`, `{delivery_estimate}`, `{brand_name}`, `{support_phone}`, `{otp}`, `{coupon_code}`, `{product_name}`, `{product_link}`, `{review_link}`, `{cart_link}` and more as needed — documented in the template editor.
- SMS length counter (GSM-7 vs Unicode for Bangla), with segment count and estimated cost.
- Quiet hours setting for marketing messages (not for transactional).
- Opt-out handling for marketing messages (keyword and link).
- All sends are queued, retried with backoff, logged in `notification_logs`.

### 6.12 Loyalty, referral, store credit (when enabled)

- Earn: `loyalty.pointsPerTaka` (default 1 point per ৳100) × tier multiplier, credited when order is delivered and becomes available after `loyalty.pendingDays` (default = return window).
- Redeem: `loyalty.takaPerPoint` (default 1 point = ৳1), minimum points to redeem, max % of order.
- Bonus points: review with photo, birthday, referral.
- Expiry: setting (default 12 months).
- Referral: referrer gets credit/points when the referee's first order is delivered; referee gets a first-order discount.
- Store credit: ledger-based; balance = sum of transactions; usable at checkout as a payment method.

### 6.13 Customer authentication

- OTP: 6 digits (setting 4–6), valid 5 min, max 5 attempts, resend after 60 s, max 3 sends per phone per 10 min and per IP per hour (settings). Hash codes at rest.
- Google sign-in: if the Google email matches no customer, create one and ask for phone (optional, setting to require). If a phone is later verified that belongs to an existing customer, merge accounts (orders, addresses, wishlist, points) after OTP verification.
- Guest orders are linked to the customer profile by verified phone when they later log in.
- Cart merge on login: combine items, keep the larger quantity per variant, re-validate.

---

## 7. Storefront specification

### 7.1 Design direction

No Figma exists; Claude Code designs the UI. Study these reference sites (fetch them if possible) for layout, typography, spacing, product cards, PDP structure and checkout flow, and combine the best patterns. **Do not copy their brand assets, logos, text, or images.**

- https://minion-vinovatheme.myshopify.com/ — minimal fashion theme
- https://lume-demo1.myshopify.com/?pb=0 — clean fashion theme
- https://tabaya.com/ — modest fashion, premium feel
- https://fabrilife.com/ — Bangladeshi apparel e-commerce patterns
- https://oneummahbd.shop/ — Bangladeshi clothing store patterns
- https://www.sailor.clothing/ — Bangladeshi fashion brand

Target feel for the default preset: **minimal-premium fashion** — large edge-to-edge imagery, generous white space, restrained color (neutral base + one brand accent), clear typographic hierarchy, sharp product photography, fast and calm checkout. Bangla text must look as good as English (line height and font pairing tuned for Bangla).

Deliverables: a design system in `packages/ui` + Tailwind preset driven by theme tokens (4.4), 3 presets, all layout variants, and a `/_styleguide` route (admin-only, noindex) showing every component and block in both locales and both light/dark tokens if dark mode is enabled.

### 7.2 Global elements

- **Header:** announcement bar (rotating, admin-managed), logo, mega menu (from `menus`), search (instant suggestions with product thumbnails, categories, popular searches; typo-tolerant; Bangla and English, including Banglish like "panjabi"/"punjabi"), account, wishlist count, cart count, language switch. Sticky on scroll (setting). Mobile: hamburger drawer with nested menu, bottom-sticky search optional.
- **Footer:** columns from menus, contact info, social links, payment/courier logos (admin media), newsletter signup, trade license / DBID text (settings), copyright.
- **Floating chat:** WhatsApp (click-to-chat link with prefilled message including page/product) and/or Messenger link; which ones show is a setting.
- **Cookie/consent banner:** setting (off by default in BD; available).
- **Popups and announcement bars:** from CMS rules.
- **Recently viewed** (local storage + account sync), shown on PDP, cart, 404.
- **Breadcrumbs** on listing and PDP (with schema).

### 7.3 Pages and routes

| Route | Requirements |
| --- | --- |
| `/` Home | Entirely CMS-driven (blocks). Default seeded layout: hero slider, category tiles, new arrivals, featured collection, flash sale countdown (if active), best sellers, lookbook, testimonials, Instagram/UGC, trust badges, newsletter. |
| `/c/[...slug]` Category | Category banner + description (CMS-managed per category, optional block area above/below grid), filters, sort, grid, pagination ("Load more" with URL page param; SEO-crawlable pagination links). |
| `/collections/[slug]` Collection | Same as category; optional story blocks for campaign collections. |
| `/p/[slug]` Product | See 7.4. |
| `/search?q=` | Results with filters; no-results page with suggestions and popular products; search terms logged for analytics. |
| `/cart` | Full cart page (drawer cart also everywhere). |
| `/checkout` | One page. See 7.5. |
| `/order/success/[number]` | Thank-you page with summary, next steps, tracking link, WhatsApp share, account creation prompt for guests. |
| `/track` | Track order by phone + order number (OTP optional setting) — timeline from order events and shipment events. |
| `/account/*` | Login (OTP / Google), dashboard, orders + detail + invoice download, request return/exchange, addresses, wishlist, reviews, points & tier, store credit, referrals, profile & measurements, notification preferences, logout everywhere. |
| `/pages/[slug]` | CMS pages (about, contact, policies, size guide, FAQ, careers…). |
| `/blog`, `/blog/[slug]` | Blog/lookbook (phase 2). |
| `/lp/[slug]` | Campaign landing pages (header/footer optional, embedded order form block for single-product campaigns). |
| `/wishlist` | Guest wishlist (local) + account. |
| `/gift-cards` | Buy digital gift card (phase 3). |
| `/compare`? | Not required. |
| `404`, `500`, maintenance | CMS-editable content; maintenance mode toggle shows maintenance page to non-staff. |
| `/sitemap.xml`, `/robots.txt`, `/feeds/meta.xml`, `/feeds/google.xml` | Generated (section 13). |

### 7.4 Product detail page (PDP)

- Gallery: swipe on mobile, thumbnails + zoom on desktop, video support, images switch to the selected color's images, pinch-zoom/full-screen viewer.
- Title, price, compare-at price, discount badge, flash-sale countdown, low-stock message ("Only 3 left", threshold setting), preorder message.
- Option selectors: color swatches (image or hex), size buttons in size-system order; unavailable combinations disabled; out-of-stock sizes visible but disabled with "Notify me".
- "Find my size" (phase 2): size recommender modal using height/weight/fit preference + size chart + past purchases + review fit feedback; shows recommended size and confidence.
- Size chart modal (from size chart entity, unit toggle inch/cm, how-to-measure).
- Model info, fabric, care, attributes table (visible attributes only).
- Delivery estimate for the customer's area (area selector remembered), delivery fee preview, COD availability, exchange/return summary (from settings + CMS link).
- Add to cart, Buy now (goes straight to checkout), wishlist, share (WhatsApp, Facebook, copy link), "Order on WhatsApp" button (prefilled message with product, variant, link; setting).
- Bundles/"Complete the look" and "Similar products", "Recently viewed".
- Reviews: summary (average, distribution, fit summary "Most say true to size"), photo reviews gallery, sort/filter, write review (verified buyers only, setting), Q&A (phase 2).
- Sticky add-to-cart bar on mobile.
- Structured data: Product, Offer (price, availability), AggregateRating, BreadcrumbList.

### 7.5 Cart and checkout

**Cart drawer/page:** line items with image, options, quantity stepper, remove, move to wishlist; free-delivery progress bar; coupon field; upsell slot (CMS-configurable rule: "frequently bought together" or chosen products); totals breakdown; checkout button; trust badges.

**Checkout (single page, mobile-first):**
1. Contact: name, mobile (with live BD validation), optional email (setting: hidden/optional/required).
2. Address: division → district → area cascading selects (searchable, Bangla + English), address line, landmark (optional). Saved addresses for logged-in customers. "Inside Dhaka / Outside Dhaka" is derived, not asked (setting to show a simple toggle instead of cascading selects for faster checkout).
3. Delivery method: rates from 6.4 with fee and estimate.
4. Payment method: COD, bKash, Nagad, card (SSLCommerz), store credit/gift card/points (if enabled). Methods shown according to payment rules; messages for required advance ("Pay ৳120 delivery charge in advance to confirm COD order").
5. Order note, gift wrap (setting, with fee).
6. Summary with full breakdown; coupon field (also here).
7. Terms checkbox (setting) with link to policies.
8. OTP step inline if required (6.5).
9. Captcha (Turnstile, invisible) on place-order (setting).
10. Place order → redirect to payment gateway when needed → return URL → success page. Failure/cancel → back to checkout with message and a retry button; order remains `pending_payment` until timeout.

Additional rules: no account creation required; form state persists in local storage; addresses autocomplete from previous orders for logged-in users; prevent double submission (idempotency key per checkout attempt); the server recalculates everything.

### 7.6 Storefront technical requirements

- Server components for data fetching; client components only where interactive.
- Cache: product/category/collection/page data tagged (`product:{id}`, `category:{id}`, `page:{slug}`, `settings`, `menu:{location}`, `theme`); API triggers revalidation on change. Prices/stock on PDP fetched fresh (short revalidate or client fetch) so they are never stale beyond 60 s.
- Images via a custom Next.js image loader that maps to pre-generated sizes (no reliance on paid image optimization).
- Fonts self-hosted (`next/font/local` for uploaded fonts; `next/font/google` for curated list), `font-display: swap`, Bangla subset.
- Analytics: `dataLayer` events and client Pixel events with shared `event_id` passed to the API for CAPI deduplication (13.3).
- Accessibility: WCAG 2.1 AA basics — semantic HTML, focus states, alt text, labels, color contrast check in theme editor (warn when tokens fail contrast).
- PWA (phase 2): manifest from brand settings, offline fallback page, add-to-home prompt (setting), web push (opt-in) for order updates and back-in-stock.

---

## 8. Admin panel specification

### 8.1 Admin UX conventions (apply to every module)

- **Layout:** collapsible sidebar grouped by area (Dashboard, Orders, Catalog, Inventory, Customers, Marketing, Content, Design, Reports, Finance, Support, Settings), top bar with global search (Cmd/Ctrl+K: orders by number/phone, customers, products by name/SKU, pages, settings), notifications bell, language switch, profile.
- **Data tables:** server-side pagination, sorting, filtering (chips + advanced filter builder), column chooser, saved views (personal/shared), bulk actions with confirmation and progress, CSV/Excel export of the current filter, sticky header, row click to detail, keyboard navigation.
- **Forms:** zod validation shared with API, unsaved-changes guard, autosave drafts where noted, inline help text from settings registry, localized fields shown as bn/en tabs or side-by-side (user preference).
- **Destructive actions:** confirm dialog; deletes are soft where possible; "restore" in trash views.
- **Feedback:** toasts, optimistic updates where safe, real-time updates (SSE or polling) on order lists and dashboard.
- **Responsive:** every screen usable on a phone (owner checks from mobile); order list and order detail optimized for mobile.
- **Permissions:** hide what the user cannot access; the API enforces regardless.
- **Help:** each module has a "?" panel with a short guide (content from `docs/ADMIN_GUIDE.md`, bilingual).
- **Keyboard shortcuts:** documented in a shortcuts dialog (`?`).

### 8.2 Modules

**Dashboard** — KPIs for today/7d/30d/custom (revenue, orders, AOV, conversion rate, delivered rate, return/rejection rate, new vs returning customers), order count by status (clickable), live visitors and active carts (from analytics events), low-stock list, top products, pending COD from couriers, alerts (anomalies, failed integrations, SMS balance low). Customizable widgets per role (phase 2).

**Orders**
- List with filters: status, payment status/method, risk level, courier, district/zone, date range, source/UTM, tags, assigned staff, has note, duplicate flag, amount range. Saved views (e.g. "To confirm", "High risk", "Ready to ship").
- Kanban view by status (phase 2).
- Order detail: timeline (events, notes, calls, messages), customer card (history, risk, courier success ratio, tags, quick call/WhatsApp), items (edit), address (edit with area selector), payments (add manual payment, record trx id), shipments (book with courier, print label, cancel, track), returns, refunds, discounts, internal notes, tags, assign, status actions.
- Create manual order (phone/Messenger/WhatsApp orders): search customer by phone or create, add products by search/SKU scan, apply discount, choose shipping & payment, place.
- Bulk: confirm, cancel (reason), assign, tag, print invoices/labels (single PDF), book with courier, export.
- Call-centre tools: call outcome buttons (no answer / confirmed / call later / wrong number / cancelled), call-later reminders, click-to-call link (`tel:`) and phase-3 telephony integration.
- Order queue (phase 2): auto-assignment to call executives (round-robin/load-based), my queue view.
- Duplicate/merge/split orders (phase 2).

**Fulfillment** — pick list (by location, grouped by product/bin), packing screen (scan order barcode → scan items → mark packed; mismatch alerts; optional packing photo), shipping labels, handover manifest per courier (list of parcels + signature sheet), courier booking (single/bulk), shipment tracking board.

**Returns & exchanges** — requests list, detail with photos, approve/reject, schedule pickup, receive & inspect, resolution (exchange order / refund / store credit), return analytics (by product, size, reason).

**Catalog**
- Products: list (thumbnail, title, SKU count, stock, price range, status, category), filters, bulk edit (price, compare-at, status, category, tags, attributes) in a spreadsheet-like grid, duplicate, archive.
- Product editor: localized title/description (rich text), media manager (drag-sort, assign to color, alt text, AI alt text), options & variant matrix generator (choose size system and colors → generate all combinations; edit price/SKU/barcode/stock/weight per variant inline; bulk-fill column), pricing (price, compare-at, cost with permission), inventory per location, attributes, categories & collections, size chart, model info, care, relations (similar/complete-the-look), SEO with Google/Facebook preview, scheduling (publish/unpublish at), status, preorder settings, product version history with restore.
- AI assistance (phase 2): generate description/SEO/alt text from images + keywords, translate bn↔en; always a draft for review.
- Categories: tree with drag-and-drop, per-category image/banner/description/SEO/default size chart/attribute set/CMS blocks.
- Collections: manual (drag-sort products) or automatic (rule builder with live preview count), schedule.
- Attributes & values, Options presets, Size systems, Size charts editor (table editor with inch/cm conversion).
- Import/Export: CSV/Excel import with column mapping, dry-run validation report, image import by URL or by SKU-matched filenames (bulk upload zip or multiple files), upsert by SKU; export with filters. Import runs as a background job with progress and error file download.
- Product quality checker (phase 2): missing images/description/size chart/translation/SEO/weight.

**Inventory** — stock by variant/location with inline adjust (reason required), movements log, low-stock list and thresholds, notify-me demand list, stock transfers, stock takes (count sheet, scan, variance report, apply), barcode label printing (choose label size), purchase/production orders with receiving (phase 2), suppliers, size-curve analysis and reorder suggestions (phase 2/3), dead stock report with markdown suggestion (phase 2), materials & BOM (phase 3).

**Customers** — list with filters (spent, orders, last order, district, tags, tier, risk, segment), profile (orders, returns, addresses, points, credit ledger, reviews, notes, tags, communication log, risk details, blocklist action, merge duplicates), segments builder (rules with live count; RFM presets in phase 2), export, audience sync to Meta/Google (phase 2).

**Marketing**
- Discounts & coupons (all types in 5.8), bulk unique code generator, usage reports.
- Automatic promotions, bundles, flash sales (with countdown and stock caps).
- Promo calendar (phase 2) showing discounts, flash sales, banners, seasonal themes, scheduled prices.
- Loyalty program, tiers, referral program, affiliates (phase 2/3), gift cards (phase 3).
- Abandoned carts list + recovery settings and stats (phase 2).
- Campaigns: SMS/WhatsApp/email broadcasts to segments with preview, test send, schedule, cost estimate, delivery report (phase 2).
- Automated journeys (welcome, post-purchase review request, win-back, birthday) (phase 2).
- Reviews moderation and Q&A.
- Feeds (Meta catalog, Google Merchant) status and settings.
- Ad spend import (CSV) and ROAS report (phase 2).

**Content (CMS)** — see section 9: pages, page builder, home page, landing pages, menus, announcement bars, popups, blog, FAQ, size guide pages, media library, UI text, message templates, redirects, SEO settings.

**Design** — theme presets, tokens editor with live preview (colors with contrast checker, fonts, radii, spacing density, button/card styles), layout variants (header/footer/product card/PDP), seasonal themes with schedules, favicon/logo, custom CSS (Super Admin only, sandboxed to a scoped stylesheet, warning shown).

**Reports** — sales (by day/product/category/size/color/district/source), profit (6.1 costs incl. courier charges, gateway fees, ad spend when imported, returns), courier performance (delivery time, success, rejection, COD outstanding), staff performance (confirmations, time-to-confirm), marketing (discount usage, campaign attribution), customer (new/returning, cohorts in phase 3), inventory valuation, search terms (top, zero-result). Every report: date range, compare period, export. Scheduled email reports (phase 2). Report builder (phase 3).

**Finance** — COD reconciliation (import courier settlement file or API; auto-match by consignment id; variance flags), gateway settlements, refunds queue (pending manual refunds with trx id entry), expenses (phase 3), profit & loss summary (phase 3), exports.

**Support** (phase 3) — unified inbox (Messenger, WhatsApp, Instagram, live chat) with customer/order side panel, create order from chat, tickets, canned replies, AI reply suggestions.

**Automation** (phase 2) — rule builder (trigger → conditions → actions) with templates (e.g. "High value order → notify manager", "3rd doorstep rejection → add tag Risky and require advance", "Order delivered → schedule review request"), run history, enable/disable, test with sample event.

**Settings** — generated from the registry, grouped: General (brand), Localization, Checkout, Shipping (zones & rates editor), Payments (methods, payment rules editor), Taxes (VAT, disabled), Orders (numbering, statuses behaviors), Returns, Notifications (channel matrix per event), Customers & auth (OTP, Google), Risk & fraud (weights, thresholds, blocklist), Inventory, Loyalty, SEO, Tracking & analytics, Integrations (providers, 4.3), AI (providers and per-feature configs, budgets, usage), Staff & roles, API keys & webhooks, Maintenance mode & feature toggles, Backup/export (config bundle export/import, data exports), System health (queue depth, failed jobs with retry, provider status, last webhook received per provider, SMS balance, storage used, DB size).

**Staff & security** — staff list, invite (email link), roles & permission matrix editor, field-level permissions, sessions (revoke), 2FA enforcement, login history, audit log viewer with filters and diff view, approval requests inbox (phase 2).

**Admin PWA** (phase 2) — installable, push notifications (new order, high-risk order, low stock, failed payment webhook), quick actions, camera barcode scanner for warehouse flows.

---

## 9. CMS specification

Goal: everything visible on the storefront is editable by non-technical staff, safely, with preview and rollback.

### 9.1 Block system

- A page is an ordered list of **block instances**: `{ id, type, version, props, visibility, schedule, variants? }`.
- Each block type is defined once in `packages/blocks/<type>/` with:
  - `schema.ts` — zod schema of props (localized text fields, media refs, product/collection refs, colors from theme tokens only, spacing presets, alignment…).
  - `defaults.ts` — default props.
  - `form.ts` — admin form metadata (field order, widgets, groups).
  - `Component.tsx` — storefront React component (server component where possible).
  - `preview.png` — thumbnail for the block picker.
- `visibility`: devices (mobile/tablet/desktop), audience rules (phase 2: new/returning, logged in, tier, segment, UTM source, inside/outside Dhaka), locales.
- `schedule`: start/end date-time.
- Unknown or invalid blocks render nothing on the storefront and log a warning (never crash a page).

**Block library (MVP):** hero (single image/video), hero slider, image + text, rich text, category tiles, collection grid/carousel, product grid/carousel (source: collection, category, tag, manual pick, new arrivals, best sellers, on sale, recently viewed), flash-sale countdown, banner strip, promo grid (2–4 tiles), testimonials/reviews, trust badges, FAQ accordion, newsletter signup, video, spacer/divider, Instagram/UGC gallery (manual images in MVP), size guide table, contact info + map embed, order form (for landing pages: product + variant picker + checkout fields in one block), custom HTML (Super Admin only, sanitized).
**Phase 2:** shoppable lookbook (image hotspots), shop-the-look bundle, countdown campaign, store notice, blog post list, personalized "for you".

### 9.2 Editing experience

- Page builder screen: left = block list (drag to reorder, duplicate, hide, delete), center = **live preview iframe** of the storefront rendering the draft (device toggle mobile/tablet/desktop, locale toggle), right = selected block's form. Changes update the preview instantly via `postMessage`.
- **Draft vs published:** edits go to `draft`; "Publish" creates a `page_versions` row and revalidates the page; "Schedule publish" sets `publish_at`; "Preview link" generates a signed URL valid for N days.
- **Version history:** list of versions with author and note, view any version, diff summary (blocks added/removed/changed), restore as draft.
- **Edit lock:** one editor at a time per page; others see "being edited by X" with read-only view (lock expires after inactivity).
- **Autosave** drafts every 10 s.
- **Approval** (phase 2): pages flagged as requiring approval (e.g. home) need a Publisher/Manager to publish.
- **Global blocks:** save a block as global; edits propagate to all pages using it.
- **Templates:** create page from template (landing, collection story, policy, blank). Admin can save any page as a template.

### 9.3 Other content types

- **Menus:** tree editor (drag nesting up to 3 levels), item types (category, collection, product, page, custom URL), mega-menu columns with images and badges, mobile-specific menu, visibility by locale/schedule.
- **Announcement bars, popups:** editors with targeting and schedules (5.9).
- **Blog / lookbook:** block-based body; categories, tags, authors; related products.
- **FAQ:** groups and items; attach groups to pages/products/checkout.
- **Size guide pages** link to size charts.
- **Policy pages** (Privacy, Terms, Return & Exchange, Shipping, Cookie): seeded as placeholders with `needs_content = true`; the admin dashboard shows a "Content needed before launch" checklist listing them. The owner will provide the text.
- **UI text:** all storefront microcopy keys, searchable, with "where used" hint and reset to default.
- **Message templates:** editor per channel/event/locale with variable picker, preview with sample order, test send.
- **Invoice & label templates:** choose layout preset, toggle fields, logo, footer text, QR (tracking link).

### 9.4 Media library

Folders, tags, search, grid/list, bulk upload (drag-drop, multiple files and zip), upload progress, auto-optimization (sizes, WebP/AVIF, blur placeholder), focal point picker, alt text (localized, AI-assisted in phase 2), replace file (keep URL references), usage list ("used in 3 products, 1 page"), safe delete (blocked if used, unless forced with references cleaned), unused media report, storage usage. Max upload size and allowed types are settings. Video: upload small MP4/WebM (size limit setting) or embed YouTube/Facebook.

### 9.5 SEO controls

Per page/product/category/collection/post: meta title, description, slug, canonical, noindex, OG image; Google and Facebook/WhatsApp preview; SEO checklist score (phase 2). Global: title templates (e.g. `{title} | {brand}`), default OG image, robots rules, sitemap inclusion rules. Auto-redirect on slug change; redirect manager with import; broken link checker (phase 2).

### 9.6 Publishing pipeline

On publish/update of any content, product, price, stock threshold crossing, menu, theme, or public setting: API emits a domain event → job calls storefront `POST /api/revalidate` with the secret and affected tags → storefront revalidates. Target: changes visible within 10 seconds.

---

## 10. Integrations

Implement each driver from the provider's **current official documentation** at implementation time (APIs change; verify endpoints, auth, and webhook signatures). Every driver must work in `mock` mode first, then `sandbox`, then `live`. No merchant accounts exist yet: build, test with mock/sandbox, and leave live credentials to be entered in admin.

### 10.1 Payments

| Driver | Flow | Notes |
| --- | --- | --- |
| COD | No gateway. Optional advance collected via another method per payment rules. | Built-in |
| SSLCommerz | Create session → redirect to hosted page → IPN (server-to-server) + success/fail/cancel redirects → **validate via validation API before marking paid** | Cards, mobile banking, net banking through one gateway; refunds API |
| bKash (Tokenized Checkout) | Grant token (cached, refreshed) → create payment → redirect → callback → execute payment → query to confirm | Refund API; handle "already executed" idempotently |
| Nagad | Initialize (signed with merchant private key, verified with Nagad public key) → complete → redirect → callback → verify | Key management in secrets |
| Mock | Configurable success/failure/delay | Used in dev, tests, demos |

Rules: amounts from the server only; verify amount and currency on callback; idempotent processing of duplicate callbacks; reconcile `pending` payments older than 15 min by querying the provider (job); never store card data.

### 10.2 Couriers

| Driver | Capabilities to implement |
| --- | --- |
| Steadfast | Create parcel (single + bulk), status by consignment/tracking/invoice, webhook for status updates, balance/settlement info if available |
| Pathao | OAuth token, stores, city/zone/area lookups (for area mapping), price plan, create order, status/webhook |
| RedX | Areas lookup, create parcel, tracking, webhook |
| Manual | Staff enters courier name + tracking code; status updated manually |
| Mock | Simulates status progression on a timer, including partial delivery and rejection |

Common: map provider statuses to our shipment statuses (table per driver, editable in code + documented); store raw status; poll fallback job for providers without webhooks or when webhooks are missing (every 2 h for active shipments); label/invoice printing uses our template with courier tracking code/barcode; COD amount sent = `orders.cod_amount`; area mapping tool in admin.

### 10.3 Messaging

- **SMS:** `generic_http` driver (admin defines URL, method, params/body template with `{to}`, `{message}`, `{api_key}`, `{sender_id}`, success detection rule) so any BD gateway works without code; plus two named BD gateway drivers with balance check. Unicode handling for Bangla. Masking/sender ID setting.
- **Email:** SMTP (works with any provider), Brevo, Resend. SPF/DKIM guidance in `docs/DEPLOYMENT.md`.
- **WhatsApp:** `click_to_chat` (wa.me links with prefilled text; used for chat buttons and "Order on WhatsApp") and `whatsapp_cloud` (Meta WhatsApp Cloud API: template messages for transactional events, session messages, webhook for delivery/read status and inbound messages → support inbox in phase 3). Admin chooses which is active; both can be active (button uses click-to-chat; notifications use Cloud API).

### 10.4 AI (multi-provider)

- Drivers: Anthropic, OpenAI, Google Gemini, mock. Each provider instance: API key (secret), default model, enabled.
- Per-feature configuration (`ai_feature_configs`): which provider + model, parameters, editable prompt template (with variables and version history), enabled, monthly token/cost budget with hard stop and alert.
- Features: product description & SEO (from images + keywords; bn and en), translation bn↔en, alt text from image, review summary, size advice explanation, reply suggestions (support), chat assistant (phase 3: answers about products, sizes, stock, order status via tool calls to our API, with strict guardrails and handoff to human), report insights (phase 3).
- All AI output that changes content is saved as a **draft for human review**, never auto-published.
- Usage logged in `ai_usage_logs`; admin AI usage report by feature/provider/month.
- Graceful fallback: if the chosen provider fails, optionally try the next enabled provider (setting).

### 10.5 Tracking and feeds

- **Meta:** Pixel (client) + Conversions API (server). Events: PageView, ViewContent, Search, AddToCart, AddToWishlist, InitiateCheckout, AddPaymentInfo, Purchase (on placement or on confirmation — setting), plus custom `OrderDelivered` (optional). Shared `event_id` for deduplication. Send hashed phone/email/name/city, fbp/fbc cookies, client IP and user agent. Test event code setting. Event delivery log in admin.
- **Google:** GA4 (gtag via GTM or direct), Measurement Protocol for server-side purchase, enhanced e-commerce item data, Google Ads conversion (via GTM).
- **TikTok:** Pixel + Events API (same pattern as Meta).
- **GTM:** container ID setting; `dataLayer` events follow GA4 e-commerce schema.
- **Feeds:** Meta catalog and Google Merchant XML/CSV feeds generated by a job (and on demand), including variants as items with `item_group_id`, sale price, availability, images, custom labels (collection, margin band); feed URL with secret token.

### 10.6 Other

- **Cloudflare Turnstile** captcha (checkout, OTP, review, contact form).
- **Google OAuth** for customer login.
- **Fraud check:** internal history + configurable courier-history HTTP adapter (several BD services provide parcel success ratio by phone); results cached per phone for 24 h.
- **Maps:** none required; contact page uses an embed URL from settings.

---

## 11. API design

### 11.1 Conventions

- Base paths: `/api/v1/store/*` (public storefront and customer), `/api/v1/admin/*` (staff), `/api/v1/webhooks/*` (providers), `/api/v1/public/*` (feeds, revalidation callbacks, health).
- JSON only; request validation with shared zod schemas; OpenAPI generated and served at `/api/docs` (admin-authenticated in production).
- Response envelope for lists: `{ data: [...], meta: { page, pageSize, total } }` (cursor pagination for large lists like orders and logs: `{ data, meta: { nextCursor } }`).
- Error format: `{ error: { code: 'OUT_OF_STOCK', message: '<localized>', details?: {...}, requestId } }` with stable `code` values listed in `packages/shared/errors.ts`; messages localized by `Accept-Language`.
- Idempotency: `Idempotency-Key` header required on place-order, payment init, refund, courier booking; stored 24 h.
- Rate limiting per IP and per identity on auth, OTP, place-order, search, reviews (limits are settings).
- Request ID (`x-request-id`) propagated to logs and errors.
- Customer auth: access JWT in memory/cookie + rotating refresh cookie (httpOnly, Secure, SameSite=Lax); anonymous carts via `anonymous_id` cookie.
- Staff auth: server session cookie on the admin domain + CSRF token; TOTP required; RBAC guard `@RequirePermissions('orders.update')`; field-level filtering of responses by permission.
- API keys (phase 3) for external integrations with scopes.

### 11.2 Endpoint groups (non-exhaustive; implement what the features require)

**Store:** `config` (public settings, theme, menus, UI strings), `auth` (otp/send, otp/verify, google, refresh, logout), `locations` (divisions/districts/areas), `catalog` (categories tree, category by slug, collections, products list with filters/facets/sort, product by slug, related, search, suggest), `pages` (by slug, home, preview with token), `blog`, `faq`, `cart` (get, add, update, remove, apply/remove code, set address/area, select rate), `checkout` (quote, place-order, otp), `payments` (init, status), `orders` (track by phone+number, mine, detail, invoice, cancel, self-confirm), `returns` (eligibility, create, list), `account` (profile, addresses, wishlist, reviews, points, credit, referrals, notification prefs, measurements), `reviews` (list, create), `questions`, `notify-me`, `newsletter`, `events` (first-party analytics + CAPI relay), `size-advice`.

**Admin:** one resource group per module in 8.2 (`orders`, `fulfillment`, `shipments`, `returns`, `products`, `variants`, `categories`, `collections`, `attributes`, `size-systems`, `size-charts`, `inventory`, `stock-movements`, `transfers`, `stock-takes`, `suppliers`, `purchase-orders`, `customers`, `segments`, `discounts`, `flash-sales`, `bundles`, `loyalty`, `gift-cards`, `referrals`, `affiliates`, `campaigns`, `journeys`, `reviews`, `cms/pages`, `cms/blocks`, `cms/menus`, `cms/announcements`, `cms/popups`, `cms/blog`, `cms/faq`, `media`, `ui-strings`, `templates`, `redirects`, `theme`, `settings`, `integrations`, `ai`, `automation`, `approvals`, `reports/*`, `finance/*`, `support/*`, `staff`, `roles`, `audit-logs`, `api-keys`, `webhooks`, `system/health`, `system/jobs`, `import-export`, `search` (global), `dashboard`), each with list/get/create/update/delete plus domain actions (e.g. `POST /admin/orders/:id/confirm`, `/cancel`, `/ship`, `/notes`, `/assign`, `POST /admin/orders/bulk`).

**Webhooks:** `/webhooks/payments/:driver/:instanceId`, `/webhooks/couriers/:driver/:instanceId`, `/webhooks/whatsapp/:instanceId`, `/webhooks/sms/:driver/:instanceId` (delivery reports).

**Public:** `/public/feeds/:type.xml?token=`, `/public/sitemap/*`, `/health`, `/ready`, `/public/cron/:task?token=` (external cron trigger for free hosting, 15.2).

---

## 12. Security

- HTTPS everywhere; HSTS; secure cookies; CSP on storefront and admin (allow-list tracking domains from settings; nonce-based scripts).
- Admin on its own subdomain; optional IP allow-list setting; mandatory TOTP 2FA for all staff; password policy (min 12 chars, breached-password check optional); login rate limit and lockout; session idle timeout and absolute timeout settings; "log out all sessions".
- OWASP Top 10: parameterized queries (Prisma), input validation (zod) on every endpoint, output encoding, rich-text sanitization (allow-list) on save and render, file upload validation (MIME sniffing, size, image re-encoding through sharp, no SVG uploads unless sanitized), SSRF protection on any URL-fetching feature (image import by URL, generic HTTP providers: block private IP ranges).
- Secrets encrypted at rest (4.1); never logged; redaction in provider logs (keys, tokens, OTPs, full card/phone data per setting).
- Webhook signature verification and replay protection (timestamp tolerance, event id dedupe).
- Payment integrity: server-side amounts, gateway validation API before marking paid, reconciliation job.
- Bot protection: Turnstile on sensitive forms, rate limits, honeypot fields.
- Privacy: customer data export and deletion on request (admin action; orders anonymized, not deleted, for accounting); marketing consent recorded; privacy policy from CMS.
- Audit log for all admin mutations and sensitive reads (exports, viewing full phone numbers if masked by permission).
- Dependency scanning (Dependabot/Renovate + `pnpm audit` in CI).
- Backups (15.4); restore procedure tested.
- Custom HTML/CSS/script injection (tracking snippets, custom CSS) restricted to Super Admin, shown with warnings, and audit-logged.

---

## 13. Performance, SEO and analytics

### 13.1 Performance budgets (mobile, mid-range Android, 4G)

| Metric | Budget |
| --- | --- |
| LCP | < 2.5 s (home, category, PDP) |
| INP | < 200 ms |
| CLS | < 0.1 |
| JS shipped on PDP (gzip) | < 170 KB first load (excluding third-party tracking) |
| API p95 (catalog reads) | < 300 ms (warm) |
| Place order p95 | < 1.5 s (excluding gateway redirect) |

Techniques: RSC + ISR, tag revalidation, pre-generated image sizes with `srcset` and blur placeholders, lazy-load below the fold, defer third-party scripts (load Pixel/GA after interaction or idle, setting), DB indexes and `EXPLAIN`-checked queries for listing/filter/search, facet counts cached per category, N+1 prevention, connection pooling (Prisma with pooled URL on Neon/Supabase).

Load test (k6) scripts in `infra/loadtest/`: browse + search + add to cart + checkout mix; target 500 concurrent virtual users on VPS mode without errors (free tier is not expected to meet this; document the limits).

### 13.2 SEO

- SSR HTML for all public pages; semantic headings; localized `hreflang`; canonical URLs; clean slugs (`/c/men/panjabi`, `/p/cotton-panjabi-navy`).
- Structured data: Organization, WebSite (SearchAction), BreadcrumbList, Product/Offer/AggregateRating, FAQPage, Article (blog).
- `sitemap.xml` index split by type (products, categories, collections, pages, blog), updated on change; `robots.txt` from settings; faceted filter URLs `noindex,follow` and canonical to the base listing.
- Out-of-stock products stay indexed with availability OutOfStock (setting); archived products return 301 to category (or 410, setting).
- OG/Twitter meta with dynamic OG images for products (image + price), cached.

### 13.3 Analytics and attribution

- Capture UTM parameters and click IDs (fbclid, gclid, ttclid) on landing; store first-touch and last-touch in a cookie; attach to cart and order.
- First-party events table (5.10) powers funnel and live dashboard without third-party dependence.
- Client tracking scripts load according to tracking settings; consent setting can gate them.
- Server-side events via queue (never block checkout on tracking).
- ROAS report joins orders (by UTM campaign) with imported ad spend; "real ROAS" counts only delivered orders.

---

## 14. Testing and quality

| Layer | Tooling | Must cover |
| --- | --- | --- |
| Unit | Vitest | Money math & allocation, phone normalization, pricing pipeline, discount eligibility & stacking, shipping fee calc, payment rules engine, risk scoring, order state machine transitions, return eligibility, loyalty calc, localized text fallback, settings registry validation |
| API integration | Vitest/Jest + Supertest + real Postgres (CI service container) | Auth flows (OTP, Google mock, staff 2FA), RBAC denials, cart → checkout → order with each payment method (mock drivers), concurrent last-item purchase (only one succeeds), webhooks (valid/invalid signature, duplicates), courier status mapping, returns flows, CMS publish & revalidation call, import job |
| E2E | Playwright | Storefront: browse → filter → PDP → add to cart → checkout COD (guest) → success → track; checkout with advance payment (mock gateway); login OTP (mock SMS); account return request. Admin: login with 2FA, create product with variants, publish page in builder, confirm and ship order (mock courier), change shipping fee and see it in checkout, change theme color and see it on storefront |
| Visual/a11y | Playwright screenshots of key pages at 360px and 1280px in both locales; axe checks | |
| Load | k6 | 13.1 |

CI (GitHub Actions) on every push/PR: install, lint, typecheck, unit, integration, build all apps, Playwright smoke on PRs to `main` (full E2E nightly). Coverage target ≥ 80% for `domain` folders.

Seed data for tests: deterministic factories in `packages/db/factories`.

---

## 15. Deployment and environments

### 15.1 Environments

`local` (docker-compose.dev: Postgres, MinIO, MailHog; Redis optional) → `staging` → `production`. Each app reads URLs and secrets from env; everything else from DB settings.

### 15.2 Free-tier mode (start here — owner's decision)

| Component | Suggested free service | Caveats to document in DEPLOYMENT.md |
| --- | --- | --- |
| Storefront + Admin | Vercel Hobby | Vercel's Hobby plan is for non-commercial personal use only; acceptable for development/staging/demo. **A live commercial store requires Vercel Pro or moving to the VPS mode.** Show this warning in `docs/DEPLOYMENT.md` and in admin System Health when `NODE_ENV=production` and `HOSTING_TIER=free`. |
| API (NestJS) | Render free web service (Docker) or similar | Free instances spin down after ~15 min idle; first request can take up to ~30 s. Mitigate: health ping via external cron; keep webhooks idempotent and tolerant to retries; scheduled jobs triggered by external cron hitting `/public/cron/:task`. |
| PostgreSQL | Neon or Supabase free tier | Storage/compute limits; use pooled connection string; enable `pg_trgm`. |
| Job queue | pg-boss on the same Postgres | No Redis required. |
| Cache | In-memory | Lost on restart; acceptable. |
| Search | Postgres full-text + trigram | Switch to Meilisearch later via setting. |
| File storage | Cloudflare R2 free tier (S3-compatible) | Public bucket via custom domain/CDN for images. |
| Email | Brevo free tier or SMTP | Daily send limits. |
| External cron | GitHub Actions scheduled workflow or cron-job.org | Calls `/health` every 10 min and `/public/cron/*` tasks (release expired reservations every 5 min instead of 1 min on free tier, courier status poll, scheduled publishing, feeds, abandoned carts). |
| Monitoring | Sentry free tier (optional), UptimeRobot free | |

Requirement: the system must **work correctly** (not necessarily fast) in this mode. Long-running work must be chunked so each job run finishes within serverless/instance limits.

### 15.3 VPS mode (later — production)

- `infra/compose/docker-compose.vps.yml`: Caddy (TLS, reverse proxy, compression), `storefront`, `admin`, `api`, `worker` (`WORKER_MODE=separate`), `postgres` (or managed), optional `redis`, optional `meilisearch`, `backup` sidecar.
- Single command deploy script (`infra/scripts/deploy.sh`): pull, migrate, build, zero-downtime restart.
- Recommended: Singapore region VPS, 2–4 vCPU, 4–8 GB RAM to start; Cloudflare in front (DNS, CDN, WAF).
- Switching modes requires only env changes (`HOSTING_TIER=vps`, `WORKER_MODE=separate`, `REDIS_URL`, `MEILI_URL`) — no code changes. Document a migration checklist (DB dump/restore, storage stays on R2, DNS switch).

### 15.4 Backups and operations

- Daily logical DB backup (pg_dump) to R2 with 30-day retention (VPS mode via sidecar; free mode via GitHub Actions workflow using the DB URL secret); monthly restore test documented.
- Admin "Export data" (orders, customers, products) for the owner's own records.
- Health endpoints and System Health page; alerts (email/push to Super Admin) on: failed jobs spike, provider failures, webhook silence > N hours, payment pending reconciliation failures, disk/storage thresholds.

### 15.5 Environment variables (`.env.example`)

`DATABASE_URL`, `DATABASE_DIRECT_URL`, `APP_ENCRYPTION_KEY`, `STOREFRONT_URL`, `ADMIN_URL`, `API_URL`, `REVALIDATE_SECRET`, `CRON_SECRET`, `STORAGE_DRIVER`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`, `REDIS_URL` (optional), `MEILI_URL`/`MEILI_KEY` (optional), `SENTRY_DSN` (optional), `HOSTING_TIER` (`free`/`vps`), `WORKER_MODE` (`embedded`/`separate`), `NODE_ENV`, `LOG_LEVEL`. Everything else is configured in the admin panel.

---

## 16. Milestone plan

Build in this order. Each milestone ends with: all acceptance criteria met, tests written and passing, CI green, `docs/PROGRESS.md` updated, commit pushed. Then continue immediately to the next milestone.

### Phase 1 — MVP (launch-ready store)

**M0 — Repository and tooling**
- Monorepo (3.2), shared configs, `CLAUDE.md`, docs folder, docker-compose.dev (Postgres, MinIO, MailHog), CI pipeline, `.env.example`, base Next.js apps and Nest app with health endpoints, OpenAPI generation → `packages/sdk`.
- ✅ `pnpm dev` starts all three apps against local services; CI runs lint/typecheck/test/build green.

**M1 — Platform foundations**
- Prisma base schema (system, staff, settings, ui_strings, locations, media, audit), settings registry + generated settings UI, encryption for secrets, provider framework with registry + mock drivers + Integrations UI + test-connection, queue service (pg-boss) + cache service + scheduler + external-cron endpoint, storage provider (local + S3), media library (upload, sizes, blur, focal point, folders, usage), i18n (next-intl both apps, LocalizedText helpers, UI strings table + editor), staff auth (password + TOTP 2FA), RBAC with permission matrix UI, audit log + viewer, setup wizard, admin shell (layout, sidebar, Cmd+K skeleton, tables/forms kit, bilingual UI), BD location seed + area management.
- ✅ Fresh install → setup wizard → Super Admin logs in with 2FA → changes a setting and sees it audit-logged → uploads an image and sees generated sizes → creates a role with limited permissions and verifies a user with that role is denied elsewhere (UI and API).

**M2 — Catalog and inventory**
- Categories tree, attributes, size systems, size charts, options & variant matrix (incl. free-size single variant), products editor (all fields in 8.2 Catalog except AI), collections (manual + automatic), price schedules, product versions, stock locations (one seeded), inventory levels, adjustments, movements, low-stock thresholds, CSV/Excel import/export with dry run, barcode label print, search provider (Postgres FTS + trigram, Banglish synonyms table editable in admin).
- ✅ Import 500 products with variants from a CSV in one job with an error report; create a free-size product and a size×color product in the UI; search finds "punjabi", "panjabi" and "পাঞ্জাবি" for a product titled Panjabi with a synonym entry.

**M3 — Theme, CMS core and storefront shell**
- Theme tokens → CSS variables, 3 presets, layout variants, design screen with live preview; block system with MVP block library (9.1); page builder with live preview iframe, drafts, publish, schedule, preview links, version history, edit lock, autosave; menus editor; announcement bars; popups (basic); UI text; redirects; storefront layout (header, footer, mega menu, chat buttons, announcement bar), home page from CMS, CMS pages, policy placeholder pages with "needs content" checklist, revalidation pipeline, `/_styleguide`, 404/500/maintenance.
- ✅ Admin changes brand color, header variant, and home hero text; storefront reflects all three within 10 s without a deploy; a scheduled banner appears and disappears at its times; restoring an older page version works.

**M4 — Storefront catalog experience**
- Category/collection listing with filters (options, attributes, price, availability), sort, pagination, facet counts; search page + instant suggestions; PDP (7.4 MVP parts: gallery, options, size chart, delivery estimate, reviews display, related, sticky ATC, share, WhatsApp order); wishlist (guest + account); recently viewed; notify-me; SEO (meta, structured data, sitemaps, robots, hreflang, canonical); first-party analytics events + dataLayer.
- ✅ Lighthouse mobile ≥ 90 performance and ≥ 95 SEO on home, category, PDP with demo data on local production build; selecting a color switches images; unavailable size combinations are disabled.

**M5 — Cart, checkout, shipping, payment rules, customer auth**
- Cart (drawer + page) with pricing pipeline 6.3 (automatic + code discounts, basic flash sales), shipping zones & rates editor and calculation 6.4, payment rules editor and engine 6.5, risk scoring 6.6, stock reservation 6.7, one-page checkout 7.5, OTP (mock SMS) + Google login, guest checkout, account area (orders, addresses, profile), order placement with idempotency, payment drivers: COD + mock gateway + SSLCommerz/bKash/Nagad drivers implemented against sandbox docs (enabled only when configured), success/failure flows, payment reconciliation job, Turnstile.
- ✅ Two buyers race for the last unit: exactly one order succeeds. Changing the outside-Dhaka fee in admin changes checkout totals immediately. A high-risk rule forces advance payment of the delivery fee and the order is created as `pending_payment`, then `pending` after mock payment. Expired unpaid orders release stock.

**M6 — Order management and fulfillment**
- Orders list (filters, saved views, bulk), order detail (timeline, edit before ship with re-pricing, notes, call outcomes, assign, tags, payments, refunds record), manual order creation, state machine 6.8 with side effects, duplicate detection, blocklist, invoices and labels (PDF), pick list, packing screen with scan, handover manifest, courier drivers (manual + mock + Steadfast/Pathao/RedX against sandbox/docs), area mapping tool, shipment tracking and status mapping, doorstep rejection and partial delivery flows 6.9, basic returns & exchanges 6.10, order tracking page.
- ✅ With mock courier: confirm → pack (scan) → book → status progresses automatically to delivered; another order ends as rejected_at_door with delivery fee collected, stock restocked after QC, refund record created for its advance minus fee; customer risk count increments.

**M7 — Notifications and messaging**
- Message templates (SMS/email/WhatsApp, bn/en) with editor, preview, test send; channel matrix per event with fallback order; SMS drivers (generic HTTP + two BD gateways), email drivers (SMTP, Brevo, Resend), WhatsApp click-to-chat + Cloud API driver; notification logs; staff notifications (in-app + email).
- ✅ Placing, confirming, shipping, delivering an order sends the configured messages via mock drivers in the chosen language; switching an event from SMS to WhatsApp needs no code.

**M8 — Marketing basics, customers, reviews, tracking, reports**
- Discounts & coupons full UI (5.8 types except loyalty/gift cards), bulk unique codes, margin guard, flash sales UI; customers list/profile/tags/segments (rule builder); reviews & moderation with photo reviews and fit feedback; Meta Pixel + CAPI, GA4 + MP, GTM, TikTok with dedup and event log; product feeds; dashboard KPIs; core reports (sales, products, courier, staff, discounts, search terms) with export.
- ✅ A purchase produces client and server Purchase events with the same event_id (verified in event log); feeds validate against the platforms' required fields.

**M9 — Hardening and launch readiness**
- Full test suites (14), E2E for the listed journeys, security review against section 12, performance pass against 13.1, accessibility pass, demo seed polish, `docs/ADMIN_GUIDE.md` (bilingual, per module), `docs/DEPLOYMENT.md` (free mode + VPS mode), launch checklist page in admin (policies filled, payment live, courier live, SMS live, tracking verified, sitemap submitted, backups running, staff 2FA).
- ✅ All CI checks green; launch checklist in admin shows only owner-side items (credentials, policy text) as pending.

### Phase 2 — Growth and operations automation

**M10 — Conversion features:** size recommender + customer measurements, shop-the-look bundles and lookbook hotspots block, abandoned cart recovery (SMS/WhatsApp/email sequence with optional coupon), preorders, self-service exchange portal, Q&A, storefront PWA + web push, audience-targeted blocks, blog/lookbook.
**M11 — Order operations automation:** customer self-confirmation (SMS link / WhatsApp button), order queue auto-assignment, Kanban view, merge/split, automation rule builder with templates, auto courier assignment rules, approval workflows, field-level permissions UI, admin PWA with push and camera scanner.
**M12 — Inventory and finance:** size-curve analysis, purchase/production orders and receiving, suppliers, stock transfers, stock takes, dead stock & markdown suggestions, COD reconciliation (file import + API where available), gateway settlements, true profit report, scheduled email reports, anomaly alerts, custom dashboards.
**M13 — CRM, marketing automation and AI content:** loyalty program and tiers, RFM segments, automated journeys, broadcasts with cost estimate, audience sync, ad spend import + ROAS, promo calendar, unique-code campaigns, AI providers (Anthropic/OpenAI/Gemini) with per-feature config, budgets and usage report; AI product description/SEO/alt text/translation drafts; product quality checker; SEO score and broken link checker.

✅ Phase 2 acceptance: each feature has its toggle, admin UI, tests, and guide entry; AI features switch provider from admin without code changes and respect budgets.

### Phase 3 — Advanced and intelligence

**M14 — Personalization and experimentation:** personalized recommendations ("for you", frequently bought together from order data), visual search (image upload → similar products via AI embeddings/vision), A/B testing framework for blocks/banners/offers.
**M15 — Support:** unified inbox (WhatsApp Cloud, Messenger, Instagram, live chat widget), create order from chat, tickets with SLA, canned replies, AI reply suggestions, AI chat assistant with tool calls (product info, size advice, stock, order status) and human handoff, click-to-call telephony integration (generic provider).
**M16 — Loyalty extensions:** referral program, gift cards (buy, send, redeem), store credit wallet UI, affiliate/influencer tracking and commissions.
**M17 — Advanced analytics and procurement:** demand forecasting and reorder suggestions, materials & BOM, cohort/LTV reports, report builder, expenses and P&L, public API keys and outbound webhooks, config bundle export/import polish for onboarding new brands.

✅ Phase 3 acceptance: as above, plus a new brand can be launched from an exported config bundle on a fresh deployment in under one hour.

---

## 17. Default values

Seeded defaults. All are editable in admin; none may be hardcoded in UI logic.

| Setting | Default |
| --- | --- |
| Default locale / enabled locales | `bn` / `bn, en` |
| Bangla digits in `bn` locale | On |
| Currency display | `৳` before amount, no decimals, standard grouping (lakh grouping optional) |
| Time zone | Asia/Dhaka |
| Order number format | `{PREFIX}{YYMMDD}{SEQ4}`, prefix = first 3 letters of brand name uppercased |
| Shipping zones | "Inside Dhaka City" ৳70, 1–2 days; "Outside Dhaka" ৳130, 3–5 days |
| Weight rule | First 1,000 g included; +৳20 per additional 1,000 g |
| Default item weight | 400 g |
| Free delivery threshold | Disabled (null) |
| Payment methods enabled | COD on; online methods off until configured |
| Payment rules | As in 6.5 (only blocklist rule active) |
| OTP at checkout | Off |
| Payment timeout for `pending_payment` | 30 min |
| Risk thresholds | low < 30, medium < 60, high ≥ 60; hold high-risk orders: off |
| Duplicate window | 60 min |
| Returns | Exchange on, refund on, store credit on; window 7 days; customer pays delivery for size change; brand pays for damaged/wrong item |
| Doorstep rejection | Allowed; customer pays delivery charge only; advance refunds via original mobile-banking method (manual) |
| Low stock threshold | 3 |
| Low stock message on PDP | Show when available ≤ 5 |
| Reviews | Verified buyers only; moderation required |
| Loyalty (when enabled) | 1 point per ৳100; 1 point = ৳1; max 20% of order; expiry 12 months |
| Customer email at checkout | Optional |
| Terms checkbox at checkout | Off |
| Cart reservation | None for carts (only orders) |
| Max coupon codes per order | 1 |
| Abandoned cart (when enabled) | Message 1 after 1 h, message 2 after 24 h (with optional coupon) |
| Review request | 3 days after delivery |
| Media upload limits | Images 15 MB; video 50 MB |
| Session timeouts (staff) | Idle 2 h, absolute 7 days |
| Theme preset | "Minimal" |
| Fonts | Hind Siliguri (Bangla) + Inter (Latin) or the closest well-supported pair; record choice |

---

## 18. Out of scope and open items

**Out of scope (for now):** physical store POS, multi-currency/international shipping, marketplace (multiple sellers), native mobile apps (the API must support them later; PWA covers mobile now), multi-tenant single deployment (white-label is per deployment), VAT calculation (setting exists, disabled).

**Owner-provided later (do not block development):**
- Brand name, logo, colors, fonts — use the demo brand until provided; all set in admin.
- Policy texts (Privacy, Terms, Return & Exchange, Shipping) — placeholders with "needs content".
- Merchant credentials: SSLCommerz, bKash, Nagad, Steadfast, Pathao, RedX, SMS gateway, WhatsApp Cloud API, email provider, AI provider keys, Google OAuth, Meta/GA/TikTok IDs — entered in admin Integrations when available.
- Domain names and production hosting choice (free mode first; VPS later).
- Trade license / DBID numbers for the footer.

**Decisions Claude Code must record in `docs/DECISIONS.md` when made:** ID format, PDF rendering approach on free tier, BD location dataset source, the two named SMS gateways, font pair, any deviation from this spec.

