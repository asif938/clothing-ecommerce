# Admin guide (bn/en)

Module-by-module reference for store staff. Each section is short on
purpose — it explains what the module is for and the things that aren't
obvious from the screen itself, not every field. Permission names in
parentheses are what a role needs to see/use that module (see **Staff &
roles** below) — a missing permission is the usual reason a menu item
doesn't appear.

---

## Dashboard (`reports.read`)

**EN** — Today/7-day/30-day KPIs: revenue, orders, average order value,
conversion rate, delivered rate, doorstep-rejection rate. Clicking an
"orders by status" count jumps straight to the filtered orders list. Low
stock and recent provider-error alerts show here first.

**BN** — আজ/৭ দিন/৩০ দিনের KPI: রেভিনিউ, অর্ডার সংখ্যা, গড় অর্ডার মূল্য,
কনভার্সন রেট, ডেলিভারি রেট, দরজায় প্রত্যাখ্যানের হার। স্ট্যাটাস-ভিত্তিক
অর্ডার সংখ্যায় ক্লিক করলে সরাসরি ফিল্টার করা অর্ডার তালিকায় যাবে।

## Orders (`orders.manage`)

**EN** — Filter/search/bulk-action the order list; saved views keep a
filter combination for later. Order detail has the full timeline, lets
you edit items before shipping (re-prices automatically), add internal
notes and call outcomes, assign an owner, tag, and record payments/
refunds. Manual order creation is here too, for phone/WhatsApp orders.

**BN** — অর্ডার তালিকা ফিল্টার/সার্চ/বাল্ক-অ্যাকশন করুন; সেভড ভিউ পরে
ব্যবহারের জন্য ফিল্টার সংরক্ষণ করে। অর্ডার ডিটেইলে সম্পূর্ণ টাইমলাইন,
শিপ করার আগে আইটেম এডিট (স্বয়ংক্রিয় রি-প্রাইসিং সহ), নোট, কল আউটকাম,
ওনার অ্যাসাইন, ট্যাগ এবং পেমেন্ট/রিফান্ড রেকর্ড করার সুবিধা আছে।

## Fulfillment (`orders.manage` + `fulfillment.manage`)

**EN** — Pick list → packing screen (scan SKUs to confirm) → handover
manifest → courier booking, in that order. A shipment can't be booked
until it's packed. Courier area mapping (below) must have a mapping for
an address's area before it can be booked with that courier.

**BN** — পিক লিস্ট → প্যাকিং স্ক্রিন (SKU স্ক্যান করে কনফার্ম) → হ্যান্ডওভার
ম্যানিফেস্ট → কুরিয়ার বুকিং, এই ক্রমে। প্যাক না হওয়া পর্যন্ত শিপমেন্ট বুক
করা যাবে না।

## Returns (`returns.manage`)

**EN** — Requested → approved → pickup scheduled → received → inspected →
completed. Approving an exchange reserves the replacement stock and
creates the exchange order immediately — reject first if you're not sure
the replacement is in stock. Inspection marks each item pass/fail and
whether it restocks; resolution (refund/store credit) only happens after
inspection.

**BN** — অনুরোধ → অনুমোদিত → পিকআপ নির্ধারিত → গৃহীত → পরিদর্শিত → সম্পন্ন।
এক্সচেঞ্জ অনুমোদন করলে বদলি স্টক রিজার্ভ হয়ে যায় এবং এক্সচেঞ্জ অর্ডার
তৈরি হয় — স্টক নিশ্চিত না হলে আগে প্রত্যাখ্যান করুন।

## Refunds (`refunds.manage`)

**EN** — Every refund created elsewhere (returns, cancellations, doorstep
rejection) lands in this queue as `pending`. Nothing disburses money
automatically — marking a refund `processed` is a manual bookkeeping step
you do after actually sending the money (bKash/bank transfer/etc.).

**BN** — অন্য কোথাও তৈরি হওয়া প্রতিটি রিফান্ড (রিটার্ন, বাতিল, দরজায়
প্রত্যাখ্যান) এই কিউতে `pending` হিসেবে আসে। টাকা স্বয়ংক্রিয়ভাবে পাঠানো
হয় না — আসলে টাকা পাঠানোর পর ম্যানুয়ালি `processed` চিহ্নিত করুন।

## CMS pages (`cms.manage`)

**EN** — Drag-and-drop block editor with a live preview iframe. Draft vs.
published are separate copies — "Publish" copies draft blocks into the
published slot; "Schedule" does the same at a future time automatically.
Version history lets you restore an older published version. An edit
lock prevents two staff from clobbering each other's draft.

**BN** — লাইভ প্রিভিউ সহ ড্র্যাগ-অ্যান্ড-ড্রপ ব্লক এডিটর। ড্রাফট এবং
পাবলিশড আলাদা কপি — "Publish" ড্রাফট ব্লক পাবলিশড স্লটে কপি করে। ভার্সন
হিস্টরি থেকে আগের পাবলিশড ভার্সনে ফিরে যাওয়া যায়।

## CMS announcements (`cms.manage`)

**EN** — Top-of-page bars with a start/end schedule and optional link.
Only one per locale shows at a time if several overlap — the highest
`priority` wins.

**BN** — পেজের উপরে শুরু/শেষ সময় এবং ঐচ্ছিক লিংক সহ ব্যানার বার। একাধিক
ওভারল্যাপ করলে সর্বোচ্চ `priority`-র ব্যানারটি দেখা যাবে।

## Products (`catalog.manage`)

**EN** — The full product editor: title/description (bn+en), options
(size/color/generic) and the variant matrix generated from them, pricing,
images per variant, SEO fields, related products. "Free size" is just a
product with one variant and no options. Cost price is hidden from staff
without `catalog.cost.read`.

**BN** — সম্পূর্ণ প্রোডাক্ট এডিটর: টাইটেল/বর্ণনা (bn+en), অপশন
(সাইজ/রং/জেনেরিক) থেকে তৈরি ভ্যারিয়েন্ট ম্যাট্রিক্স, প্রাইসিং, প্রতি
ভ্যারিয়েন্টে ছবি, SEO ফিল্ড। "ফ্রি সাইজ" মানে শুধু একটি ভ্যারিয়েন্ট,
কোনো অপশন ছাড়া।

## Catalog: categories, attributes, size systems/charts (`catalog.manage`)

**EN** — Categories are a tree (parent/child); a category can list which
attributes apply to it, which drives what the product editor shows for
products in it. Size charts attach to a category or a specific product.

**BN** — ক্যাটাগরি একটি ট্রি (parent/child); একটি ক্যাটাগরিতে কোন
অ্যাট্রিবিউট প্রযোজ্য তা নির্ধারণ করা যায়, যা প্রোডাক্ট এডিটরে কী
দেখাবে তা নিয়ন্ত্রণ করে।

## Collections (`catalog.manage`)

**EN** — Manual (you pick the products) or automatic (a rule, e.g. "tag =
sale"). Automatic collections re-evaluate membership live — nothing to
re-run.

**BN** — ম্যানুয়াল (আপনি প্রোডাক্ট বেছে নেন) বা অটোমেটিক (একটি নিয়ম,
যেমন "tag = sale")। অটোমেটিক কালেকশন লাইভ আপডেট হয়।

## Price schedules (`catalog.manage`)

**EN** — Scheduled price/compare-at-price changes for a future window
(e.g. a weekend sale) without touching the base price — reverts
automatically when the window ends.

**BN** — নির্দিষ্ট সময়ের জন্য প্রাইস/compare-at-price পরিবর্তন (যেমন
উইকেন্ড সেল), বেস প্রাইস স্পর্শ না করে — সময় শেষ হলে স্বয়ংক্রিয়ভাবে
ফিরে যায়।

## Inventory (`inventory.manage`)

**EN** — Stock levels per variant per location, adjustments (with a
reason), movement history, low-stock thresholds (drives the dashboard
alert). CSV/Excel import/export has a dry-run mode that reports errors
without writing anything.

**BN** — প্রতি লোকেশনে প্রতি ভ্যারিয়েন্টের স্টক লেভেল, সমন্বয় (কারণ
সহ), মুভমেন্ট হিস্টরি, লো-স্টক থ্রেশহোল্ড। CSV/Excel ইম্পোর্ট/এক্সপোর্টে
ড্রাই-রান মোড আছে যা কিছু না লিখেই এরর রিপোর্ট করে।

## Shipping (`shipping.manage`)

**EN** — Zones (e.g. "Inside Dhaka City", "Outside Dhaka") and their rates
map to BD districts/areas; the weight rule (included weight + per-extra-kg
fee) stacks on top of the zone rate. Changes apply to checkout
immediately, no deploy.

**BN** — জোন (যেমন "ঢাকার ভেতরে", "ঢাকার বাইরে") এবং তাদের রেট বাংলাদেশের
জেলা/এলাকার সাথে ম্যাপ করা থাকে; ওজনের নিয়ম জোন রেটের উপর যুক্ত হয়।
পরিবর্তন সাথে সাথে চেকআউটে কার্যকর হয়।

## Payment rules (`payment_rules.manage`)

**EN** — Conditional rules (by risk score, order value, customer history,
area…) that can disable a payment method, require an advance payment, or
require OTP verification at checkout. Order matters — the first matching
rule wins.

**BN** — শর্তসাপেক্ষ নিয়ম (রিস্ক স্কোর, অর্ডার মূল্য, গ্রাহকের ইতিহাস,
এলাকা অনুযায়ী) যা একটি পেমেন্ট পদ্ধতি নিষ্ক্রিয় করতে, অগ্রিম পেমেন্ট
বা OTP যাচাই বাধ্যতামূলক করতে পারে। ক্রম গুরুত্বপূর্ণ — প্রথম মিলে যাওয়া
নিয়মটি প্রযোজ্য হয়।

## Courier area mapping (`couriers.manage`)

**EN** — Maps this store's BD area list to each courier's own area/zone
codes — required before a courier can be booked for addresses in that
area. Unmapped areas fall back to manual booking.

**BN** — এই স্টোরের এলাকা তালিকাকে প্রতিটি কুরিয়ারের নিজস্ব এলাকা/জোন
কোডের সাথে ম্যাপ করে — ওই এলাকার জন্য কুরিয়ার বুক করার আগে এটি দরকার।

## Blocklist (`blocklist.manage`)

**EN** — Phone numbers/addresses that can't place orders (COD abuse,
repeated doorstep rejection). Blocking a customer from their profile adds
their phone here automatically.

**BN** — যে ফোন নম্বর/ঠিকানা অর্ডার দিতে পারবে না (COD অপব্যবহার, বারবার
দরজায় প্রত্যাখ্যান)। গ্রাহকের প্রোফাইল থেকে ব্লক করলে তাদের ফোন নম্বর
এখানে স্বয়ংক্রিয়ভাবে যুক্ত হয়।

## Notifications (`notifications.manage`)

**EN** — Message templates per event (bn/en, SMS/email/WhatsApp) with
preview and test-send. The channel matrix controls which channel fires
for which event, with a fallback order if the first choice isn't
configured. Notification logs show every attempt, including failures.

**BN** — প্রতি ইভেন্টের জন্য মেসেজ টেমপ্লেট (bn/en, SMS/ইমেইল/WhatsApp),
প্রিভিউ এবং টেস্ট-সেন্ড সহ। চ্যানেল ম্যাট্রিক্স নির্ধারণ করে কোন ইভেন্টে
কোন চ্যানেল চলবে, প্রথমটি কনফিগার না থাকলে ফলব্যাক ক্রম সহ।

## Discounts & flash sales (`discounts.manage`)

**EN** — Automatic discounts (no code) and code-based ones, including
bulk-generated unique codes for a campaign. The margin guard blocks
saving a discount that would price an item below its cost (when cost
price is known). Flash sales are a time-boxed discount with their own
countdown on the storefront.

**BN** — স্বয়ংক্রিয় ডিসকাউন্ট (কোড ছাড়া) এবং কোড-ভিত্তিক, ক্যাম্পেইনের
জন্য বাল্ক-জেনারেটেড ইউনিক কোড সহ। মার্জিন গার্ড এমন ডিসকাউন্ট সংরক্ষণ
আটকায় যা খরচের চেয়ে কম দামে বিক্রি করাবে (খরচ জানা থাকলে)।

## Customers & segments (`customers.manage`; export/anonymize needs `customers.privacy`)

**EN** — Profile shows orders, addresses, reviews, returns, tags, risk
score. Segments are a rule builder (spend, order count, risk, tag,
inactivity, district…) with a live member-count preview — dynamic
segments recompute on every read, nothing to refresh. "Export data" and
"Anonymize" (§12 privacy requests) are Super-Admin-grade actions, audit
logged — anonymize scrubs the customer's PII and every one of their
orders' contact info, but keeps the orders themselves (and totals) for
accounting.

**BN** — প্রোফাইলে অর্ডার, ঠিকানা, রিভিউ, রিটার্ন, ট্যাগ, রিস্ক স্কোর
দেখা যায়। সেগমেন্ট একটি রুল বিল্ডার (খরচ, অর্ডার সংখ্যা, রিস্ক, ট্যাগ,
নিষ্ক্রিয়তা, জেলা...) যার লাইভ মেম্বার-কাউন্ট প্রিভিউ আছে। "এক্সপোর্ট"
ও "অ্যানোনিমাইজ" গ্রাহকের ব্যক্তিগত তথ্য সংরক্ষণ-সংক্রান্ত অনুরোধের জন্য
(§১২) — অ্যাকাউন্টিংয়ের জন্য অর্ডারের মূল তথ্য থেকে যায়, শুধু পরিচয়
মুছে যায়।

## Reviews & Q&A (`reviews.manage`)

**EN** — Only a customer with a delivered order for that exact item can
submit a review (verified purchase). Moderation approves/rejects/replies;
auto-approve is a setting. Q&A works the same way but anyone can ask, not
just buyers.

**BN** — শুধু সেই নির্দিষ্ট আইটেম ডেলিভারি পাওয়া গ্রাহকই রিভিউ দিতে
পারবেন (ভেরিফায়েড পারচেস)। মডারেশনে অনুমোদন/প্রত্যাখ্যান/রিপ্লাই করা
যায়; অটো-অ্যাপ্রুভ একটি সেটিং।

## Reports (`reports.read`)

**EN** — Sales, products, courier performance, staff performance,
discount usage, search terms — each with a date range and CSV export.
Exporting is audit-logged (it's a sensitive read, §12) along with
everything else staff do here.

**BN** — সেলস, প্রোডাক্ট, কুরিয়ার পারফরম্যান্স, স্টাফ পারফরম্যান্স,
ডিসকাউন্ট ব্যবহার, সার্চ টার্ম — প্রতিটির ডেট রেঞ্জ এবং CSV এক্সপোর্ট সহ।
এক্সপোর্ট করা অডিট লগে রেকর্ড হয়।

## Product feeds (`settings.feeds.write`)

**EN** — Meta catalog / Google Merchant XML feed URLs, gated by a secret
token (not encrypted like other secrets — you need to see it to paste
into Meta/Google's own feed-URL field). Feeds refuse to serve while the
token is empty.

**BN** — Meta ক্যাটালগ / Google Merchant XML ফিড URL, একটি সিক্রেট টোকেন
দিয়ে সুরক্ষিত — টোকেন খালি থাকলে ফিড কাজ করবে না।

## Import/export (`catalog.manage` / `inventory.manage`)

**EN** — Bulk CSV/Excel product and inventory import, dry-run first,
error report per row on failure.

**BN** — বাল্ক CSV/Excel প্রোডাক্ট ও ইনভেন্টরি ইম্পোর্ট, প্রথমে ড্রাই-রান,
ব্যর্থ হলে প্রতি সারির এরর রিপোর্ট।

## Search settings (`search.manage`)

**EN** — The Banglish/synonym table (so "panjabi"/"panjabi"/"পাঞ্জাবি" all
find the same product) is editable here, not in code.

**BN** — বাংলিশ/সমার্থক শব্দ টেবিল (যাতে "panjabi"/"পাঞ্জাবি" একই প্রোডাক্ট
খুঁজে পায়) এখান থেকে এডিট করা যায়, কোডে নয়।

## Settings (`settings.<group>.write`, varies per group)

**EN** — Every admin-configurable value in the system lives here, grouped
(brand, theme, security, checkout, returns, tracking, feeds, security,
ops…), auto-rendered from each setting's own definition. A setting marked
secret is write-only — you can replace it but never see the old value
again. `security.adminIpAllowlist` and the password/lockout/session
settings are under the **security** group.

**BN** — সিস্টেমের প্রতিটি অ্যাডমিন-কনফিগারযোগ্য মান এখানে গ্রুপ করা আছে
(ব্র্যান্ড, থিম, সিকিউরিটি, চেকআউট, রিটার্ন, ট্র্যাকিং, ফিড, অপারেশন...)।
সিক্রেট চিহ্নিত সেটিং শুধু-লেখা — পুরনো মান আর দেখা যাবে না, শুধু
প্রতিস্থাপন করা যাবে।

## Staff & roles (`staff.manage`, `rbac.manage`)

**EN** — Create staff accounts and roles with a permission matrix. Every
staff account must enable TOTP 2FA before it can use anything beyond
"who am I"/"log out" — this is enforced on login, not optional (§12). The
"Super Admin" role has every permission and can't be edited away from
that. "Log out everywhere" (on the user's own session menu) revokes every
session for that account at once, for a suspected-compromise scenario.

**BN** — স্টাফ অ্যাকাউন্ট এবং পারমিশন ম্যাট্রিক্স সহ রোল তৈরি করুন।
প্রতিটি স্টাফ অ্যাকাউন্টে অন্য কিছু করার আগে TOTP 2FA চালু করতে হবে —
এটি লগইনে বাধ্যতামূলক, ঐচ্ছিক নয়। "সব জায়গা থেকে লগআউট" একসাথে সেই
অ্যাকাউন্টের সব সেশন বাতিল করে।

## Media library (`media.manage`)

**EN** — Upload, folders, generated sizes + blur placeholder, focal point
for cropping, usage (which products/pages reference a file). Uploads are
sniffed server-side — an SVG or a file whose real bytes don't match its
claimed type is refused (§12).

**BN** — আপলোড, ফোল্ডার, জেনারেটেড সাইজ + ব্লার প্লেসহোল্ডার, ক্রপের
জন্য ফোকাল পয়েন্ট, ব্যবহার (কোন প্রোডাক্ট/পেজ ফাইলটি ব্যবহার করছে)।
আপলোডের আসল বাইট যাচাই করা হয় — SVG বা ভুল টাইপ দাবি করা ফাইল প্রত্যাখ্যাত
হয়।

## Integrations / providers (`providers.manage`)

**EN** — Every third-party service (SMS, email, WhatsApp, payment,
courier, captcha, fraud check, tracking, storage) is a "provider
instance" here: pick a driver, fill its config, enable it, test the
connection. A courier's `webhookSecret` field (if it has one) should
match what you paste into that courier's own webhook settings — without
it, status-update webhooks from that courier are accepted unauthenticated
(fine for sandbox, not for a live courier, §12).

**BN** — প্রতিটি থার্ড-পার্টি সার্ভিস (SMS, ইমেইল, WhatsApp, পেমেন্ট,
কুরিয়ার, captcha, fraud check, ট্র্যাকিং, স্টোরেজ) এখানে একটি "provider
instance" — ড্রাইভার বেছে নিন, কনফিগ পূরণ করুন, সক্রিয় করুন, কানেকশন
টেস্ট করুন। কুরিয়ারের `webhookSecret` ফিল্ড (থাকলে) সেই কুরিয়ারের নিজের
webhook সেটিংসে যা পেস্ট করছেন তার সাথে মিলতে হবে।

## System health (`providers.manage`)

**EN** — Shared-credit storage provider (e.g. Cloudinary) usage against
its free-tier limit, with the 80%/95% fallback thresholds.

**BN** — শেয়ার্ড-ক্রেডিট স্টোরেজ প্রোভাইডারের (যেমন Cloudinary) ব্যবহার
তার ফ্রি-টায়ার সীমার বিপরীতে, ৮০%/৯৫% ফলব্যাক থ্রেশহোল্ড সহ।

## Launch checklist (`launch_checklist.read`)

**EN** — Every item here is computed from real system state (a real
payment/courier/SMS/tracking provider enabled, policy pages filled in, no
staff account missing 2FA, a backup reported within 48 hours) except
"sitemap submitted", which you mark done yourself after visiting Search
Console — see §16 M9. A fresh/demo install shows every owner-side item as
pending, by design.

**BN** — এখানে প্রতিটি বিষয় সিস্টেমের বাস্তব অবস্থা থেকে স্বয়ংক্রিয়ভাবে
যাচাই করা হয় (রিয়েল পেমেন্ট/কুরিয়ার/SMS/ট্র্যাকিং প্রোভাইডার সক্রিয়,
পলিসি পেজ পূর্ণ, কোনো স্টাফের 2FA বাকি নেই, ৪৮ ঘণ্টার মধ্যে ব্যাকআপ
রিপোর্ট হয়েছে) — শুধু "সাইটম্যাপ জমা দেওয়া" আপনি নিজে চিহ্নিত করবেন।

## Audit log (`audit.read`)

**EN** — Every admin mutation and every sensitive read (report exports,
customer data exports) is here: who, what, when, before/after values.
Nothing here can be edited or deleted by anyone, including a Super Admin.

**BN** — প্রতিটি অ্যাডমিন পরিবর্তন এবং সংবেদনশীল রিড (রিপোর্ট এক্সপোর্ট,
গ্রাহকের তথ্য এক্সপোর্ট) এখানে আছে: কে, কী, কখন, আগে/পরের মান। এখানে
কিছু এডিট বা ডিলিট করা যায় না, সুপার অ্যাডমিনও পারবেন না।
