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

### Customer reviews section

**EN** — Add *Customer reviews* to a page (for example, the home page) to show star reviews from your
customers. In *Which reviews*, choose the newest reviews, the highest rated, reviews with photos, or
only your own testimonials. You can also hide reviews below a star rating and set how many reviews
to show. Only approved reviews of products that are on sale appear, and names are shortened (for
example, "Rahim K."). Under *Your own testimonials* you can type quotes from WhatsApp or Facebook in
both languages; they appear first. If there is nothing to show, the section stays hidden.

**BN** — পেজে (যেমন হোম পেজে) *গ্রাহক রিভিউ* সেকশন যোগ করলে গ্রাহকদের স্টার রিভিউ দেখাবে।
*কোন রিভিউ*-তে বেছে নিন: সর্বশেষ রিভিউ, সবচেয়ে বেশি রেটিং, ছবিসহ রিভিউ, নাকি শুধু আপনার নিজের
টেস্টিমোনিয়াল। কত স্টারের নিচের রিভিউ লুকাবে আর কয়টা রিভিউ দেখাবে, সেটাও ঠিক করতে পারবেন।
শুধু অনুমোদিত রিভিউ আর বিক্রিতে থাকা পণ্যের রিভিউ দেখায়, আর নাম ছোট করে দেখায় (যেমন "Rahim K.")।
*আপনার নিজের টেস্টিমোনিয়াল*-এ WhatsApp বা Facebook থেকে পাওয়া মন্তব্য দুই ভাষায় লিখে দিতে পারবেন;
এগুলো সবার আগে দেখাবে। দেখানোর মতো কিছু না থাকলে সেকশনটা লুকানো থাকে।

## CMS announcements (`cms.manage`)

**EN** — Top-of-page bars with a start/end schedule and optional link.
Only one per locale shows at a time if several overlap — the highest
`priority` wins.

**BN** — পেজের উপরে শুরু/শেষ সময় এবং ঐচ্ছিক লিংক সহ ব্যানার বার। একাধিক
ওভারল্যাপ করলে সর্বোচ্চ `priority`-র ব্যানারটি দেখা যাবে।

## Menus (`cms.manage`)

**EN** — CMS → Menus builds the storefront's navigation. **Header menu**:
top-level items appear in the navigation bar; their sub-items open as a
dropdown on desktop and as an expandable list in the phone menu (up to three
levels). **Footer menu**: each top-level item is a column heading, its
sub-items are the column's links. For each item give a label (Bangla and/or
English), choose what it links to (category, collection, page, product, or a
URL such as `/track` or `https://…`) and pick the target — an empty label is
filled from the target's name. Use Up/Down to reorder, *Add sub-item* to nest,
then **Save menu**. An item may have no target only if it has sub-items (a
heading). The storefront shows changes within about a minute. Header/footer
words such as "Cart" or "Account" are UI strings (`storefront.*`).

**BN** — CMS → মেনু থেকে স্টোরফ্রন্টের নেভিগেশন বানানো হয়। **হেডার মেনু**:
প্রথম স্তরের আইটেম নেভিগেশন বারে দেখায়; সাব-আইটেম ডেস্কটপে ড্রপডাউনে আর
ফোনের মেনুতে খোলা-বন্ধ তালিকায় দেখায় (সর্বোচ্চ তিন স্তর)। **ফুটার মেনু**:
প্রথম স্তরের প্রতিটা আইটেম একটা কলামের শিরোনাম, সাব-আইটেমগুলো ওই কলামের লিংক।
প্রতিটা আইটেমে নাম (বাংলা আর/অথবা ইংরেজি) দিন, কোথায় লিংক হবে বাছুন
(ক্যাটাগরি, কালেকশন, পেজ, প্রোডাক্ট, অথবা `/track` বা `https://…`-এর মতো
লিংক) আর গন্তব্য বেছে নিন — নাম ফাঁকা থাকলে গন্তব্যের নাম বসে যায়। উপরে/নিচে
দিয়ে ক্রম বদলান, *সাব-আইটেম যোগ করুন* দিয়ে ভেতরে রাখুন, তারপর **মেনু সেভ
করুন**। সাব-আইটেম থাকলে তবেই গন্তব্য ছাড়া (শুধু শিরোনাম) রাখা যায়। এক মিনিটের
মধ্যে স্টোরফ্রন্টে দেখাবে। হেডার/ফুটারের "কার্ট", "অ্যাকাউন্ট"-এর মতো লেখাগুলো
UI strings (`storefront.*`)।

### All-products page (/shop) and product listings

**EN** — `/shop` lists every product on sale, with a search box, sort, filters and a choice of
three views (large photos, grid, list). Category and collection pages use the same layout. Products
load a batch at a time; shoppers tap "Load more" for the next batch. Control it in
**Settings → shop** (turn the page and its search box on or off) and **Settings → listing**:
- products per batch
- default sort
- default view
- whether shoppers can switch the view
- which filters show (category, size/colour, price, on sale, in stock)

To put a banner above the products, or set the page's Google title, edit the **shop** page in
CMS → Pages (if it is missing, run the base seed once). Add a link to `/shop` from CMS → Menus.
The page's wording is UI strings under `storefront.listing.*`.

**BN** — `/shop` পেজে বিক্রিতে থাকা সব পণ্য দেখায়। সাথে সার্চ বক্স, সাজানোর অপশন, ফিল্টার আর তিন
রকম ভিউ (বড় ছবি, গ্রিড, লিস্ট) থাকে। ক্যাটাগরি আর কালেকশন পেজও একই রকম দেখায়। পণ্য অল্প অল্প করে
লোড হয়; ক্রেতা "আরও দেখুন" চাপলে পরের ব্যাচ আসে। **সেটিংস → shop**-এ পেজ আর সার্চ বক্স চালু বা
বন্ধ করুন। **সেটিংস → listing**-এ ঠিক করুন:
- প্রতিবার কয়টি পণ্য আসবে
- শুরুতে কোন ক্রমে সাজানো থাকবে
- ডিফল্ট ভিউ
- ক্রেতা ভিউ বদলাতে পারবে কিনা
- কোন ফিল্টার দেখাবে

উপরে ব্যানার দিতে বা Google-এর শিরোনাম বসাতে CMS → Pages-এ **shop** পেজ এডিট করুন (না থাকলে
একবার base seed চালান)। মেনুতে `/shop` লিংক যোগ করুন CMS → Menus থেকে। লেখাগুলো UI strings
(`storefront.listing.*`)।

### Product card buttons

**EN** — Each product card has a heart (save to wishlist) and a bag button (add to cart) on its
photo. If the product has sizes or colours, the bag button opens a small picker; otherwise it adds
the product straight away. Their words, such as "Add to cart", "Added to cart" and "View cart", are
UI strings under `storefront.card.*`.

**BN** — প্রতিটা প্রোডাক্ট কার্ডের ছবিতে একটা হার্ট (উইশলিস্টে রাখা) আর একটা ব্যাগ বাটন (কার্টে
যোগ) থাকে। পণ্যের সাইজ বা রং থাকলে ব্যাগ বাটন একটা ছোট বাছাই-প্যানেল খোলে, না থাকলে সরাসরি কার্টে
যোগ করে। "কার্টে যোগ করুন", "কার্টে যোগ হয়েছে", "কার্ট দেখুন"-এর মতো লেখাগুলো UI strings
(`storefront.card.*`)।

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

### Asking for reviews

**EN** — Turn on **Settings → Reviews → Ask for a review after delivery**. Every delivered order, including guest
orders, then gets one message a few days later (you choose how many days, SMS / WhatsApp / email, and the text). The
message includes `{review_link}`, a personal link where the buyer reviews that order's items without logging in.
Customers with an account can also use "Write a review" on their order list. On a product page, a logged-in
customer who received that product sees a "Write a review" button. If you also run the "Review request" journey
under Marketing → Journeys, an order in that journey isn't messaged twice. Messages appear in Notifications → Logs.

**BN** — **সেটিংস → Reviews → "ডেলিভারির পর রিভিউ চেয়ে মেসেজ পাঠান"** চালু করুন। এতে প্রতিটা ডেলিভার হওয়া
অর্ডারে (গেস্ট অর্ডারসহ) কয়েক দিন পর একটা মেসেজ যাবে। কত দিন পর যাবে, SMS / WhatsApp / ইমেইল আর মেসেজের লেখা
আপনি ঠিক করবেন। মেসেজে `{review_link}` থাকে, যেটা একটা ব্যক্তিগত লিংক: ক্রেতা লগইন ছাড়াই ওই অর্ডারের পণ্যের রিভিউ
দিতে পারেন। অ্যাকাউন্ট থাকলে অর্ডার তালিকার "রিভিউ লিখুন" থেকেও দেওয়া যায়। প্রোডাক্ট পেজে লগইন করা যে
ক্রেতা পণ্যটা হাতে পেয়েছেন, তিনি "রিভিউ লিখুন" বাটন দেখবেন। Marketing → Journeys-এর "Review request"
journey-ও চালু থাকলে একই অর্ডারে দুবার মেসেজ যাবে না। মেসেজগুলো Notifications → Logs-এ দেখা যায়।

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

**EN** — Bulk CSV/Excel product import with column mapping and images.
1. Choose the spreadsheet (one row per variant; only the first sheet is
   read). Every column is matched to an import field automatically — check
   the *Imports as* column, change any that are wrong, or set unwanted ones to
   *Don't import*. SKU, product handle and price must be mapped.
2. Set *Prices in the sheet are in* (taka or poisha). Prices are stored in
   poisha either way.
3. Optional: choose an images ZIP. Names in the images column (`A-1.jpg;A-2.jpg`)
   are matched to the ZIP's files; with no images column, files are matched
   to the SKU (`SKU.jpg`, `SKU-2.jpg`). https image links in the images
   column are downloaded. Images on a row go to that row's colour.
4. *Save mapping* to reuse it next time (*Load saved mapping*).
5. *Preview* reports errors (row skipped) and warnings (row imported, e.g. a
   missing image or size chart). Then *Start import*; it runs in the
   background and the report can be downloaded when it finishes.
Product details (title, description, category …) only need to be on a
product's first row. A category path like `Men > Panjabi` creates any missing
category; fit/occasion become product attributes. Re-importing the same file
updates by SKU and doesn't duplicate images. Size charts are matched by name
and are not created — make them under Catalog first.

**BN** — কলাম ম্যাপিং ও ছবিসহ বাল্ক CSV/Excel প্রোডাক্ট ইমপোর্ট।
১. স্প্রেডশিট বেছে নিন (প্রতি ভ্যারিয়েন্টে এক সারি; শুধু প্রথম শিট পড়া হয়)।
   প্রতিটা কলাম আপনা-আপনি একটা ফিল্ডের সঙ্গে মেলানো হয় — *যেভাবে ইমপোর্ট
   হবে* কলামে দেখে নিন, ভুল হলে বদলান, অদরকারি কলাম *ইমপোর্ট করবেন না*
   করে দিন। SKU, প্রোডাক্ট হ্যান্ডেল আর দাম অবশ্যই মেলাতে হবে।
২. *শিটের দামের একক* বেছে নিন (টাকা বা পয়সা)। ভেতরে সবসময় পয়সায় রাখা হয়।
৩. চাইলে ছবির ZIP দিন। ছবির কলামের নাম (`A-1.jpg;A-2.jpg`) ZIP-এর ফাইলের
   সঙ্গে মেলানো হয়; ছবির কলাম না থাকলে SKU দিয়ে (`SKU.jpg`, `SKU-2.jpg`)।
   ছবির কলামে https লিংক থাকলে ডাউনলোড হয়। একটা সারির ছবি ওই সারির রঙে যুক্ত হয়।
৪. পরের বারের জন্য *ম্যাপিং সেভ করুন* (*সেভ করা ম্যাপিং* থেকে আবার আনা যায়)।
৫. *প্রিভিউ* ত্রুটি (সারি বাদ) আর সতর্কবার্তা (সারি ইমপোর্ট হবে, যেমন ছবি বা
   সাইজ চার্ট পাওয়া যায়নি) দেখায়। তারপর *ইমপোর্ট শুরু করুন*; এটা
   ব্যাকগ্রাউন্ডে চলে, শেষ হলে রিপোর্ট ডাউনলোড করা যায়।
প্রোডাক্টের তথ্য (নাম, বিবরণ, ক্যাটাগরি …) শুধু প্রথম সারিতে দিলেই হয়।
`Men > Panjabi`-এর মতো ক্যাটাগরি পাথ না থাকা ক্যাটাগরি তৈরি করে; ফিট/উপলক্ষ
অ্যাট্রিবিউট হিসেবে বসে। একই ফাইল আবার ইমপোর্ট করলে SKU ধরে আপডেট হয়, ছবি
দ্বিগুণ হয় না। সাইজ চার্ট নাম দিয়ে মেলানো হয়, তৈরি হয় না — আগে Catalog-এ বানান।

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

**EN** — The form shows one input per setting (required ones are marked
with \*; secrets are hidden). When you edit a connection, its secrets
show only as `••••1234`: leave a secret blank to keep it, type a new
value to replace it. Each connection can be switched on/off, marked
*Primary* for its service, edited, tested and deleted (a storage
connection that still holds media cannot be deleted — migrate it first).
To use Cloudinary for uploads: Integrations → Storage → + Cloudinary,
then Settings → Media default provider.

**BN** — ফর্মে প্রতিটা তথ্যের জন্য আলাদা ঘর আছে (আবশ্যক ঘরে \* চিহ্ন;
সিক্রেট লুকানো থাকে)। সংযোগ সম্পাদনার সময় সিক্রেট শুধু `••••1234` আকারে
দেখায়: না বদলাতে চাইলে ঘরটা খালি রাখুন, নতুন মান দিলে সেটা বদলে যাবে।
প্রতিটা সংযোগ চালু/বন্ধ, *প্রধান* হিসেবে চিহ্নিত, সম্পাদনা, পরীক্ষা ও মুছে ফেলা
যায় (যে স্টোরেজে এখনো মিডিয়া আছে সেটা মোছা যায় না — আগে মাইগ্রেট করুন)।
আপলোডের জন্য Cloudinary ব্যবহার করতে: ইন্টিগ্রেশন → স্টোরেজ → + Cloudinary,
তারপর সেটিংস → মিডিয়ার ডিফল্ট প্রোভাইডার।

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

## Store credit wallet (`customers.manage`, `store_credit.manage`, Settings → rewards)

**EN** — Store credit is money a customer holds with you. It is added
automatically when a return is resolved as store credit, when you complete a
refund whose method is *store credit*, when a customer moves a gift card into
their wallet, and as a referral reward; you can also add or deduct it by hand
on the customer's profile (with a reason, audited). Turn on *Store credit
wallet* in Settings → rewards to let customers pay with it: logged-in
shoppers then tick "Use store credit" at checkout, and see their balance and
history under *Store credit & gift cards* in their account. Store credit pays
for the whole order, delivery included. If the order is cancelled or expires
unpaid, the credit goes straight back to the wallet — no refund to process.
Marketing → *Store credit* shows how much you owe customers in total and the
latest movements.

**BN** — স্টোর ক্রেডিট হলো গ্রাহকের কাছে আপনার জমা টাকা। রিটার্ন "স্টোর ক্রেডিট"
হিসেবে সম্পন্ন হলে, *স্টোর ক্রেডিট* পদ্ধতির রিফান্ড সম্পন্ন করলে, গ্রাহক গিফট কার্ড
ওয়ালেটে যোগ করলে এবং রেফারেল পুরস্কারে এটি নিজে থেকে যোগ হয়; গ্রাহকের প্রোফাইল
থেকে কারণসহ হাতেও যোগ/বিয়োগ করা যায় (অডিট হয়)। গ্রাহক যেন এটি দিয়ে পরিশোধ করতে
পারেন, সেটিংস → rewards-এ *স্টোর ক্রেডিট ওয়ালেট* চালু করুন: তখন লগইন করা গ্রাহক
চেকআউটে "স্টোর ক্রেডিট ব্যবহার করুন" বেছে নেন এবং অ্যাকাউন্টের *স্টোর ক্রেডিট ও
গিফট কার্ড*-এ ব্যালান্স ও ইতিহাস দেখেন। ডেলিভারি চার্জসহ পুরো অর্ডারেই ক্রেডিট
ব্যবহার করা যায়। অর্ডার বাতিল হলে বা পরিশোধ না হয়ে মেয়াদ শেষ হলে ক্রেডিট সরাসরি
ওয়ালেটে ফেরত যায় — আলাদা রিফান্ড লাগে না। মার্কেটিং → *স্টোর ক্রেডিট*-এ গ্রাহকদের
মোট পাওনা ও সাম্প্রতিক লেনদেন দেখুন।

## Gift cards (`gift_cards.manage`, Settings → rewards)

**EN** — Turn on *Gift cards* in Settings → rewards and choose the preset
amounts, whether shoppers may type their own amount (and its range), how long
cards are valid, and whether cards are sold on the storefront. Shoppers buy a
card at `/gift-cards`, pay online (bKash, Nagad, card — never COD), and the
code goes to the recipient by SMS/email as soon as the payment is confirmed;
the buyer gets a receipt without the code. Anyone holding a code can apply it
at checkout or check its balance; logged-in customers can move a card's whole
balance into their wallet. Marketing → *Gift cards* lists every card (find
one by its last 4 characters or a phone number) and lets you issue a card by
hand — the code is shown to you once and can be sent to the recipient. On a
card you can disable/enable it, add or deduct balance with a reason, and
issue a *new code* when the old one is lost or leaked (the old code stops
working). Codes are stored only in a scrambled form, so nobody — staff
included — can look one up later. Unpaid purchases are cancelled after the
payment timeout; a cancelled order gives the card its money back.

**BN** — সেটিংস → rewards-এ *গিফট কার্ড* চালু করে নির্ধারিত মূল্যগুলো, ক্রেতা নিজে
মূল্য লিখতে পারবেন কি না (এবং তার সীমা), কার্ডের মেয়াদ ও ওয়েবসাইটে বিক্রি হবে কি
না ঠিক করুন। ক্রেতা `/gift-cards` থেকে কার্ড কেনেন, অনলাইনে পরিশোধ করেন (বিকাশ,
নগদ, কার্ড — ক্যাশ অন ডেলিভারি নয়), এবং পেমেন্ট নিশ্চিত হলেই কোডটি প্রাপকের কাছে
SMS/ইমেইলে যায়; ক্রেতা কোড ছাড়া একটি রসিদ পান। কোড যার কাছে আছে তিনি চেকআউটে
ব্যবহার করতে বা ব্যালান্স দেখতে পারেন; লগইন করা গ্রাহক কার্ডের পুরো ব্যালান্স
ওয়ালেটে নিতে পারেন। মার্কেটিং → *গিফট কার্ড*-এ সব কার্ডের তালিকা (শেষ ৪ অক্ষর বা
ফোন নম্বর দিয়ে খুঁজুন) এবং হাতে কার্ড ইস্যু করার সুযোগ আছে — কোডটি আপনাকে একবারই
দেখানো হয় এবং প্রাপককে পাঠানো যায়। কার্ড খুলে বন্ধ/চালু করুন, কারণসহ ব্যালান্স
যোগ/বিয়োগ করুন, আর কোড হারালে বা ফাঁস হলে *নতুন কোড* দিন (পুরোনোটি আর কাজ করবে
না)। কোড এলোমেলো রূপে সংরক্ষিত থাকে, তাই কর্মীসহ কেউ পরে তা দেখতে পারেন না।
পরিশোধ না হওয়া কেনাকাটা পেমেন্টের সময়সীমা শেষে বাতিল হয়; অর্ডার বাতিল হলে কার্ডে
টাকা ফেরত যায়।

## Referral program (`referrals.manage`, Settings → rewards)

**EN** — Turn on *Referral program* in Settings → rewards and set what the
friend gets on their first order (a percent with an optional cap, or a fixed
amount; optional minimum order; whether it stacks with coupons) and what the
referrer gets once that order completes (store credit or loyalty points, at
most N rewards per referrer per month). Each customer finds their code, a
share link and a WhatsApp button under *Refer friends* in their account. A
friend opening the link — or typing the code in the coupon box — gets the
discount at checkout if it's their first order and their phone has never
been referred before; nobody can refer themselves. The referrer is rewarded
automatically when the friend's order is *completed* (delivered and past the
return window); if it's cancelled, refused or returned, the referral earns
nothing. Marketing → *Referrals* shows the rules, totals, top referrers and
every referral with its order; you can void a pending one (e.g. the same
person on two numbers).

**BN** — সেটিংস → rewards-এ *রেফারেল প্রোগ্রাম* চালু করে ঠিক করুন বন্ধু প্রথম
অর্ডারে কী পাবেন (শতাংশ ও চাইলে সর্বোচ্চ সীমা, অথবা নির্দিষ্ট টাকা; চাইলে সর্বনিম্ন
অর্ডার; কুপনের সাথে একসাথে হবে কি না) এবং সেই অর্ডার সম্পন্ন হলে রেফারকারী কী
পাবেন (স্টোর ক্রেডিট বা লয়্যালটি পয়েন্ট, একজন মাসে সর্বোচ্চ N বার)। প্রত্যেক
গ্রাহক অ্যাকাউন্টের *বন্ধুদের রেফার করুন*-এ নিজের কোড, শেয়ার লিংক ও হোয়াটসঅ্যাপ
বোতাম পান। বন্ধু লিংকটি খুললে — বা কুপনের ঘরে কোডটি লিখলে — প্রথম অর্ডার হলে এবং
তাঁর ফোন নম্বর আগে কখনো রেফার না হলে চেকআউটে ছাড় পান; কেউ নিজেকে রেফার করতে
পারেন না। বন্ধুর অর্ডার *সম্পন্ন* হলে (ডেলিভারি ও রিটার্ন সময় শেষ) রেফারকারী নিজে
থেকে পুরস্কার পান; বাতিল, দরজায় ফেরত বা রিটার্ন হলে কিছু পান না। মার্কেটিং →
*রেফারেল*-এ নিয়ম, মোট হিসাব, শীর্ষ রেফারকারী ও প্রতিটি রেফারেল তার অর্ডারসহ
দেখুন; অপেক্ষমাণ রেফারেল বাতিল করা যায় (যেমন একই ব্যক্তি দুই নম্বরে)।

## Affiliates & influencers (`affiliates.manage`, `affiliates.payouts`, Settings → rewards)

**EN** — Turn on *Affiliate / influencer tracking* in Settings → rewards and
set how many days after a link click an order still counts (default 30).
Marketing → *Affiliates* → *Add affiliate*: give the partner a name, a link
code (e.g. `NUSRAT10`), their commission (percent of sales or a fixed amount
per order) and, optionally, one of your coupon codes — orders using that
coupon count for them even without the link. Their tracking link is the
storefront address with `?aff=CODE`. An order is credited to the coupon's
affiliate first, otherwise to the last link clicked within the window; the
partner's own purchases earn nothing. Commission is *pending* until the
order completes, then *approved* (reduced if items were returned), or
*rejected* if the order is cancelled, refused or returned. To pay, send the
money yourself (bKash, bank…) and press *Record payout* with the transaction
ID — every approved commission becomes *paid*. Each affiliate has a private
*partner page* link showing their clicks and commission (no customer
details); make a new link if it leaks.

**BN** — সেটিংস → rewards-এ *অ্যাফিলিয়েট / ইনফ্লুয়েন্সার ট্র্যাকিং* চালু করে ঠিক
করুন লিংকে ক্লিকের কত দিন পর পর্যন্ত অর্ডার গণ্য হবে (ডিফল্ট ৩০)। মার্কেটিং →
*অ্যাফিলিয়েট* → *অ্যাফিলিয়েট যোগ করুন*: পার্টনারের নাম, লিংক কোড (যেমন
`NUSRAT10`), কমিশন (বিক্রির শতাংশ বা প্রতি অর্ডারে নির্দিষ্ট টাকা) এবং চাইলে আপনার
একটি কুপন কোড দিন — সেই কুপনে করা অর্ডার লিংক ছাড়াও তাঁর হিসাবে যায়। ট্র্যাকিং
লিংক হলো আপনার ওয়েবসাইটের ঠিকানা + `?aff=CODE`। অর্ডার আগে কুপনের অ্যাফিলিয়েটের,
না হলে নির্ধারিত সময়ের মধ্যে শেষ ক্লিক করা লিংকের হিসাবে যায়; পার্টনারের নিজের
কেনাকাটায় কমিশন হয় না। অর্ডার সম্পন্ন না হওয়া পর্যন্ত কমিশন *অপেক্ষমাণ*, তারপর
*অনুমোদিত* (রিটার্ন হলে কমে), আর বাতিল, দরজায় ফেরত বা রিটার্ন হলে *বাতিল*। পরিশোধ
করতে নিজে টাকা পাঠান (বিকাশ, ব্যাংক…) এবং ট্রানজেকশন আইডিসহ *পেআউট রেকর্ড করুন*
চাপুন — সব অনুমোদিত কমিশন *পরিশোধিত* হয়ে যায়। প্রতিটি অ্যাফিলিয়েটের একটি ব্যক্তিগত
*পার্টনার পেজ* লিংক আছে যেখানে তিনি নিজের ক্লিক ও কমিশন দেখেন (গ্রাহকের তথ্য নয়);
লিংক ফাঁস হলে নতুন লিংক তৈরি করুন।


## Reorder suggestions & demand forecast (`procurement.manage`, Settings → inventory)

**EN** — Inventory → *Reorder* looks at recent sales of every variant that sold
lately and tells you what to buy and how urgent it is. The forecast is a
recency-weighted average of daily sales (last 90 days by default), nudged by
whether the last two weeks are up or down. For each variant it shows stock,
units already on open purchase orders, sales per day, how many days the stock
will last, and the supplier's lead time. *Critical* means it will run out
before a new order could arrive. The suggested quantity covers the lead time
plus the "target days of cover" plus safety stock (all in Settings →
inventory: lead time, safety stock days, cover days, history days; a
supplier's own lead time on its record overrides the default). Tick the
variants you agree with, change quantities if you like, pick a supplier where
none is known (the supplier of the last order is used otherwise) and press
*Create draft orders* — you get one draft purchase order per supplier to
review and send as usual. It does not know about seasons or festivals, and a
variant that was out of stock shows lower demand than it really had, so treat
the numbers as a starting point.

**BN** — ইনভেন্টরি → *রিঅর্ডার* সাম্প্রতিক বিক্রি দেখে বলে দেয় কী কিনতে হবে ও কতটা
জরুরি। পূর্বাভাস হলো দৈনিক বিক্রির গড় (ডিফল্ট গত ৯০ দিন, সাম্প্রতিক দিনের ওজন
বেশি), শেষ দুই সপ্তাহে বিক্রি বাড়লে বা কমলে সেই অনুযায়ী সামান্য সমন্বয়। প্রতিটি
ভ্যারিয়েন্টের মজুত, খোলা পারচেজ অর্ডারে থাকা ইউনিট, দৈনিক বিক্রি, কত দিন চলবে
এবং সাপ্লায়ারের লিড টাইম দেখা যায়। *জরুরি* মানে নতুন অর্ডার আসার আগেই শেষ হয়ে
যাবে। সাজেস্ট করা পরিমাণ লিড টাইম + লক্ষ্য দিন + সেফটি স্টক পূরণ করে (সেটিংস →
ইনভেন্টরি; সাপ্লায়ারের নিজস্ব লিড টাইম থাকলে সেটাই ধরা হয়)। যেগুলো ঠিক মনে
হয় টিক দিন, দরকারে পরিমাণ বদলান, সাপ্লায়ার অজানা হলে বেছে নিন, তারপর *ড্রাফট
অর্ডার তৈরি করুন* — প্রতি সাপ্লায়ারের জন্য একটি ড্রাফট পারচেজ অর্ডার পাবেন, যা
আগের মতোই দেখে পাঠাতে পারবেন। মৌসুম বা উৎসব এতে ধরা হয় না, আর স্টক শেষ থাকলে
চাহিদা কম দেখায় — তাই সংখ্যাগুলো শুরুর আন্দাজ হিসেবে নিন।

## Materials & bills of materials (`materials.manage`, Settings → inventory)

**EN** — Inventory → *Materials & BOM* holds raw materials (fabric, buttons,
thread, packaging) with their own stock. Pick a unit fine enough that
quantities are whole numbers — centimetres for fabric, grams, pieces — and
enter the cost *per one unit*. *Receive stock* adds stock and blends the cost
the same way finished goods do; *Adjust* needs a reason; every change is in
the ledger, and stock can never go below zero. Search a product on the same
screen to edit its **bill of materials**: how much of each material one
finished unit uses, plus a wastage percentage for cutting loss. A line for
all variants applies to every size/colour; add a line for one variant (say
XXL, which needs more fabric) and it replaces the all-variants line for that
material. The BOM page also shows the material cost of each variant. For a
planned run, ask *What do we need?* via a production order: materials needed
versus on hand are shown, short ones first. If you turn on **Consume
materials when a production order is received** (Settings → inventory),
receiving finished goods on a *production* order deducts the BOM's materials
automatically; if a material is short the receipt is refused, unless you tick
*allow material shortage* to consume what there is.

**BN** — ইনভেন্টরি → *কাঁচামাল ও BOM*-এ কাঁচামাল (কাপড়, বোতাম, সুতা, প্যাকেজিং) ও
তাদের স্টক থাকে। এমন ছোট একক নিন যাতে পরিমাণ পূর্ণসংখ্যা হয় — কাপড়ের জন্য
সেন্টিমিটার, গ্রাম, পিস — এবং *প্রতি এক একক*-এর খরচ দিন। *স্টক গ্রহণ*-এ স্টক বাড়ে ও
তৈরি পণ্যের মতোই খরচ গড় হয়; *সমন্বয়ে* কারণ লাগে; প্রতিটি পরিবর্তন খতিয়ানে থাকে
এবং স্টক কখনো শূন্যের নিচে যায় না। একই পেজে পণ্য খুঁজে তার **BOM** (বিল অব
মেটেরিয়ালস) ঠিক করুন: একটি তৈরি ইউনিটে কোন কাঁচামাল কতটুকু লাগে, সঙ্গে কাটার
অপচয়ের শতাংশ। "সব ভ্যারিয়েন্ট"-এর লাইন সব সাইজ/রঙে খাটে; একটি ভ্যারিয়েন্টের
(যেমন বেশি কাপড় লাগা XXL) আলাদা লাইন দিলে সেই কাঁচামালের জন্য সেটাই ধরা হয়।
BOM পেজে প্রতিটি ভ্যারিয়েন্টের কাঁচামালের খরচও দেখা যায়। **প্রোডাকশন অর্ডার
গ্রহণে কাঁচামাল স্বয়ংক্রিয়ভাবে কাটুন** (সেটিংস → ইনভেন্টরি) চালু করলে *প্রোডাকশন*
অর্ডারে তৈরি পণ্য গ্রহণ করামাত্র BOM অনুযায়ী কাঁচামাল কমে যায়; কাঁচামাল কম থাকলে
গ্রহণ আটকে যায়, তবে *কাঁচামালের ঘাটতি অনুমোদন* টিক দিলে যতটা আছে ততটাই কাটে।

## Expenses & profit and loss (`expenses.manage`, `finance.pnl.read`, Settings → finance)

**EN** — Finance → *Expenses*: record rent, salaries, packaging and other
running costs by date, category and amount (taka). Categories are a list you
edit in Settings → finance (*Expense categories*); a category still used by
old expenses can be removed from the list and those expenses keep their key.
Finance → *Profit & loss* turns it into a statement for any date range, or
month by month (up to 12 months): net revenue, minus cost of goods, gives
gross profit; minus courier charges and gateway fees gives contribution;
minus ad spend (imported in Marketing) and your expenses gives net profit.
It uses the same delivered/rejected orders as *True profit* — orders still in
transit are not in yet — and warns when some units have no cost price. If you
also enter ad spend as expenses, turn off *Count imported ad spend in the
P&L* in Settings → finance so it is not counted twice. Both screens export
CSV.

**BN** — ফাইন্যান্স → *খরচ*: ভাড়া, বেতন, প্যাকেজিংসহ চলতি খরচ তারিখ, ক্যাটাগরি ও
টাকার পরিমাণসহ রেকর্ড করুন। ক্যাটাগরির তালিকা সেটিংস → ফাইন্যান্সে (*খরচের
ক্যাটাগরি*) বদলানো যায়; পুরনো খরচে ব্যবহৃত ক্যাটাগরি তালিকা থেকে সরালেও সেই
খরচগুলো নিজের key সহ থেকে যায়। ফাইন্যান্স → *লাভ-ক্ষতি* যেকোনো সময়ের (বা মাস
ধরে, সর্বোচ্চ ১২ মাস) বিবরণী দেয়: রিফান্ড বাদে আয় থেকে পণ্যের খরচ বাদ দিলে
মোট মুনাফা; কুরিয়ার চার্জ ও গেটওয়ে ফি বাদে কন্ট্রিবিউশন; বিজ্ঞাপন খরচ
(মার্কেটিংয়ে আমদানি করা) ও আপনার খরচ বাদে নিট মুনাফা। এটি *প্রকৃত মুনাফা*-র
মতো একই ডেলিভারি/প্রত্যাখ্যাত অর্ডার ধরে — পথে থাকা অর্ডার এখনো যুক্ত নয় — আর
কিছু ইউনিটের ক্রয়মূল্য না থাকলে সতর্ক করে। বিজ্ঞাপন খরচ খরচ হিসেবেও লিখলে
সেটিংস → ফাইন্যান্সে *P&L-এ আমদানি করা বিজ্ঞাপন খরচ ধরুন* বন্ধ করুন, নইলে দু'বার
ধরা হবে। দুটি পেজেই CSV এক্সপোর্ট আছে।

## Cohorts & lifetime value (`reports.read`)

**EN** — Reports → *Cohorts & LTV*. Each row is the customers who first bought
in a month; the columns show how many of them bought again 1, 2, 3 … months
later (*Retention*) or how much each has spent in total by then (*Cumulative
value / customer*). The tiles show average and median lifetime value, the
share of customers who ordered more than once, and how much of your revenue
comes from the top 10%. Only delivered and completed orders count, net of
refunds; guest checkouts can't be followed and are left out. Empty cells are
months that haven't happened yet.

**BN** — রিপোর্ট → *কোহর্ট ও LTV*। প্রতিটি সারি হলো কোনো মাসে প্রথমবার কেনা গ্রাহকরা;
ঘরগুলো দেখায় ১, ২, ৩… মাস পরে তাঁদের কতজন আবার কিনেছেন (*রিটেনশন*) বা তত দিনে প্রতি
গ্রাহক মোট কত খরচ করেছেন (*গ্রাহক প্রতি জমা মূল্য*)। উপরের ঘরগুলোতে গড় ও মধ্যমা
লাইফটাইম ভ্যালু, একাধিকবার কেনা গ্রাহকের হার এবং শীর্ষ ১০% গ্রাহক থেকে আয়ের অংশ
আছে। শুধু ডেলিভারি ও সম্পন্ন অর্ডার রিফান্ড বাদে গোনা হয়; গেস্ট চেকআউট অনুসরণ করা
যায় না বলে বাদ। ফাঁকা ঘর মানে সেই মাস এখনো আসেনি।

## Report builder (`reports.read`, `reports.builder.manage`, Settings → reports)

**EN** — Reports → *Report builder* lets you make your own report. Choose the
data (*Sales* has one row per order, *Products* one row per order line), pick
up to two things to group by (day, week, month, channel, source, category,
size, colour, new vs returning customers …), the measures (orders, units,
revenue, average order value, discount rate, cost of goods, gross margin …),
optional filters ("channel is web", "category is one of Shirts, Polos") and a
date range, then *Run report*. Cancelled, expired and unpaid orders are left
out unless you tick the box. *Export CSV* downloads exactly what you see
(with a totals row). Name and *Save report* to keep it; saved reports appear
at the top. Saving needs the *build custom reports* permission; running only
needs reports access. Reports are computed live from orders, so the date range
(default 366 days) and the number of source rows are capped in Settings →
reports — narrow the range if you hit the limit.

**BN** — রিপোর্ট → *রিপোর্ট বিল্ডার* দিয়ে নিজের মতো রিপোর্ট বানান। ডেটা বেছে নিন
(*বিক্রয়*-এ প্রতি অর্ডারে একটি সারি, *পণ্য*-এ প্রতি অর্ডার লাইনে), সর্বোচ্চ দুটি
ভাগের ভিত্তি (দিন, সপ্তাহ, মাস, চ্যানেল, সোর্স, ক্যাটাগরি, সাইজ, রঙ, নতুন/পুরনো
গ্রাহক…), পরিমাপ (অর্ডার, ইউনিট, আয়, গড় অর্ডার মূল্য, ডিসকাউন্টের হার, পণ্যের
খরচ, গ্রস মার্জিন…), চাইলে ফিল্টার ("চ্যানেল হলো web", "ক্যাটাগরি এগুলোর একটি")
এবং তারিখ পরিসর দিয়ে *রিপোর্ট চালান*। বাতিল, মেয়াদোত্তীর্ণ ও অপরিশোধিত অর্ডার
টিক না দিলে বাদ থাকে। *CSV এক্সপোর্ট* যা দেখছেন ঠিক তা (মোট সারিসহ) নামায়। নাম
দিয়ে *রিপোর্ট সংরক্ষণ* করলে রিপোর্টটি উপরে থাকে। সংরক্ষণে *কাস্টম রিপোর্ট
তৈরি* অনুমতি লাগে, চালাতে শুধু রিপোর্ট অ্যাক্সেস। রিপোর্ট সরাসরি অর্ডার থেকে হিসাব
হয়, তাই তারিখ পরিসর (ডিফল্ট ৩৬৬ দিন) ও সোর্স সারির সংখ্যা সেটিংস → রিপোর্টে সীমিত
— সীমায় আটকে গেলে পরিসর ছোট করুন।

## API keys & the public API (`api_keys.manage`, Settings → platform)

**EN** — Platform → *API keys* lets another system read your data. Turn on
*Public API enabled* in Settings → platform first; nothing works while it is
off. Create a key: give it a name (say who will use it), tick the access it
needs (*products*, *stock levels*, *orders* — read-only; keys can never change
anything) and optionally an expiry date. The key is shown **once** — copy it
into the other system's settings. We keep only a fingerprint, so a lost key
can't be recovered: revoke it and make a new one. The other system sends
`Authorization: Bearer <key>` to `/api/v1/public/v1/products`, `/inventory` or
`/orders` (list endpoints return pages with a `nextCursor`; pass it back as
`after`). Each key is limited to a number of requests per minute (Settings →
platform). Orders include the delivery contact because couriers and ERPs need
it; they never include cost prices, risk scores or internal notes. Revoke a
key the moment you suspect it leaked — it stops working immediately.

**BN** — প্ল্যাটফর্ম → *API কী* দিয়ে অন্য সিস্টেমকে আপনার ডেটা পড়তে দিন। আগে সেটিংস →
প্ল্যাটফর্মে *পাবলিক API চালু* করুন; বন্ধ থাকলে কিছুই চলবে না। কী তৈরি করুন: নাম
দিন (কে ব্যবহার করবে), কী অ্যাক্সেস লাগবে টিক দিন (*পণ্য*, *স্টক*, *অর্ডার* — শুধু
পড়া; কী দিয়ে কিছু বদলানো যায় না) এবং চাইলে মেয়াদ দিন। কী **একবারই** দেখানো হয় —
অন্য সিস্টেমের সেটিংসে কপি করে নিন। আমরা শুধু ফিঙ্গারপ্রিন্ট রাখি, তাই হারালে
ফেরত পাওয়া যায় না: বাতিল করে নতুন বানান। অন্য সিস্টেম `Authorization: Bearer <কী>`
পাঠিয়ে `/api/v1/public/v1/products`, `/inventory` বা `/orders` ডাকে (তালিকায় পাতা
আসে, `nextCursor`-টি `after` হিসেবে ফেরত দিন)। প্রতিটি কী প্রতি মিনিটে নির্দিষ্ট
সংখ্যক অনুরোধ করতে পারে (সেটিংস → প্ল্যাটফর্ম)। অর্ডারে ডেলিভারির যোগাযোগের তথ্য
থাকে, কারণ কুরিয়ার ও ERP-র তা লাগে; ক্রয়মূল্য, ঝুঁকি স্কোর বা অভ্যন্তরীণ নোট কখনো
থাকে না। কী ফাঁস হয়েছে সন্দেহ হলেই বাতিল করুন — সঙ্গে সঙ্গে অকেজো হয়ে যায়।

## Outbound webhooks (`webhooks.manage`, Settings → platform)

**EN** — Platform → *Webhooks* sends your own system a call whenever an order
is placed, confirmed, put on hold, cancelled, shipped, delivered or rejected
at the door. Turn on *Outbound webhooks enabled* in Settings → platform, then
add an endpoint: a name, an **https** address (private/internal addresses are
refused) and the events you want. A *signing secret* is shown once — your
system uses it to check that a call really came from the store: each call has
`X-Webhook-Signature: t=<time>,v1=<HMAC-SHA256 of "time.body">`, plus
`X-Webhook-Id` and `X-Webhook-Event`. A call counts as delivered when your
system answers 2xx; otherwise it is retried after 1, 2, 4, 8… minutes (up to
the attempt limit in Settings), and an endpoint that fails many times in a
row is switched off with a note saying why — fix it and switch it back on.
Delivery is at least once, so ignore an `X-Webhook-Id` you've already
handled. *Send test* fires a harmless ping; *Show deliveries* lists what was
sent and the answers, and failed ones can be retried. *Replace secret*
invalidates the old one at once.

**BN** — প্ল্যাটফর্ম → *ওয়েবহুক* অর্ডার প্লেস, কনফার্ম, হোল্ড, বাতিল, শিপ, ডেলিভারি বা
দরজায় প্রত্যাখ্যাত হলেই আপনার নিজের সিস্টেমে কল পাঠায়। সেটিংস → প্ল্যাটফর্মে
*আউটবাউন্ড ওয়েবহুক চালু* করে এন্ডপয়েন্ট যোগ করুন: নাম, একটি **https** ঠিকানা
(ব্যক্তিগত/অভ্যন্তরীণ ঠিকানা নেওয়া হয় না) এবং কোন কোন ইভেন্ট চান। একটি *সাইনিং
সিক্রেট* একবার দেখানো হয় — কলটি সত্যিই স্টোর থেকে এসেছে কিনা যাচাই করতে আপনার সিস্টেম
এটি ব্যবহার করে: প্রতিটি কলে `X-Webhook-Signature: t=<সময়>,v1=<"সময়.বডি"-র
HMAC-SHA256>` এবং `X-Webhook-Id`, `X-Webhook-Event` থাকে। আপনার সিস্টেম 2xx উত্তর দিলে
ডেলিভারি সফল; নইলে ১, ২, ৪, ৮… মিনিট পর আবার চেষ্টা হয় (সেটিংসের সীমা পর্যন্ত), আর
পরপর অনেকবার ব্যর্থ এন্ডপয়েন্ট কারণসহ বন্ধ হয়ে যায় — ঠিক করে আবার চালু করুন।
ডেলিভারি অন্তত একবার হয়, তাই যে `X-Webhook-Id` আগে সামলেছেন তা বাদ দিন। *টেস্ট
পাঠান* নিরীহ একটি পিং পাঠায়; *ডেলিভারি দেখুন*-এ কী গেল ও কী উত্তর এল দেখা যায়, ব্যর্থ
কল আবার চেষ্টা করা যায়। *সিক্রেট বদলান* পুরনোটি সঙ্গে সঙ্গে অকেজো করে।

## Config bundle — launching another brand (`config_bundle.export`, `config_bundle.import`)

**EN** — Platform → *Config bundle* copies this store's *setup* (not its
data) to a fresh deployment. **Export** picks the parts you want — settings
(secrets are never included), UI texts, message templates, categories,
attributes, menus and CMS pages — and downloads one JSON file. To launch a new
brand: deploy the new store, finish the setup wizard, sign in as the owner,
open *Config bundle*, choose the file, then press **Preview changes**. The
preview says per part how many items would be created, updated or left alone
and lists anything that can't be applied — a setting you lack permission for,
a category whose parent is missing, a menu link to a collection that doesn't
exist here yet. When it looks right, press **Apply import** (everything except
settings is applied all-or-nothing; nothing is ever deleted). Pages arrive as
drafts unless you tick *Publish pages that were published in the bundle*.
Images and product references inside pages and banners don't travel (media and
products belong to each store), so re-pick them afterwards — the preview warns
which pages need it. Typical flow: export → import → upload logo, products and
photos → set the payment/courier credentials → launch checklist.

**BN** — প্ল্যাটফর্ম → *কনফিগ বান্ডেল* এই স্টোরের *সেটআপ* (ডেটা নয়) নতুন ডিপ্লয়মেন্টে
কপি করে। **এক্সপোর্টে** যা যা চান বেছে নিন — সেটিংস (সিক্রেট কখনো থাকে না), UI লেখা,
মেসেজ টেমপ্লেট, ক্যাটাগরি, অ্যাট্রিবিউট, মেনু ও CMS পেজ — একটি JSON ফাইল নামবে। নতুন
ব্র্যান্ড চালু করতে: নতুন স্টোর ডিপ্লয় করে সেটআপ উইজার্ড শেষ করুন, মালিক হিসেবে লগইন
করে *কনফিগ বান্ডেল* খুলে ফাইলটি বেছে **পরিবর্তনের প্রিভিউ** চাপুন। প্রিভিউ প্রতিটি
অংশে কতগুলো তৈরি, হালনাগাদ বা অপরিবর্তিত থাকবে বলে দেয় এবং যা প্রয়োগ করা যাবে না
তার তালিকা দেয় — যেমন অনুমতি নেই এমন সেটিং, প্যারেন্ট নেই এমন ক্যাটাগরি, এখানে এখনো
নেই এমন কালেকশনের মেনু লিংক। ঠিক মনে হলে **ইমপোর্ট প্রয়োগ করুন** (সেটিংস বাদে বাকি
সব হয় পুরোটা নয় কিছুই না; কিছু মোছা হয় না)। *বান্ডেলে প্রকাশিত পেজগুলো প্রকাশ করুন*
টিক না দিলে পেজ ড্রাফট হয়ে আসে। পেজ ও ব্যানারের ভেতরের ছবি ও পণ্যের রেফারেন্স সঙ্গে
যায় না (মিডিয়া ও পণ্য প্রতিটি স্টোরের নিজস্ব), তাই পরে আবার বেছে নিন — কোন কোন পেজে
লাগবে প্রিভিউ সতর্ক করে। সাধারণ ধাপ: এক্সপোর্ট → ইমপোর্ট → লোগো, পণ্য ও ছবি আপলোড →
পেমেন্ট/কুরিয়ারের ক্রেডেনশিয়াল দিন → লঞ্চ চেকলিস্ট।
