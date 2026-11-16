# Manual testing guide

A practical, click-through checklist for exercising everything built so
far (Milestones 0–9). Pairs with `docs/ADMIN_GUIDE.md` (what each admin
screen does) and `docs/PROJECT_SPEC.md` (why). Run the **Setup** section
once, then either the **15-minute smoke test** for a fast pass or the
**full walkthrough** below it for real coverage.

Every mock driver (SMS, email, WhatsApp, payment, courier, tracking,
captcha, fraud-check) works with **zero configuration** — nothing here
needs real credentials. Where a message would normally go to a real
phone/inbox, it instead lands in the admin's **Notifications → Logs**
screen (or, for OTP specifically, right in the API response / on-screen
as "dev code").

---

## 0. One-time setup

```bash
cp .env.example .env
# fill in APP_ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

docker compose -f infra/compose/docker-compose.dev.yml up -d
pnpm install
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed          # Super Admin role, permissions, BD locations
pnpm db:seed:demo     # + "Demo Fashion" brand + a small browsable catalog
pnpm dev
```

This starts Postgres (`:5432`), MinIO (S3-compatible storage, `:9000`
API / `:9001` console), MailHog (`:8025` web UI) via Docker, then all
three apps:

| App | URL |
| --- | --- |
| Storefront | http://localhost:3000 |
| Admin | http://localhost:3001 |
| API | http://localhost:4000 (Swagger: `/api/docs`, non-production only) |

### Create the Super Admin

1. Visit **http://localhost:3001/setup**.
2. Fill in name/email/password (12+ characters — `security.
   passwordMinLength`).
3. You'll see a QR code. Scan it with any authenticator app (Google
   Authenticator, Authy, 1Password, etc.) — or, if you don't want to
   use a phone, see "Testing 2FA without a phone" below.
4. Enter the 6-digit code to confirm. **2FA is mandatory for every
   staff account** (§12) — there's no way to skip this.
5. Log in at http://localhost:3001/login with the same email/password
   + a fresh 6-digit code.

**Testing 2FA without a phone**: open the Network tab in devtools before
step 2 above, submit the form, and read the `otpauthUrl` field in the
`POST /setup/super-admin` response — it contains a `secret=` query
param. Paste that into any online/offline TOTP generator (or Node:
`node -e "console.log(require('otplib').generate({secret: 'PASTE_HERE'}))"`
if you ran `pnpm install` inside `apps/api`). This is exactly what
`e2e/tests/admin-login-2fa.spec.ts` does automatically.

---

## 1. Fifteen-minute smoke test

Enough to touch most subsystems in one pass. Do this first.

- [ ] **Storefront loads** at `/` (bn by default) and `/en` (English) —
      header, footer, home blocks all render.
- [ ] **Browse**: visit `/c/panjabi`, see the demo products.
- [ ] **PDP**: click into "Cotton Panjabi White", see gallery/price/add
      to cart.
- [ ] **Search**: `/search?q=panjabi` returns results.
- [ ] **Cart → checkout (COD, guest)**: add to cart → `/checkout` → fill
      contact + Dhaka/Dhaka/Adabor address → Save address → place order
      with COD. Land on the success page.
- [ ] **Track it**: `/track`, enter the order number (copy it from the
      admin orders list) + the phone you used.
- [ ] **Admin orders**: http://localhost:3001/orders — the order you
      just placed is there as `pending`/`confirmed`.
- [ ] **Confirm → ship → deliver**: open the order, confirm it, then
      (Fulfillment) pack it and book a (mock) courier. Wait ~1–2 minutes
      (the mock courier progresses on a timer) and refresh — status
      should move toward `delivered` on its own.
- [ ] **Notification logs**: http://localhost:3001/notifications →
      Logs. You should see `order_placed`/`order_confirmed` entries
      with real rendered message bodies, `provider: mock`.
- [ ] **Dashboard**: http://localhost:3001 — the order shows up in
      today's KPIs.
- [ ] **Launch checklist**: http://localhost:3001/launch-checklist —
      everything owner-side should show **pending** on a fresh install
      (this is correct — see §9 below); "staff 2FA" should be green.

If all of that works, the core platform is healthy. Continue below for
real per-feature coverage.

---

## 2. Platform foundations (M1)

- [ ] **Settings**: Settings → Theme → change `theme.brandColor`, Save.
      Reload the storefront — the new color applies within seconds, no
      deploy.
- [ ] **Audit log**: Audit (`/audit`) — the setting change you just made
      is there with before/after values and your staff id.
- [ ] **Media**: Media → upload a real JPEG/PNG. Confirm it generates
      thumb/md/lg sizes and a blur placeholder (hover the item to see
      dimensions).
- [ ] **Media rejects bad uploads**: try uploading a `.svg` file, or
      rename a `.txt` file to `.jpg` and upload it — both should be
      refused with a clear error (§12 MIME sniffing).
- [ ] **RBAC**: Staff & roles → create a role with only `orders.manage`.
      Create a second staff user with that role, log in as them (separate
      browser/incognito), confirm: Orders works, but Products/Settings/
      etc. are either hidden from the nav or 403 if hit directly.
- [ ] **Bilingual UI**: switch the admin's own locale (URL `/bn/...` vs
      `/en/...`) and confirm labels change.
- [ ] **BD locations**: Settings/Locations — browse the division →
      district → area tree is fully populated (this came from the base
      seed).

---

## 3. Catalog and inventory (M2)

- [ ] **Category tree**: Catalog → Categories — create a child category
      under an existing one.
- [ ] **Attributes & size charts**: create an attribute (e.g. "Fabric"),
      a size chart, attach both to a category.
- [ ] **Sized product**: Products → New — add a "Size" option with
      S/M/L values, confirm the variant matrix auto-generates 3 rows;
      set different stock per variant.
- [ ] **Free-size product**: a product with no options, one variant.
- [ ] **Collections**: Collections — create a manual one (pick 2
      products) and an automatic one (rule: `tag = sale`); tag a product
      `sale` and confirm it joins the automatic collection without
      re-saving the collection.
- [ ] **Inventory adjustment**: Inventory — adjust a variant's stock
      with a reason, confirm the movement history shows it.
- [ ] **CSV import dry run**: Import/Export — import a small CSV with one
      intentionally bad row; confirm dry-run reports the error without
      writing anything, then uncheck dry-run and re-run.
- [ ] **Search synonyms**: Search settings — add "panjabi" ↔ "পাঞ্জাবি"
      if not already there, confirm both terms find the same product on
      the storefront.

---

## 4. Theme, CMS, storefront shell (M3)

- [ ] **Theme change propagates**: change `theme.headerVariant`, see the
      storefront header layout change within ~10s.
- [ ] **Page builder**: CMS → Pages → Home — drag a block, use the live
      preview iframe, save as draft, then **Publish** and confirm the
      storefront home page updates.
- [ ] **Scheduled publish**: schedule a change for 1–2 minutes in the
      future, confirm it goes live on its own (the scheduler's 60s tick
      picks it up).
- [ ] **Version history**: restore an older published version of a page.
- [ ] **Announcements**: CMS → Announcements — create one with a short
      end time, confirm it appears then disappears on the storefront.
- [ ] **Policy "needs content" state**: visit `/pages/privacy-policy` on
      the storefront (should show a draft/placeholder state) — this is
      also what the launch checklist's "policies filled" item checks.
- [ ] **404 / maintenance**: visit a nonexistent storefront URL (404
      page from CMS); toggle `features.maintenanceMode` on, confirm the
      storefront shows the maintenance page, then toggle it back off.

---

## 5. Storefront catalog experience (M4)

- [ ] **Filters**: on a category page, filter by an attribute/price
      range, confirm the result count and facet counts update.
- [ ] **Sort**: switch sort to price ascending/descending.
- [ ] **Instant search suggestions**: start typing in the search box,
      confirm a dropdown of suggestions appears before you hit enter.
- [ ] **Variant switching**: on the sized PDP, click a different size —
      price/stock/add-to-cart state updates; try a combination with 0
      stock and confirm it's disabled.
- [ ] **Wishlist**: as a guest, add to wishlist (stored locally); log in
      and confirm it's still there / merges into the account.
- [ ] **Recently viewed**: visit 2–3 PDPs, confirm a "recently viewed"
      rail appears with them.
- [ ] **Notify me**: on a 0-stock variant, use "notify me", confirm it's
      recorded (Catalog → a notify-me list, or check the DB/admin if no
      dedicated screen).
- [ ] **SEO**: view page source on a PDP — confirm `<title>`,
      meta description, and a `Product`/`Offer` JSON-LD `<script>` block
      are present; check `/sitemap.xml` and `/robots.txt` load.

---

## 6. Cart, checkout, payments, customer auth (M5)

- [ ] **Pricing pipeline**: add an item, apply a discount code (create
      one first in Discounts if none exist), confirm the total updates
      server-side (refresh the page — the discount persists).
- [ ] **Shipping fee changes live**: Settings/Shipping — change the
      "Outside Dhaka" fee, confirm an in-progress cart's total updates on
      the next cart fetch with no deploy.
- [ ] **OTP login**: Account → Login — request an OTP, read the
      `devCode` shown on screen (dev-mode only), enter it, confirm login.
- [ ] **Guest checkout, COD** — already covered in the smoke test.
- [ ] **Advance-payment / OTP-required payment rule**: Payment rules —
      create a rule like "risk score ≥ X → require advance payment",
      trigger it with a test order, confirm checkout now shows "advance
      payment required" and routes through the mock payment gateway.
- [ ] **Mock payment gateway**: choose a non-COD method at checkout,
      confirm you're redirected to (or shown) the mock gateway's
      success/fail choice, and the order's payment status updates
      accordingly.
- [ ] **Stock race (advanced, optional)**: set a variant's stock to 1,
      open checkout in two browser profiles, add it to both carts, place
      both orders at nearly the same time — exactly one should succeed,
      the other should get an "out of stock" error. (This exact scenario
      has an automated test — see §10.)
- [ ] **Expired reservation**: place an order with a payment method that
      requires online payment, abandon it, and wait past the reservation
      window — the embedded scheduler ticks every 60s and releases
      expired reservations on its own; confirm the stock count goes back
      up and the order is cancelled.

---

## 7. Order management and fulfillment (M6)

- [ ] **Order detail**: edit an unshipped order's items (add/remove a
      line), confirm totals re-price automatically.
- [ ] **Manual order**: Orders → New — create a phone-order manually.
- [ ] **Full lifecycle with mock courier**: confirm → pack (the packing
      screen's scan box accepts the SKU typed/scanned) → book → wait —
      status should progress to `delivered` on its own within a couple
      of minutes.
- [ ] **Doorstep rejection**: on a different test order, use the
      "rejected at door" flow (from the shipment/courier webhook
      simulation, or manually via the order's status actions) — confirm
      stock restocks after QC and a refund record is created for the
      advance minus the delivery fee, and the customer's risk count goes
      up.
- [ ] **Returns & exchanges**: Account → Returns (storefront) or Orders
      → the order → Returns — request a return on a delivered order,
      then in admin: approve → receive → inspect → resolve. Try an
      exchange (reserves the replacement stock immediately on approval).
- [ ] **Blocklist**: block a phone number from a customer's profile,
      confirm a new guest checkout with that phone is refused.
- [ ] **Return-window edge case**: this is covered by an automated test
      (§10) — manually, you can shorten `returns.windowDays` to 0 and
      confirm a return request on an already-delivered order is refused.

---

## 8. Notifications and messaging (M7)

- [ ] **Templates**: Notifications → Templates — edit the
      `order_confirmed` SMS template's bn text, use "Preview", then "Send
      test" to your own test data.
- [ ] **Channel matrix**: switch `order_shipped`'s primary channel from
      SMS to WhatsApp (no code change needed) — place an order through
      shipping and confirm the log now shows a WhatsApp attempt instead.
- [ ] **Fallback order**: configure a channel matrix entry with SMS as
      primary and email as fallback; make the mock SMS driver simulate
      failure (Integrations → the SMS mock instance's config → `simulate:
      failure`), trigger the event, confirm the log shows SMS failing and
      email being tried next.
- [ ] **Staff notifications**: trigger something that notifies staff
      (e.g. a new high-risk order) and check the in-app notification bell
      in the admin shell.

---

## 9. Marketing, customers, reviews, tracking, reports (M8)

- [ ] **Discount types**: create percent, fixed-amount, and
      free-shipping discounts; confirm the margin guard blocks saving one
      that would price below cost (needs a variant with a cost price
      set).
- [ ] **Bulk codes**: generate 10 unique codes for a discount, export/
      view the list, redeem one at checkout.
- [ ] **Flash sale**: create one with a near-future end time, confirm
      the storefront shows a countdown and the price drops while active.
- [ ] **Customer profile & segments**: Customers → pick one → see
      orders/addresses/reviews/risk score; Segments → build a rule
      (e.g. "orders count ≥ 1"), confirm the live member-count preview
      updates.
- [ ] **Customer privacy actions**: on a customer profile, try "Export
      data" (downloads/returns a JSON bundle) and "Anonymize" — confirm
      the latter scrubs name/phone/email but the customer's past orders
      still show their totals (not deleted). Both need the
      `customers.privacy` permission on your role.
- [ ] **Reviews**: as a customer with a delivered order, submit a review
      (with a photo) for one of its items; in admin, Reviews — approve
      it; confirm it appears on the PDP.
- [ ] **Q&A**: ask a question on a PDP (no purchase needed), answer it in
      admin.
- [ ] **Tracking end-to-end**: Integrations → add a tracking provider
      instance using the **mock** driver, enable it. Place an order,
      then check Tracking logs (or query the DB) for a `Purchase` event —
      confirm the **same `event_id`** appears for both the client-side
      pixel fire (check browser devtools → Network, or console) and the
      server-side log entry. This is the exact M8 acceptance criterion.
  - Also check the **Launch checklist** page — "tracking verified" only
    goes green once a *real* (non-mock) driver is enabled AND at least
    one event has status `sent`.
- [ ] **Feeds**: Feeds settings — enable feeds, set a secret token, then
      visit `/feeds/meta-catalog.xml?token=...` and
      `/feeds/google-merchant.xml?token=...` — confirm valid XML with
      your demo products.
- [ ] **Reports**: Reports — pick each report (sales, products, courier,
      staff, discounts, search terms), change the date range, export CSV,
      confirm the download works and the export shows up in the audit
      log.

---

## 10. Hardening and launch readiness (M9)

- [ ] **Mandatory 2FA**: create a new staff user (Staff & roles), log in
      as them — you should be forced to `/totp-setup` before anything
      else works, even if you try to navigate straight to `/orders`.
- [ ] **Login lockout**: fail a login 5 times in a row (wrong password)
      for any staff account — the 6th attempt (even with the right
      password) should be refused as locked for ~15 minutes
      (`security.loginMaxAttempts`/`loginLockoutMinutes`).
- [ ] **Session idle timeout**: lower `security.staffSessionIdleMinutes`
      to 1 in Settings, leave the admin idle for 2+ minutes, then try a
      request — you should be logged out.
- [ ] **Log out everywhere**: log in on two browsers as the same staff
      user, use "Log out everywhere" on one — confirm the other is now
      logged out too.
- [ ] **Security headers**: `curl -I http://localhost:3001` (admin) and
      check for `Content-Security-Policy`, `X-Content-Type-Options`,
      `Strict-Transport-Security` in the response headers.
- [ ] **Admin IP allow-list** (be careful — test from a second
      device/tab you can still use to undo it): set
      `security.adminIpAllowlist` to an IP that is **not** yours,
      confirm you're locked out with `IP_NOT_ALLOWED`; set it back to
      empty from the API directly if you lock yourself out
      (`PATCH /admin/settings/security.adminIpAllowlist` with an empty
      string, using a tool like `curl`/Postman with a still-valid session
      cookie, or just clear the `settings` row in the DB).
- [ ] **File upload rejection** — already covered in §2 (media).
- [ ] **Courier webhook secret**: Integrations → a courier provider
      instance → set a `webhookSecret`. Then:
      `curl -X POST http://localhost:4000/api/v1/webhooks/couriers/steadfast -H "Content-Type: application/json" -d '{"consignment_id":"test","status":"pending"}'`
      without the header should 403; add
      `-H "X-Webhook-Secret: <the secret>"` and it should go through
      (assuming a shipment with that `consignment_id` exists).
- [ ] **Launch checklist**: `/launch-checklist` — walk through every
      item; mark "sitemap submitted" done manually and confirm it flips
      green; everything else should reflect real state (e.g. enabling a
      real/non-mock provider instance for payment/courier/SMS should
      flip that item).

---

## 11. Automated tests

```bash
pnpm typecheck && pnpm lint      # whole monorepo
pnpm test                        # unit tests only (fast, no services needed)
pnpm test:coverage               # same, with a coverage report per package

# needs the Postgres container from §0 running, with migrations applied:
pnpm test:integration            # real Postgres, real HTTP requests — auth/2FA/RBAC,
                                  # the concurrent-last-unit-purchase race, courier webhooks

# needs all three apps running (pnpm dev in another terminal) AND the DB seeded:
pnpm e2e                         # Playwright: guest checkout journey, admin 2FA setup
```

`pnpm e2e` opens a real (headless by default) browser — use
`pnpm --filter e2e test:ui` for the interactive Playwright UI if you want
to watch it click through.

### Known limitation

`pnpm build` currently fails on a confirmed upstream Next.js 16.4.x bug
during static export (unrelated to any feature — see `docs/DECISIONS.md`,
2026-11-06). `pnpm dev` is unaffected; this only matters if you're testing
a production build specifically.

---

## 12. Load testing (optional, needs a real deployment)

```bash
# needs k6 installed (https://k6.io) and a real/seeded deployment to point at
k6 run -e BASE_URL=https://your-api-host/api/v1 \
       -e VARIANT_ID=<a real variant id from your catalog> \
       infra/loadtest/browse-cart-checkout.js
```
