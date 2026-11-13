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

## Order board, my queue and auto-assignment (`orders.manage`, `orders.queue.manage`)

**EN** — *Order board* shows orders as columns by status; drag a card to
confirm it, put it on hold (a reason is asked) or move it to processing —
the same rules as the order page, so an illegal move just shows an error.
*My order queue* lists the orders assigned to you that still need a call,
oldest first. To share new orders automatically, switch a person on under
*My order queue → Order queue team* and turn on *Auto-assign new orders*
in Settings → orders (round-robin, or whoever has the fewest open orders).
On an order page, *Assign from queue* assigns that one order now.

**BN** — *অর্ডার বোর্ড* অর্ডারগুলোকে স্ট্যাটাস অনুযায়ী কলামে দেখায়; কার্ড
টেনে কনফার্ম করুন, হোল্ডে রাখুন (কারণ জিজ্ঞেস করা হবে) বা প্রসেসিংয়ে নিন
— অর্ডার পেজের মতোই নিয়ম, তাই ভুল সরানোয় শুধু এরর দেখাবে। *আমার অর্ডার
কিউ*-তে আপনাকে দেওয়া যেসব অর্ডারে এখনও কল বাকি তা পুরনো আগে দেখায়।
নতুন অর্ডার নিজে থেকে ভাগ করতে *আমার অর্ডার কিউ → অর্ডার কিউ টিম*-এ
স্টাফকে চালু করুন এবং সেটিংস → orders-এ *নতুন অর্ডার স্বয়ংক্রিয়ভাবে
অ্যাসাইন* চালু করুন (রাউন্ড-রবিন, বা যার খোলা অর্ডার সবচেয়ে কম)।

## Customer self-confirmation (Settings → orders)

**EN** — Turn on *Customer self-confirmation* and every new pending order
sends the customer a link (WhatsApp first, SMS if that fails). Opening it
shows the order and a Confirm button (and Cancel, if you allow it). The
link expires after the number of hours you set. Edit the wording under
Notifications → *Order confirmation request*.

**BN** — *গ্রাহক নিজে অর্ডার কনফার্ম* চালু করলে প্রতিটি নতুন অপেক্ষমাণ
অর্ডারে গ্রাহক একটি লিংক পান (আগে WhatsApp, না গেলে SMS)। লিংক খুললে অর্ডার ও
কনফার্ম বোতাম দেখা যায় (অনুমতি দিলে বাতিলও)। লিংকের মেয়াদ আপনার ঠিক করা
ঘণ্টা পর শেষ হয়। বার্তার ভাষা নোটিফিকেশন → *অর্ডার নিশ্চিতকরণ অনুরোধ*-এ
বদলান।

## Merge & split orders (`orders.merge_split`)

**EN** — On a pending, confirmed or on-hold order: *Merge* folds another
order from the same customer into this one (items and discounts move here,
one delivery charge applies, the other order is closed as "merged"; the
other order must have no payment). *Split* moves chosen units to a new
order — handy for two parcels; at least one unit must stay, the order must
have no payment, and you enter the new order's delivery charge.

**BN** — অপেক্ষমাণ, কনফার্মড বা হোল্ডে থাকা অর্ডারে: *মার্জ* একই গ্রাহকের
আরেকটি অর্ডার এতে মিশিয়ে দেয় (পণ্য ও ডিসকাউন্ট এখানে আসে, একটি ডেলিভারি
চার্জ থাকে, অন্য অর্ডার "মার্জড" হিসেবে বন্ধ হয়; অন্য অর্ডারে কোনো পেমেন্ট
থাকা চলবে না)। *স্প্লিট* বাছাই করা ইউনিট নতুন অর্ডারে সরায় — দুই পার্সেলের
জন্য সুবিধাজনক; অন্তত একটি ইউনিট থাকতে হবে, অর্ডারে পেমেন্ট থাকা চলবে না,
আর নতুন অর্ডারের ডেলিভারি চার্জ আপনি দেবেন।

## Automation (`automation.manage`)

**EN** — A rule is *when* (an order is placed, confirmed, put on hold,
cancelled, shipped, delivered, rejected at the door) + *conditions* (all/any
of: total, risk, tags, district, customer history…) + *actions* (tag, change
status, assign, notify staff, message the customer, call a webhook, add a
note). Start from a template — it is added switched **off** so you can check
the numbers (money is in poisha: 100 = ৳1). Use *Test with a sample event*
with a real order ID to see which conditions pass; nothing is executed.
Rules run within about a minute of the event; *Run history* shows what each
one did or why it failed.

**BN** — একটি রুল হলো *কখন* (অর্ডার প্লেস, কনফার্ম, হোল্ড, বাতিল, শিপ,
ডেলিভার, দরজায় প্রত্যাখ্যান) + *শর্ত* (সব/যেকোনো: মোট, রিস্ক, ট্যাগ, জেলা,
গ্রাহকের ইতিহাস…) + *কাজ* (ট্যাগ, স্ট্যাটাস বদল, অ্যাসাইন, স্টাফকে জানানো,
গ্রাহককে বার্তা, ওয়েবহুক, নোট)। টেমপ্লেট থেকে শুরু করুন — এটি **বন্ধ**
অবস্থায় যোগ হয় যাতে সংখ্যাগুলো যাচাই করতে পারেন (টাকা পয়সায়: ১০০ = ৳১)।
একটি আসল অর্ডার আইডি দিয়ে *নমুনা ইভেন্ট দিয়ে পরীক্ষা* করলে কোন শর্ত মিলছে
দেখা যায়; কিছু কার্যকর হয় না। ঘটনার প্রায় এক মিনিটের মধ্যে রুল চলে;
*রানের ইতিহাস*-এ দেখা যায় কী হয়েছে বা কেন ব্যর্থ হয়েছে।

## Courier rules (`couriers.rules.manage`)

**EN** — Rules like "Chattogram → Pathao", "COD over ৳10,000 → RedX",
"everything else → Steadfast". When booking a packed order choose *Auto
(by courier rules)*: the first active rule (lowest priority number) that
matches picks the courier; if none matches you get a clear error. Use
*Preview for an order* to check a rule set. Keep one condition-less rule
last as the catch-all.

**BN** — "চট্টগ্রাম → Pathao", "১০,০০০ টাকার বেশি COD → RedX", "বাকি সব →
Steadfast"-এর মতো রুল। প্যাক করা অর্ডার বুক করার সময় *অটো (কুরিয়ার রুল
অনুযায়ী)* বেছে নিন: প্রথম মিলে যাওয়া সক্রিয় রুল (সবচেয়ে কম অগ্রাধিকার
সংখ্যা) কুরিয়ার ঠিক করে; কোনোটি না মিললে স্পষ্ট এরর আসে। রুলসেট যাচাই
করতে *একটি অর্ডারের প্রিভিউ* ব্যবহার করুন। শর্তহীন একটি রুল সবার শেষে
ক্যাচ-অল হিসেবে রাখুন।

## Approvals (`approvals.decide`, `approvals.bypass`)

**EN** — Turn on *Require approval for price / shipping overrides* and set
a refund limit in Settings → approvals. A staff member without *bypass*
who tries one of these gets "approval requested" instead of the change;
approvers see it under *Approvals* and approve (the change is applied as
if the requester had done it) or reject with a note. You cannot approve
your own request. A request that was approved but could not be applied
(e.g. the order shipped meanwhile) shows as *Failed to apply* with the
reason.

**BN** — সেটিংস → approvals-এ *দাম / শিপিং ওভাররাইডে অনুমোদন লাগবে* চালু
করুন এবং রিফান্ডের সীমা দিন। *বাইপাস* অনুমতি ছাড়া কেউ এগুলো করতে গেলে
পরিবর্তনের বদলে "অনুমোদনের অনুরোধ" যায়; অনুমোদনকারী *অনুমোদন* পেজে দেখে
অনুমোদন (পরিবর্তনটি অনুরোধকারীর হয়ে কার্যকর হয়) বা নোটসহ প্রত্যাখ্যান করেন।
নিজের অনুরোধ নিজে অনুমোদন করা যায় না। অনুমোদিত কিন্তু কার্যকর করা যায়নি
(যেমন ইতিমধ্যে অর্ডার শিপ হয়ে গেছে) এমন অনুরোধ কারণসহ *কার্যকর হয়নি*
দেখায়।

## Field access (`rbac.manage`)

**EN** — Choose which roles may see customers' full phone numbers and
order cost/profit. Nothing changes until you switch on *Enforce
field-level permissions* in Settings → security — then everyone without the
permission sees masked numbers (01712•••678) and no cost prices on orders,
the order board and the queue. Built-in roles keep full access. Customers
list/export, returns and reports are not covered yet.

**BN** — কোন রোল গ্রাহকের পূর্ণ ফোন নম্বর ও অর্ডারের ক্রয়মূল্য/মুনাফা দেখবে তা
বেছে নিন। সেটিংস → security-তে *ফিল্ড-লেভেল অনুমতি কার্যকর করুন* চালু না
করা পর্যন্ত কিছু বদলায় না — চালুর পর অনুমতি ছাড়া সবাই অর্ডার, বোর্ড ও কিউতে
মাস্ক করা নম্বর (01712•••678) দেখবে এবং ক্রয়মূল্য দেখবে না। বিল্ট-ইন রোল
পূর্ণ অ্যাক্সেস পায়। গ্রাহক তালিকা/এক্সপোর্ট, রিটার্ন ও রিপোর্ট এখনও এর
আওতায় নেই।

## Admin app on your phone & camera scanner

**EN** — Open the admin in Chrome/Edge on your phone and use *Add to home
screen / Install*. Tap *Turn on alerts on this device* (bottom of the menu)
to get push for new orders, high-risk orders, failed payments, low stock
and approval requests — this needs the push keys generated once under
*Push notifications*. The installed app still needs internet (it
deliberately stores nothing offline). On the packing screen, *Scan with
camera* reads order and item barcodes in Chrome/Edge on Android; on other
browsers type the code or use a USB/Bluetooth scanner.

**BN** — ফোনে Chrome/Edge-এ অ্যাডমিন খুলে *Add to home screen / Install*
করুন। নতুন অর্ডার, হাই-রিস্ক অর্ডার, ব্যর্থ পেমেন্ট, কম স্টক ও অনুমোদনের
অনুরোধের পুশ পেতে মেনুর নিচে *এই ডিভাইসে অ্যালার্ট চালু করুন* চাপুন — এর জন্য
*পুশ নোটিফিকেশন* পেজে একবার পুশ কী তৈরি করা থাকতে হবে। ইনস্টল করা অ্যাপেও
ইন্টারনেট লাগে (ইচ্ছে করেই অফলাইনে কিছু রাখা হয় না)। প্যাকিং স্ক্রিনে
*ক্যামেরা দিয়ে স্ক্যান* Android-এর Chrome/Edge-এ অর্ডার ও পণ্যের বারকোড পড়ে;
অন্য ব্রাউজারে কোড টাইপ করুন বা USB/ব্লুটুথ স্ক্যানার ব্যবহার করুন।

## Suppliers & purchase orders (`procurement.manage`)

**EN** — Add suppliers under *Suppliers*. In *Purchase orders* create a
purchase (buying ready goods) or production (factory run) order: pick the
supplier, the location the goods go into, and the variants with quantity
and unit cost. *Mark as sent* once it's placed. When goods arrive, enter
what actually came and press *Receive* (needs *inventory* permission too) —
stock is added and the cost price is updated as set in Settings →
inventory (weighted average by default). Receive in several goes if it
arrives in parts; *Close* a part-received order if the rest won't come.

**BN** — *সাপ্লায়ার* পেজে সাপ্লায়ার যোগ করুন। *পারচেজ অর্ডার*-এ ক্রয় (তৈরি
মাল কেনা) বা প্রোডাকশন (ফ্যাক্টরিতে বানানো) অর্ডার তৈরি করুন: সাপ্লায়ার, কোন
লোকেশনে মাল ঢুকবে, আর ভ্যারিয়েন্ট — পরিমাণ ও একক খরচসহ। অর্ডার দেওয়ার পর
*পাঠানো হয়েছে* চাপুন। মাল এলে আসলে যা এসেছে তা লিখে *গ্রহণ করুন* চাপুন
(ইনভেন্টরি অনুমতিও লাগবে) — স্টক যোগ হয় এবং সেটিংস → ইনভেন্টরি অনুযায়ী
ক্রয়মূল্য আপডেট হয় (ডিফল্ট: ওজনযুক্ত গড়)। ভাগে ভাগে এলে কয়েকবারে গ্রহণ
করুন; বাকিটা না এলে আংশিক অর্ডার *বন্ধ* করুন।

## Stock transfers & stock takes (`inventory.manage`, `inventory.stock_takes.apply`)

**EN** — *Inventory → Transfers*: create a transfer between two locations,
*Dispatch* (units leave the source; they must be available, not reserved
for orders), then *Receive at destination* entering what arrived —
shortfalls are recorded. *Inventory → Stock takes*: start a count for a
location, then type counts or scan barcodes (each scan adds 1). Use the
*Variance* filter to review, then *Apply count* (needs the apply
permission). Sales made while you were counting are kept — only the
counted difference is applied. Uncounted lines stay as they are unless you
choose to treat them as zero.

**BN** — *ইনভেন্টরি → ট্রান্সফার*: দুই লোকেশনের মধ্যে ট্রান্সফার তৈরি করুন,
*পাঠান* (ইউনিট উৎস থেকে বাদ যায়; অর্ডারের জন্য রিজার্ভ নয়, প্রাপ্য হতে হবে),
তারপর পৌঁছালে যা এসেছে লিখে *গন্তব্যে গ্রহণ করুন* — ঘাটতি লেখা থাকে।
*ইনভেন্টরি → স্টক গণনা*: একটি লোকেশনের গণনা শুরু করুন, তারপর সংখ্যা লিখুন বা
বারকোড স্ক্যান করুন (প্রতি স্ক্যানে ১ যোগ হয়)। *পার্থক্য* ফিল্টার দিয়ে দেখে
*গণনা প্রয়োগ* চাপুন (প্রয়োগের অনুমতি লাগবে)। গণনার সময়ের বিক্রি বহাল থাকে —
শুধু গোনা পার্থক্য প্রয়োগ হয়। যেগুলো গোনা হয়নি সেগুলো অপরিবর্তিত থাকে, যদি
না আপনি শূন্য ধরতে বলেন।

## Inventory analysis: size curve & dead stock (`inventory.manage`)

**EN** — *Inventory → Analysis → Size curve*: pick a product (or a whole
category) to compare each size's share of sales with its share of stock; a
negative gap means that size runs short. Enter a planned buy quantity to
get a per-size split. *Dead stock* lists variants with no sale for the set
number of days (Settings → inventory), their stock value and a suggested
markdown from the markdown tiers — never below cost plus the minimum
margin. Tick rows and *Schedule markdowns* to create price schedules
(cancel them under *Price schedules*). Viewing dead stock needs the
cost-price permission.

**BN** — *ইনভেন্টরি → বিশ্লেষণ → সাইজ কার্ভ*: একটি পণ্য (বা পুরো ক্যাটাগরি)
বেছে প্রতিটি সাইজের বিক্রির অংশ ও স্টকের অংশ তুলনা করুন; ঋণাত্মক পার্থক্য
মানে সেই সাইজ কম পড়ছে। পরিকল্পিত ক্রয়ের পরিমাণ দিলে সাইজভিত্তিক ভাগ পাবেন।
*ডেড স্টক* দেখায় কোন ভ্যারিয়েন্ট নির্দিষ্ট দিন (সেটিংস → ইনভেন্টরি) ধরে
বিক্রি হয়নি, তার স্টকের মূল্য ও মার্কডাউন ধাপ থেকে প্রস্তাবিত ছাড় — কখনো
ক্রয়মূল্য + ন্যূনতম মার্জিনের নিচে নয়। সারি টিক দিয়ে *মার্কডাউন শিডিউল
করুন* চাপলে প্রাইস শিডিউল তৈরি হয় (*প্রাইস শিডিউল* থেকে বাতিল করা যায়)।
ডেড স্টক দেখতে ক্রয়মূল্য দেখার অনুমতি লাগে।

## COD reconciliation & gateway settlements (`finance.manage`)

**EN** — *Finance → COD reconciliation* shows COD still with each courier.
*Import settlement*: choose the courier, upload its payout file (CSV/Excel
from the merchant panel), check the three columns (consignment ID,
collected, charge) and *Import & match*. Review flagged lines (no such
parcel, amount differs, duplicate, already settled, not delivered), match
a line by hand if needed, enter what reached the bank and *Confirm*.
Confirmed parcels are marked settled and their courier charge becomes the
actual delivery cost used in True profit. *Gateway settlements*: record
each bKash/Nagad/SSLCommerz payout; the variance column compares it with
our own successful payments for the period.

**BN** — *ফাইন্যান্স → COD রিকনসিলিয়েশন* দেখায় প্রতিটি কুরিয়ারের কাছে কত COD
রয়ে গেছে। *সেটেলমেন্ট ইমপোর্ট*: কুরিয়ার বেছে মার্চেন্ট প্যানেলের পেমেন্ট ফাইল
(CSV/Excel) আপলোড করুন, তিনটি কলাম (কনসাইনমেন্ট আইডি, সংগৃহীত, চার্জ) মিলিয়ে
*ইমপোর্ট ও মিলান* চাপুন। চিহ্নিত লাইনগুলো দেখুন (এমন পার্সেল নেই, টাকা ভিন্ন,
ডুপ্লিকেট, আগেই সেটেলড, এখনো ডেলিভারি হয়নি), দরকার হলে হাতে মিলান, ব্যাংকে
কত এসেছে লিখে *নিশ্চিত করুন*। নিশ্চিত পার্সেল সেটেলড হয় এবং কুরিয়ারের চার্জ
প্রকৃত মুনাফায় আসল ডেলিভারি খরচ হিসেবে ব্যবহৃত হয়। *গেটওয়ে সেটেলমেন্ট*:
বিকাশ/নগদ/SSLCommerz-এর প্রতিটি পেমেন্ট লিখুন; পার্থক্য কলাম সেই সময়ের আমাদের
সফল পেমেন্টের সাথে তুলনা করে।

## True profit (`finance.profit.read`)

**EN** — *Finance → True profit* shows revenue minus product cost, courier
charges and gateway fees for orders that were delivered or failed delivery
in the chosen range, by day or by order, with CSV export. Notes under the
totals tell you when numbers are estimates: courier cost comes from the
shipping fee until a COD settlement is confirmed; gateway fees use the
estimates in Settings → finance until a gateway settlement is recorded;
units with no cost price understate product cost.

**BN** — *ফাইন্যান্স → প্রকৃত মুনাফা* নির্বাচিত সময়ে ডেলিভারড বা ব্যর্থ
ডেলিভারির অর্ডারের আয় থেকে পণ্যের খরচ, কুরিয়ার চার্জ ও গেটওয়ে ফি বাদ দিয়ে
দেখায় — দিন বা অর্ডার অনুযায়ী, CSV এক্সপোর্টসহ। মোটের নিচের নোট বলে কোন
সংখ্যা অনুমান: COD সেটেলমেন্ট নিশ্চিত না হওয়া পর্যন্ত কুরিয়ার খরচ শিপিং ফি
থেকে; গেটওয়ে সেটেলমেন্ট লেখা না হওয়া পর্যন্ত গেটওয়ে ফি সেটিংস → ফাইন্যান্সের
অনুমান থেকে; ক্রয়মূল্যহীন ইউনিট থাকলে পণ্যের খরচ কম দেখায়।

## Scheduled email reports & alerts (`reports.schedule.manage`, `reports.read`)

**EN** — *Scheduled reports*: choose a report, daily / weekly (Saturday) /
monthly (1st), the language and recipients. It's emailed at the hour set
in Settings → reports (Dhaka time). You can only schedule reports you're
allowed to see. *Send now* sends a test. *Alerts*: every morning the system
compares yesterday's orders, revenue, cancellation and rejection rates with
the previous days and raises an alert (bell, push and email) when something
moves more than the threshold in Settings → reports. Acknowledge alerts
once handled.

**BN** — *নির্ধারিত রিপোর্ট*: রিপোর্ট, দৈনিক / সাপ্তাহিক (শনিবার) / মাসিক (১
তারিখ), ভাষা ও প্রাপক বেছে নিন। সেটিংস → রিপোর্টে দেওয়া সময়ে (ঢাকা সময়) ইমেইল
যায়। যে রিপোর্ট দেখার অনুমতি আছে শুধু সেটিই শিডিউল করা যায়। *এখন পাঠান* দিয়ে
পরীক্ষা করুন। *অ্যালার্ট*: প্রতিদিন সকালে গতকালের অর্ডার, আয়, বাতিল ও
রিজেকশন হার আগের দিনগুলোর সাথে তুলনা হয়; সেটিংস → রিপোর্টের সীমার বেশি
পরিবর্তন হলে অ্যালার্ট (বেল, পুশ ও ইমেইল) আসে। সমাধানের পর *দেখেছি* চাপুন।

## Custom dashboard (`reports.read`, `dashboard.layouts.manage`)

**EN** — On the dashboard press *Customize* to choose and order widgets
(key numbers, alerts, orders by status, top products, low stock, COD with
couriers, true profit, live visitors) and *Save* for yourself. Staff with
the layouts permission can also save a layout for a role or for everyone.
Each person sees their own layout first, then their role's, then the store
default; widgets they're not allowed to see are hidden automatically.

**BN** — ড্যাশবোর্ডে *সাজান* চেপে উইজেট (মূল সূচক, অ্যালার্ট, স্ট্যাটাস অনুযায়ী
অর্ডার, শীর্ষ পণ্য, কম স্টক, কুরিয়ারের কাছে COD, প্রকৃত মুনাফা, লাইভ ভিজিটর)
বেছে সাজিয়ে নিজের জন্য *সেভ* করুন। লেআউট অনুমতি থাকলে কোনো রোল বা সবার জন্যও
সেভ করা যায়। প্রত্যেকে আগে নিজের, তারপর রোলের, তারপর স্টোরের ডিফল্ট লেআউট
দেখেন; যে উইজেট দেখার অনুমতি নেই তা আপনাআপনি লুকানো থাকে।

## Loyalty program & tiers (`loyalty.manage`, Settings → loyalty)

**EN** — Turn the program on in Settings → loyalty and set the rules (default:
1 point per ৳100, 1 point = ৳1, at least 50 points per use, at most 20% of the
goods paid with points, points usable 7 days after delivery, expiring after
12 months; bonus points for an approved photo review and on birthdays).
Marketing → *Loyalty* shows points outstanding and their taka liability, and
lets you add tiers by lifetime spend with an earn multiplier (150% = 1.5×).
A customer's profile shows their balance, pending and soon-expiring points,
the full history, and lets you add or remove points with a reason (audited).
Logged-in shoppers see *My points* in their account and a "Use points" box at
checkout. Cancelled orders give their points back automatically; points for
an order returned within the waiting period are never released. Orders paid
partly with points can't be merged or split.

**BN** — সেটিংস → loyalty থেকে প্রোগ্রাম চালু করে নিয়ম দিন (ডিফল্ট: প্রতি ৳১০০-তে
১ পয়েন্ট, ১ পয়েন্ট = ৳১, একবারে কমপক্ষে ৫০ পয়েন্ট, পণ্যের মূল্যের সর্বোচ্চ ২০%
পয়েন্টে, ডেলিভারির ৭ দিন পর ব্যবহারযোগ্য, ১২ মাসে মেয়াদ শেষ; ছবিসহ অনুমোদিত
রিভিউ ও জন্মদিনে বোনাস)। মার্কেটিং → *লয়্যালটি*-তে বকেয়া পয়েন্ট ও তার টাকার দায়
দেখুন, মোট কেনাকাটা অনুযায়ী টিয়ার ও গুণক (১৫০% = ১.৫×) যোগ করুন। গ্রাহকের
প্রোফাইলে ব্যালান্স, অপেক্ষমাণ ও শীঘ্র মেয়াদোত্তীর্ণ পয়েন্ট, পুরো ইতিহাস দেখা যায়
এবং কারণসহ পয়েন্ট যোগ/বিয়োগ করা যায় (অডিট হয়)। গ্রাহক অ্যাকাউন্টে *আমার পয়েন্ট*
ও চেকআউটে "পয়েন্ট ব্যবহার করুন" দেখেন। বাতিল অর্ডারের পয়েন্ট নিজে থেকে ফেরত
আসে; অপেক্ষার সময়ে রিটার্ন হলে পয়েন্ট যোগ হয় না। পয়েন্টে আংশিক পরিশোধিত অর্ডার
মার্জ/স্প্লিট করা যায় না।

## RFM segments (`customers.manage`)

**EN** — Every night after 2 AM the system scores each customer who ordered
in the last year (Settings → crm) 1–5 on recency, frequency and spend,
compared with your other customers, and names a segment (Champions, Loyal,
At risk, Hibernating …). On *Segments*, *Create preset segments* adds one
segment per RFM group; *Recalculate now* re-scores immediately. Segment rules
can also use `rfmSegment`, `rfmRecency`, `rfmFrequency`, `rfmMonetary`,
`tierId`, `pointsBalance` and `consent` ("sms", "email" or "whatsapp").

**BN** — প্রতিরাতে ২টার পর গত এক বছরে (সেটিংস → crm) অর্ডার করা প্রত্যেক গ্রাহককে
রিসেন্সি, ফ্রিকোয়েন্সি ও খরচে ১–৫ স্কোর দেওয়া হয় — অন্য গ্রাহকদের সাথে তুলনা করে —
এবং একটি সেগমেন্ট নাম (চ্যাম্পিয়ন, অনুগত, ঝুঁকিতে, নিষ্ক্রিয় …)। *সেগমেন্ট* পেজে
*প্রিসেট সেগমেন্ট তৈরি* প্রতিটি RFM দলের জন্য সেগমেন্ট যোগ করে; *এখনই হিসাব করুন*
সাথে সাথে স্কোর করে। সেগমেন্ট রুলে `rfmSegment`, `rfmRecency`, `rfmFrequency`,
`rfmMonetary`, `tierId`, `pointsBalance` ও `consent` ব্যবহার করা যায়।

## Broadcasts & unique-code campaigns (`marketing.broadcasts.manage`, `marketing.broadcasts.send`)

**EN** — Marketing → *Broadcasts* → *New broadcast*: pick a channel, a
segment (or everyone), write the Bangla and English message (each customer
gets the language of their account) and watch the live recipient count and
cost estimate (rates in Settings → marketing). Only customers who opted in to
marketing on that channel are counted — shoppers opt in from their account
page. To give everyone their own single-use coupon, pick a code-type
discount; each recipient gets a personal code in `{coupon_code}` that only
works on their account. Save the draft, check the preview, *Send test* to
your own phone or inbox, then *Send now* or schedule (needs the send
permission). Messages go out in batches; the page shows delivered / waiting
/ failed and, for coupons, how many were used and the orders they brought.
*Stop sending* withdraws messages not yet sent.

**BN** — মার্কেটিং → *ব্রডকাস্ট* → *নতুন ব্রডকাস্ট*: চ্যানেল, সেগমেন্ট (বা সবাই)
বাছুন, বাংলা ও ইংরেজি বার্তা লিখুন (প্রত্যেকে অ্যাকাউন্টের ভাষায় পান) এবং প্রাপকের
সংখ্যা ও আনুমানিক খরচ দেখুন (রেট সেটিংস → marketing-এ)। শুধু সেই চ্যানেলে
মার্কেটিং সম্মতি দেওয়া গ্রাহক গণনা হন — গ্রাহক অ্যাকাউন্ট পেজ থেকে সম্মতি দেন।
সবাইকে আলাদা একবার ব্যবহারযোগ্য কুপন দিতে কোড-টাইপ ডিসকাউন্ট বাছুন; প্রত্যেকে
`{coupon_code}`-এ নিজের কোড পান যা শুধু তার অ্যাকাউন্টে চলে। ড্রাফট সেভ করে
প্রিভিউ দেখুন, নিজের ফোন/ইমেইলে *পরীক্ষামূলক পাঠান*, তারপর *এখনই পাঠান* বা
সময় নির্ধারণ করুন (পাঠানোর অনুমতি লাগে)। বার্তা ব্যাচে যায়; পেজে পৌঁছেছে/অপেক্ষায়/
ব্যর্থ এবং কুপনের ব্যবহার ও অর্ডার দেখা যায়। *পাঠানো বন্ধ করুন* না-যাওয়া বার্তা
ফিরিয়ে নেয়।

## Automated journeys (`marketing.journeys.manage`, Settings → marketing)

**EN** — Marketing → *Journeys* → *Add starter journeys* creates Welcome,
Review request, Win-back and Birthday journeys (all off). Edit the steps
(delay, channels in order of preference, Bangla/English text, optional
personal coupon) and switch each one on; nothing sends until Settings →
marketing → "Automated journeys enabled" is also on. Welcome starts for new
accounts, Review request after delivery (`{review_url}` links to the review
page), Win-back when a customer hasn't ordered for the set days (and stops
the moment they order), Birthday on the birthday in their profile.

**BN** — মার্কেটিং → *জার্নি* → *শুরুর জার্নি যোগ করুন* স্বাগতম, রিভিউ অনুরোধ,
উইন-ব্যাক ও জন্মদিন জার্নি তৈরি করে (সব বন্ধ)। ধাপ (দেরি, পছন্দের ক্রমে চ্যানেল,
বাংলা/ইংরেজি লেখা, ঐচ্ছিক ব্যক্তিগত কুপন) সম্পাদনা করে প্রতিটি চালু করুন; সেটিংস →
marketing → "অটোমেটেড জার্নি চালু" না থাকলে কিছু যায় না। স্বাগতম নতুন অ্যাকাউন্টে,
রিভিউ অনুরোধ ডেলিভারির পর (`{review_url}` রিভিউ পেজের লিংক), উইন-ব্যাক নির্দিষ্ট
দিন অর্ডার না করলে (অর্ডার করলেই থামে), জন্মদিন প্রোফাইলের জন্মদিনে শুরু হয়।

## Ad audiences (`marketing.audiences.manage`)

**EN** — Add a Meta Custom Audiences or Google Customer Match provider under
Integrations → audience, turn on Settings → marketing → audience sync, then
on Marketing → *Ad audiences* pick a segment and provider. *Sync now*
uploads hashed phone numbers and emails; *Daily* keeps it updated. By default
only customers with marketing consent are uploaded.

**BN** — Integrations → audience-এ Meta বা Google প্রোভাইডার যোগ করুন, সেটিংস →
marketing-এ অডিয়েন্স সিঙ্ক চালু করুন, তারপর মার্কেটিং → *বিজ্ঞাপন অডিয়েন্স*-এ
সেগমেন্ট ও প্রোভাইডার বাছুন। *এখনই সিঙ্ক* হ্যাশ করা ফোন ও ইমেইল আপলোড করে;
*প্রতিদিন* হালনাগাদ রাখে। ডিফল্টে শুধু মার্কেটিং সম্মতি দেওয়া গ্রাহক যান।

## Ad spend & ROAS (`marketing.ad_spend.manage`)

**EN** — Export a daily campaign report from Meta Ads Manager, Google Ads or
TikTok (CSV or Excel), upload it on Marketing → *Ad spend & ROAS*, choose the
platform and match the columns (they're guessed for you). For a USD ad
account enter the exchange rate. The ROAS table joins spend with orders whose
`utm_source` belongs to that platform (Settings → marketing) and whose
`utm_campaign` equals the campaign name or ID — so tag your ad links, e.g.
`?utm_source=facebook&utm_campaign=Eid Sale`. Imported spend also appears in
the true profit report.

**BN** — Meta Ads Manager, Google Ads বা TikTok থেকে দৈনিক ক্যাম্পেইন রিপোর্ট (CSV বা
Excel) এক্সপোর্ট করে মার্কেটিং → *বিজ্ঞাপন খরচ ও ROAS*-এ আপলোড করুন, প্ল্যাটফর্ম
বাছুন ও কলাম মেলান (আন্দাজ করে দেওয়া থাকে)। USD অ্যাকাউন্টে বিনিময় হার দিন।
ROAS টেবিল খরচকে সেই অর্ডারের সাথে মেলায় যার `utm_source` প্ল্যাটফর্মের (সেটিংস →
marketing) এবং `utm_campaign` ক্যাম্পেইনের নাম বা ID — তাই বিজ্ঞাপনের লিংকে ট্যাগ
দিন, যেমন `?utm_source=facebook&utm_campaign=Eid Sale`। ইমপোর্ট করা খরচ প্রকৃত
মুনাফা রিপোর্টেও আসে।

## Promo calendar (`marketing.calendar.read`)

**EN** — Marketing → *Promo calendar* shows discounts, flash sales,
announcement bars, popups, scheduled price changes, broadcasts and scheduled
page launches on a month grid; click an item to open its editor.

**BN** — মার্কেটিং → *প্রোমো ক্যালেন্ডার* মাসের গ্রিডে ডিসকাউন্ট, ফ্ল্যাশ সেল, ঘোষণা
বার, পপআপ, নির্ধারিত দাম পরিবর্তন, ব্রডকাস্ট ও পেজ প্রকাশ দেখায়; ক্লিক করলে
সম্পাদনার পেজ খোলে।

## AI content (`ai.manage`, `ai.use`, Settings → ai)

**EN** — Add a provider under Integrations → ai (Anthropic Claude, OpenAI,
Google Gemini, or Mock to try it free), set its prices per million tokens for
cost estimates, and turn on Settings → ai. On the *AI* page choose, per
feature (description, SEO meta, alt text, translation), the provider, model,
effort/temperature, monthly budget in US cents or tokens, and edit the
prompt (every change is versioned; restore any version). When a budget is
used up the feature stops until next month; staff with the AI permission get
an alert at the threshold. If a provider fails, the next enabled one is tried
(setting). In the product editor, *AI assistant* writes drafts — you can edit
them, then *Apply* (saved through the normal product history) or *Discard*.
Nothing is ever published automatically. The usage report shows calls,
tokens and estimated cost per feature and provider each month.

**BN** — Integrations → ai-তে প্রোভাইডার যোগ করুন (Anthropic Claude, OpenAI, Google
Gemini, বা বিনা খরচে পরীক্ষার জন্য মক), খরচ অনুমানের জন্য প্রতি মিলিয়ন টোকেনের দাম
দিন, এবং সেটিংস → ai চালু করুন। *AI* পেজে প্রতিটি ফিচারের (বিবরণ, SEO মেটা, alt
টেক্সট, অনুবাদ) প্রোভাইডার, মডেল, effort/টেম্পারেচার, মাসিক বাজেট (US সেন্ট বা
টোকেন) বাছুন এবং প্রম্পট সম্পাদনা করুন (প্রতিটি পরিবর্তনের সংস্করণ থাকে)। বাজেট
শেষ হলে পরের মাস পর্যন্ত ফিচার বন্ধ থাকে; সীমার কাছে গেলে AI অনুমতিপ্রাপ্ত স্টাফ
অ্যালার্ট পান। একটি প্রোভাইডার ব্যর্থ হলে পরের সক্রিয়টি চেষ্টা হয় (সেটিং)। পণ্য
এডিটরে *AI সহকারী* ড্রাফট লেখে — সম্পাদনা করে *প্রয়োগ* (স্বাভাবিক পণ্য ইতিহাসে
সংরক্ষিত) বা *বাতিল* করুন। কিছুই নিজে থেকে প্রকাশ হয় না। ব্যবহারের রিপোর্টে মাসে
ফিচার ও প্রোভাইডার অনুযায়ী কল, টোকেন ও আনুমানিক খরচ দেখা যায়।

## Product quality, SEO score & broken links (`catalog.manage`, `seo.audit`)

**EN** — *Product quality* lists products worst first with what's missing
(images, Bangla/English text, SEO, size chart, weight, alt text, category,
compare-at price, cost); click an issue count to filter. *SEO & links* scores
products, categories, collections, pages and blog posts on title and meta
description length, clean URL, enough content, image alt text and noindex.
*Scan now* checks every link in pages, blog posts, menus, banners, popups,
product/category descriptions and redirects and lists the ones that lead to
missing, hidden or unpublished content (external sites too, if enabled in
Settings → seo).

**BN** — *পণ্যের মান* সবচেয়ে খারাপ পণ্য আগে দেখায় এবং কী বাদ আছে (ছবি, বাংলা/ইংরেজি
লেখা, SEO, সাইজ চার্ট, ওজন, alt টেক্সট, ক্যাটাগরি, তুলনামূল্য, ক্রয়মূল্য); ফিল্টার
করতে সমস্যার সংখ্যায় ক্লিক করুন। *SEO ও লিংক* পণ্য, ক্যাটাগরি, কালেকশন, পেজ ও
ব্লগকে শিরোনাম ও মেটা বিবরণের দৈর্ঘ্য, পরিষ্কার URL, যথেষ্ট কনটেন্ট, ছবির alt ও
noindex দিয়ে স্কোর করে। *এখনই স্ক্যান* পেজ, ব্লগ, মেনু, ব্যানার, পপআপ, পণ্য/ক্যাটাগরির
বিবরণ ও রিডাইরেক্টের প্রতিটি লিংক যাচাই করে এবং যেগুলো না-থাকা, লুকানো বা অপ্রকাশিত
কনটেন্টে যায় তা দেখায় (সেটিংস → seo-তে চালু থাকলে বাইরের সাইটও)।

## Recommendations (`personalization.manage`, Settings → personalization)

**EN** — Product pages show *Frequently bought together* and *Similar
products*, the cart shows *Frequently bought together*, and the *For you*
page block (add it in the page builder) shows each shopper picks based on
what they viewed and bought. Related products you pick by hand on a product
always come first; the rest is computed every night after 03:00 from orders
("bought together") and browsing ("viewed together"). On *Personalization*
you see how many products have data, can *Recompute now*, and can preview
what any product page will show with the scores behind it. Settings →
personalization: switch it off (only hand-picked products show), the history
windows, the minimum times a pair must appear (raise it as orders grow), and
whether *For you* hides products the shopper already bought.

**BN** — পণ্যের পেজে *একসাথে প্রায়ই কেনা হয়* ও *একই রকম পণ্য*, কার্টে *একসাথে
প্রায়ই কেনা হয়*, আর *আপনার জন্য* পেজ ব্লক (পেজ বিল্ডারে যোগ করুন) প্রতিটি ক্রেতার
দেখা ও কেনা অনুযায়ী পণ্য দেখায়। পণ্যে হাতে বাছাই করা রিলেটেড প্রোডাক্ট সবসময় আগে
থাকে; বাকিটা প্রতি রাতে ০৩:০০-র পর অর্ডার ("একসাথে কেনা") ও ব্রাউজিং ("একসাথে
দেখা") থেকে হিসাব হয়। *পার্সোনালাইজেশন* পেজে কতগুলো পণ্যের ডেটা আছে দেখুন, *এখনই
আবার হিসাব করুন*, এবং যেকোনো পণ্যের পেজে কী দেখাবে তা স্কোরসহ প্রিভিউ করুন। সেটিংস →
personalization: বন্ধ করুন (শুধু হাতে বাছাই করা পণ্য দেখাবে), ইতিহাসের সময়সীমা, একটি
জোড়া কমপক্ষে কতবার আসতে হবে (অর্ডার বাড়লে বাড়ান), এবং *আপনার জন্য*-তে আগে কেনা
পণ্য লুকানো হবে কিনা।

## Search by photo (`personalization.manage`, Settings → personalization)

**EN** — Shoppers tap the camera icon next to search, take or choose a
photo, and see the products that look most like it. The first 3 photos of
every active product are indexed in the background by colour and shape (no
AI cost, works with any setup); the photo a shopper uploads is never saved.
Optionally turn on *Use AI vision* (needs Settings → ai and a provider) so
the garment type, colours and pattern are read too — each search then spends
AI budget (the *Visual search tags* feature on the *AI* page has its own
budget); *Also AI-tag catalog images* tags each product's main photo once.
If AI is unavailable or over budget, search still works on colour and shape.
On *Personalization* check how much is indexed, try a photo before turning it
on for shoppers, or rebuild the index. Shoppers are limited to a number of
photo searches per hour (setting).

**BN** — ক্রেতা সার্চের পাশের ক্যামেরা আইকনে চাপ দিয়ে ছবি তোলেন বা বেছে নেন, এবং
সবচেয়ে মিল আছে এমন পণ্য দেখেন। প্রতিটি সক্রিয় পণ্যের প্রথম ৩টি ছবি রং ও আকার দিয়ে
ব্যাকগ্রাউন্ডে ইনডেক্স হয় (AI খরচ নেই, যেকোনো সেটআপে চলে); ক্রেতার আপলোড করা ছবি
কখনো সংরক্ষণ হয় না। চাইলে *AI ভিশন ব্যবহার* চালু করুন (সেটিংস → ai ও একটি
প্রোভাইডার লাগবে) যাতে পোশাকের ধরন, রং ও প্যাটার্নও পড়া হয় — তখন প্রতিটি খোঁজে AI
বাজেট খরচ হয় (*AI* পেজে *ভিজ্যুয়াল সার্চ ট্যাগ* ফিচারের নিজস্ব বাজেট আছে); *ক্যাটালগের
ছবিতেও AI ট্যাগ* প্রতিটি পণ্যের প্রধান ছবি একবার ট্যাগ করে। AI না থাকলে বা বাজেট শেষ
হলেও রং ও আকার দিয়ে খোঁজা চলে। *পার্সোনালাইজেশন* পেজে কতটা ইনডেক্স হয়েছে দেখুন,
ক্রেতাদের জন্য চালুর আগে একটি ছবি দিয়ে পরীক্ষা করুন, বা ইনডেক্স নতুন করে তৈরি করুন।
প্রতি ঘণ্টায় ক্রেতা কতবার ছবি দিয়ে খুঁজতে পারবেন তা সেটিংসে ঠিক করা যায়।

## A/B tests (`experiments.read`, `experiments.manage`, Settings → personalization)

**EN** — *A/B tests* → *New test*. Choose what to test: a **page block**
(pick a published page and one of its blocks, then change the settings JSON
of each variant — it starts as a copy of the current block), an
**announcement bar** (a different message/link per variant) or an **offer**
(each variant gets a different discount, or none; a discount used in a
running test only applies to visitors of its own variant). Pick the goal
(order, add to cart, or clicking a link inside), how many visitors take part
and each variant's share, then *Start test*. Each visitor keeps the same
variant. *Results* shows visitors, conversions, the rate versus the control,
the p-value, orders and revenue per visitor; a winner is only called once
every variant has the minimum number of visitors and the difference is
significant at the confidence level in Settings → personalization (both
editable). Once started, what's tested can't change — only the name and a
higher traffic share. *Pause* shows everyone the control (offer discounts
stay limited to the control). *End test* can apply the winner: a block's
winning settings go into the page draft for you to publish, a bar gets the
winning text, an offer test switches off the losing discounts. Switching A/B
testing off in Settings shows everyone the control.

**BN** — *A/B টেস্ট* → *নতুন টেস্ট*। কী পরীক্ষা করবেন বাছুন: **পেজের ব্লক** (একটি
প্রকাশিত পেজ ও এর একটি ব্লক বাছুন, তারপর প্রতিটি সংস্করণের সেটিংস JSON বদলান — শুরুতে
বর্তমান ব্লকের কপি থাকে), **ঘোষণা বার** (প্রতিটি সংস্করণে আলাদা বার্তা/লিংক) বা
**অফার** (প্রতিটি সংস্করণে আলাদা ডিসকাউন্ট, বা কোনোটিই না; চলমান টেস্টের ডিসকাউন্ট শুধু
নিজের সংস্করণের ভিজিটরদের জন্য কাজ করে)। লক্ষ্য (অর্ডার, কার্টে যোগ, বা ভেতরের লিংকে
ক্লিক), কত ভিজিটর অংশ নেবেন ও প্রতিটি সংস্করণের ভাগ ঠিক করে *টেস্ট শুরু করুন*। প্রতিটি
ভিজিটর সবসময় একই সংস্করণ দেখেন। *ফলাফল*-এ ভিজিটর, কনভার্শন, কন্ট্রোলের তুলনায় হার,
p-value, অর্ডার ও প্রতি ভিজিটরে আয় দেখায়; প্রতিটি সংস্করণে ন্যূনতম ভিজিটর হলে এবং
সেটিংস → personalization-এর আস্থা স্তরে পার্থক্য উল্লেখযোগ্য হলেই বিজয়ী ঘোষণা হয় (দুটোই
বদলানো যায়)। শুরুর পর কী পরীক্ষা হচ্ছে তা বদলানো যায় না — শুধু নাম ও বেশি ট্রাফিক।
*বিরতি* দিলে সবাই কন্ট্রোল দেখেন (অফারের ডিসকাউন্ট কন্ট্রোলেই সীমিত থাকে)। *টেস্ট শেষ*
করার সময় বিজয়ী প্রয়োগ করা যায়: ব্লকের বিজয়ী সেটিংস পেজের ড্রাফটে যায় (আপনি প্রকাশ
করবেন), বারে বিজয়ী লেখা বসে, অফার টেস্টে হেরে যাওয়া ডিসকাউন্ট বন্ধ হয়। সেটিংসে A/B
টেস্ট বন্ধ করলে সবাই কন্ট্রোল দেখেন।

## Support inbox (`support.inbox`, `support.manage`, Settings → support)

**EN** — *Support inbox* collects WhatsApp, Messenger, Instagram and website
live chat in one list. Connect channels under Integrations: WhatsApp uses
your existing WhatsApp Cloud API provider (add its *app secret* and *verify
token*), Messenger/Instagram use a *chat channel* provider (page id, page
access token, app secret, verify token). Each channel shows the webhook URL
to paste into the Meta app. To try it without Meta, add a *Mock* provider and
use *Send test message* on the inbox. Pick a conversation to read and reply;
switch to *Internal note* for the team only; type `/shortcut` or use *Insert
canned reply*; *Suggest replies (AI)* drafts three answers you can edit. Meta
only allows replies within 24 hours of the customer's last message — after
that, call them. Assign a conversation to yourself (or anyone, with
`support.manage`), resolve it when done; a customer writing again reopens it.
The side panel shows the customer, their orders and tickets, *Call*, *Create
order* (opens the manual order form pre-filled, and links the order back to
the chat) and *Create ticket*. Turn on live chat in Settings → support.

**BN** — *সাপোর্ট ইনবক্স* WhatsApp, Messenger, Instagram ও ওয়েবসাইটের লাইভ
চ্যাট এক তালিকায় আনে। ইন্টিগ্রেশনে চ্যানেল যুক্ত করুন: WhatsApp-এর জন্য আগের
WhatsApp Cloud API প্রোভাইডারেই *app secret* ও *verify token* দিন;
Messenger/Instagram-এর জন্য *chat channel* প্রোভাইডার (page id, page access
token, app secret, verify token)। প্রতিটি চ্যানেলের পাশে Meta অ্যাপে বসানোর
webhook URL দেখায়। Meta ছাড়া পরীক্ষা করতে *Mock* প্রোভাইডার যোগ করে ইনবক্সে
*পরীক্ষার বার্তা পাঠান* ব্যবহার করুন। কথোপকথন বেছে পড়ুন ও উত্তর দিন; শুধু টিমের
জন্য *অভ্যন্তরীণ নোট*; `/shortcut` লিখুন বা *সংরক্ষিত উত্তর বসান*; *উত্তরের
পরামর্শ (AI)* তিনটি খসড়া দেয় যা সম্পাদনা করে পাঠাবেন। গ্রাহকের শেষ বার্তার ২৪ ঘণ্টা
পর Meta আর উত্তর দিতে দেয় না — তখন ফোন করুন। কথোপকথন নিজেকে (বা
`support.manage` থাকলে যে কাউকে) দিন, কাজ শেষে সমাধান করুন; গ্রাহক আবার লিখলে
খুলে যায়। পাশের প্যানেলে গ্রাহক, তাঁর অর্ডার ও টিকিট, *কল*, *অর্ডার তৈরি*
(আগে থেকে পূরণ করা ম্যানুয়াল অর্ডার ফর্ম খোলে, অর্ডার চ্যাটের সাথে যুক্ত হয়) ও
*টিকিট তৈরি* থাকে। সেটিংস → support-এ লাইভ চ্যাট চালু করুন।

## AI chat assistant (Settings → support, Settings → ai)

**EN** — Turn on Settings → support → *AI chat assistant* and choose its
channels (live chat by default). It answers new messages about products,
prices, sizes, stock and the customer's orders by looking them up (it never
guesses), and hands the conversation to your team — "waiting for agent",
with an alert — when the customer asks for a person, is upset, wants a
refund/return/cancellation/payment fix, or it can't help. Order details are
only shared when the order's phone number matches the customer's. Edit its
instructions, provider, model and monthly budget on the *AI* page (*Chat
assistant*); if AI is off or the budget runs out, conversations go straight
to your team. When you reply yourself, the assistant stops for that
conversation; *Let assistant answer* turns it back on. Each assistant reply
shows what it looked up.

**BN** — সেটিংস → support → *AI চ্যাট সহকারী* চালু করে চ্যানেল বাছুন (ডিফল্ট
লাইভ চ্যাট)। এটি পণ্য, দাম, সাইজ, স্টক ও গ্রাহকের অর্ডার নিয়ে নতুন বার্তার উত্তর
দেয় তথ্য খুঁজে দেখে (কখনো আন্দাজ করে না), আর গ্রাহক মানুষ চাইলে, বিরক্ত হলে,
রিফান্ড/রিটার্ন/বাতিল/পেমেন্ট সমস্যা হলে বা সাহায্য করতে না পারলে কথোপকথন আপনার
টিমকে দেয় — "প্রতিনিধির অপেক্ষায়", অ্যালার্টসহ। অর্ডারের ফোন নম্বর গ্রাহকের সাথে
মিললেই কেবল অর্ডারের তথ্য জানায়। *AI* পেজে (*চ্যাট সহকারী*) নির্দেশনা,
প্রোভাইডার, মডেল ও মাসিক বাজেট বদলান; AI বন্ধ থাকলে বা বাজেট শেষ হলে কথোপকথন সরাসরি
টিমের কাছে যায়। আপনি নিজে উত্তর দিলে ওই কথোপকথনে সহকারী থামে; *সহকারীকে উত্তর
দিতে দিন* দিয়ে আবার চালু করুন। প্রতিটি উত্তরের নিচে দেখায় সহকারী কী খুঁজে দেখেছে।

## Tickets & SLA (`support.tickets`, Settings → support)

**EN** — Create a ticket on *Tickets* or from a chat. Each ticket has a
type, priority, assignee and two deadlines set from its priority: first
response and resolution (Settings → support, in minutes). The list shows
"on track / due soon / missed" and can show only missed ones; changing the
priority moves the deadlines. Reply to the customer (sent through the linked
chat when there is one) or add internal notes; the first reply meets the
first-response deadline and resolving meets the resolution one. When a
deadline passes the assignee (or the support team) gets an alert.

**BN** — *টিকিট* পেজে বা চ্যাট থেকে টিকিট তৈরি করুন। প্রতিটি টিকিটের ধরন,
অগ্রাধিকার, দায়িত্বপ্রাপ্ত কর্মী এবং অগ্রাধিকার অনুযায়ী দুটি সময়সীমা থাকে: প্রথম
উত্তর ও সমাধান (সেটিংস → support, মিনিটে)। তালিকায় "ঠিক আছে / সময় শেষ হচ্ছে /
সময় পেরিয়েছে" দেখায় এবং শুধু পেরোনোগুলো দেখা যায়; অগ্রাধিকার বদলালে সময়সীমা
বদলায়। গ্রাহককে উত্তর দিন (চ্যাট যুক্ত থাকলে সেখানেই যায়) বা অভ্যন্তরীণ নোট দিন;
প্রথম উত্তরে প্রথম-উত্তরের সময়সীমা পূরণ হয়, সমাধান করলে সমাধানেরটি। সময় পেরোলে
দায়িত্বপ্রাপ্ত কর্মী (বা সাপোর্ট টিম) অ্যালার্ট পান।

## Canned replies (`support.inbox`, `support.manage`)

**EN** — *Canned replies* stores bilingual answers with a shortcut; type
`/shortcut` followed by a space in the inbox to insert one. They can use
`{customer_name}`, `{order_number}` (the last order created from the chat),
`{brand_name}`, `{support_phone}` and `{agent_name}`. The list shows how often
each is used. Creating and editing needs `support.manage`.

**BN** — *সংরক্ষিত উত্তর*-এ শর্টকাটসহ দুই ভাষার উত্তর রাখুন; ইনবক্সে `/shortcut`
লিখে স্পেস দিলে বসে যায়। এতে `{customer_name}`, `{order_number}` (চ্যাট থেকে
তৈরি শেষ অর্ডার), `{brand_name}`, `{support_phone}` ও `{agent_name}` ব্যবহার করা
যায়। তালিকায় কোনটি কতবার ব্যবহৃত হয়েছে দেখায়। তৈরি ও সম্পাদনায় `support.manage`
লাগে।

## Click-to-call (`support.calls`)

**EN** — *Call* buttons appear on orders, tickets and chats. Without a
telephony provider, Call opens your phone's dialer and the call is logged —
mark how it went on *Calls*. To place calls through a cloud PBX/call-centre
service, add a *Generic HTTP telephony* provider under Integrations (its
request URL and fields, and how its status webhook reports calls — the
webhook URL is `/api/v1/webhooks/telephony/<provider id>` on your API), then
enter *My phone number* on *Calls*: the service rings you first, then
connects the customer, and the log fills in status, duration and recording.

**BN** — অর্ডার, টিকিট ও চ্যাটে *কল* বোতাম থাকে। টেলিফোনি প্রোভাইডার না থাকলে কল
চাপলে ফোনের ডায়ালার খোলে এবং কল লেখা থাকে — *কল* পেজে ফলাফল দিন। ক্লাউড
PBX/কল-সেন্টার সার্ভিস দিয়ে কল করতে ইন্টিগ্রেশনে *জেনেরিক HTTP টেলিফোনি* প্রোভাইডার
যোগ করুন (অনুরোধের URL ও ফিল্ড, এবং স্ট্যাটাস webhook কীভাবে কলের খবর দেয় —
webhook URL আপনার API-তে `/api/v1/webhooks/telephony/<provider id>`), তারপর *কল*
পেজে *আমার ফোন নম্বর* দিন: সার্ভিস আগে আপনাকে রিং দেয়, তারপর গ্রাহককে যুক্ত করে,
আর তালিকায় অবস্থা, সময় ও রেকর্ডিং আসে।
