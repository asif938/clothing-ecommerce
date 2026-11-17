import type { LocalizedText } from "../i18n/localized-text.ts";

/**
 * Central permission catalog (docs/PROJECT_SPEC.md §8.1/§11, RBAC). The admin
 * "Roles" permission-matrix screen is generated from this list — a new
 * permission only needs an entry here, never custom UI. There is no implicit
 * superuser bypass: the seeded "Super Admin" role is simply granted every
 * permission in this list (see packages/db/src/seed.ts), so the permission
 * guard has exactly one code path.
 */
export interface PermissionDefinition {
  key: string;
  group: string;
  label: LocalizedText;
}

export const PERMISSIONS: PermissionDefinition[] = [
  // Settings (docs/PROJECT_SPEC.md §4.1) — one write permission per settings
  // group; new groups register their own write permission when they're added.
  { key: "settings.read", group: "settings", label: { bn: "সেটিংস দেখুন", en: "View settings" } },
  { key: "settings.brand.write", group: "settings", label: { bn: "ব্র্যান্ড সেটিংস পরিবর্তন করুন", en: "Edit brand settings" } },
  { key: "settings.locale.write", group: "settings", label: { bn: "লোকেল সেটিংস পরিবর্তন করুন", en: "Edit locale settings" } },
  { key: "settings.theme.write", group: "settings", label: { bn: "থিম সেটিংস পরিবর্তন করুন", en: "Edit theme settings" } },
  { key: "settings.security.write", group: "settings", label: { bn: "সুরক্ষা সেটিংস পরিবর্তন করুন", en: "Edit security settings" } },

  // Staff & RBAC
  { key: "staff.manage", group: "staff", label: { bn: "স্টাফ পরিচালনা করুন", en: "Manage staff" } },
  { key: "rbac.manage", group: "staff", label: { bn: "রোল ও অনুমতি পরিচালনা করুন", en: "Manage roles & permissions" } },

  // Media
  { key: "media.manage", group: "media", label: { bn: "মিডিয়া লাইব্রেরি পরিচালনা করুন", en: "Manage media library" } },

  // Locations
  { key: "locations.manage", group: "locations", label: { bn: "এলাকা পরিচালনা করুন", en: "Manage locations" } },

  // Providers / integrations
  { key: "providers.manage", group: "providers", label: { bn: "ইন্টিগ্রেশন পরিচালনা করুন", en: "Manage integrations" } },

  // UI text (ui_strings)
  { key: "ui_strings.manage", group: "content", label: { bn: "UI টেক্সট পরিচালনা করুন", en: "Manage UI text" } },

  // Scheduled jobs
  { key: "jobs.manage", group: "jobs", label: { bn: "শিডিউলড কাজ পরিচালনা করুন", en: "Manage scheduled jobs" } },

  // Audit
  { key: "audit.read", group: "audit", label: { bn: "অডিট লগ দেখুন", en: "View audit log" } },

  // Setup wizard
  { key: "setup.run", group: "setup", label: { bn: "সেটআপ চালান", en: "Run setup" } },

  // Catalog (docs/PROJECT_SPEC.md §16 M2) — one broad permission per module,
  // matching the media.manage/locations.manage/providers.manage granularity
  // already established, plus a narrow one guarding cost_price (§5.3: "cost
  // price (permission-protected)") since that field is commercially sensitive
  // in a way the rest of the catalog isn't.
  { key: "catalog.manage", group: "catalog", label: { bn: "পণ্য ক্যাটালগ পরিচালনা করুন", en: "Manage product catalog" } },
  { key: "catalog.cost.read", group: "catalog", label: { bn: "পণ্যের ক্রয়মূল্য দেখুন", en: "View product cost price" } },
  // Erasing trashed products can't be undone, so it is separate from catalog.manage: the owner decides which staff may do it.
  { key: "catalog.purge", group: "catalog", label: { bn: "মোছা পণ্য স্থায়ীভাবে মুছে ফেলুন", en: "Permanently delete trashed products" } },
  { key: "inventory.manage", group: "inventory", label: { bn: "ইনভেন্টরি পরিচালনা করুন", en: "Manage inventory" } },
  { key: "search.manage", group: "search", label: { bn: "সার্চ সেটিংস পরিচালনা করুন", en: "Manage search settings" } },

  // CMS (docs/PROJECT_SPEC.md §16 M3)
  { key: "cms.manage", group: "cms", label: { bn: "CMS পরিচালনা করুন", en: "Manage CMS content" } },
  { key: "cms.publish", group: "cms", label: { bn: "প্রকাশ করুন", en: "Publish CMS content" } },
  { key: "settings.features.write", group: "settings", label: { bn: "ফিচার সেটিংস পরিবর্তন করুন", en: "Edit feature settings" } },
  { key: "settings.chat.write", group: "settings", label: { bn: "চ্যাট সেটিংস পরিবর্তন করুন", en: "Edit chat settings" } },
  { key: "settings.seo.write", group: "settings", label: { bn: "SEO সেটিংস পরিবর্তন করুন", en: "Edit SEO settings" } },

  // Milestone 5 (docs/PROJECT_SPEC.md §16 M5) — cart/checkout/shipping/
  // payment rules/risk/discounts. Resource-management permissions follow
  // the `catalog.manage`/`cms.manage` granularity; each new settings group
  // gets its own `settings.<group>.write`, matching the existing pattern.
  { key: "shipping.manage", group: "shipping", label: { bn: "শিপিং জোন ও রেট পরিচালনা করুন", en: "Manage shipping zones & rates" } },
  { key: "settings.shipping.write", group: "settings", label: { bn: "শিপিং সেটিংস পরিবর্তন করুন", en: "Edit shipping settings" } },
  { key: "payment_rules.manage", group: "payment_rules", label: { bn: "পেমেন্ট রুল পরিচালনা করুন", en: "Manage payment rules" } },
  { key: "settings.payment.write", group: "settings", label: { bn: "পেমেন্ট সেটিংস পরিবর্তন করুন", en: "Edit payment settings" } },
  { key: "settings.risk.write", group: "settings", label: { bn: "রিস্ক সেটিংস পরিবর্তন করুন", en: "Edit risk settings" } },
  { key: "settings.checkout.write", group: "settings", label: { bn: "চেকআউট সেটিংস পরিবর্তন করুন", en: "Edit checkout settings" } },
  { key: "settings.orders.write", group: "settings", label: { bn: "অর্ডার সেটিংস পরিবর্তন করুন", en: "Edit order settings" } },
  { key: "settings.auth.write", group: "settings", label: { bn: "গ্রাহক অথ সেটিংস পরিবর্তন করুন", en: "Edit customer auth settings" } },
  { key: "discounts.manage", group: "discounts", label: { bn: "ডিসকাউন্ট ও ফ্ল্যাশ সেল পরিচালনা করুন", en: "Manage discounts & flash sales" } },
  { key: "blocklist.manage", group: "blocklist", label: { bn: "ব্লকলিস্ট পরিচালনা করুন", en: "Manage blocklist" } },

  // Milestone 6 (docs/PROJECT_SPEC.md §16 M6) — order management and
  // fulfillment. Courier/payment *provider instances* stay under the
  // existing `providers.manage` (generic Integrations screen, M1); these are
  // for the order-management/warehouse/returns workflows themselves.
  { key: "orders.manage", group: "orders", label: { bn: "অর্ডার পরিচালনা করুন", en: "Manage orders" } },
  { key: "fulfillment.manage", group: "fulfillment", label: { bn: "ফুলফিলমেন্ট পরিচালনা করুন", en: "Manage fulfillment" } },
  { key: "returns.manage", group: "returns", label: { bn: "রিটার্ন ও এক্সচেঞ্জ পরিচালনা করুন", en: "Manage returns & exchanges" } },
  { key: "refunds.manage", group: "refunds", label: { bn: "রিফান্ড পরিচালনা করুন", en: "Manage refunds" } },
  { key: "couriers.manage", group: "couriers", label: { bn: "কুরিয়ার এরিয়া ম্যাপিং পরিচালনা করুন", en: "Manage courier area mapping" } },
  { key: "settings.returns.write", group: "settings", label: { bn: "রিটার্ন সেটিংস পরিবর্তন করুন", en: "Edit returns settings" } },
  { key: "settings.couriers.write", group: "settings", label: { bn: "কুরিয়ার সেটিংস পরিবর্তন করুন", en: "Edit courier settings" } },

  // Milestone 7 (docs/PROJECT_SPEC.md §16 M7) — message templates, channel
  // matrix, and notification logs are all behind one broad permission,
  // matching the `cms.manage`/`catalog.manage` granularity; staff in-app
  // notifications need no permission of their own (every staff member reads
  // only their own).
  { key: "notifications.manage", group: "notifications", label: { bn: "নোটিফিকেশন টেমপ্লেট ও লগ পরিচালনা করুন", en: "Manage notification templates & logs" } },
  { key: "settings.notifications.write", group: "settings", label: { bn: "নোটিফিকেশন সেটিংস পরিবর্তন করুন", en: "Edit notification settings" } },

  // Milestone 8 (docs/PROJECT_SPEC.md §16 M8) — marketing basics, customers,
  // reviews, tracking & feeds, reports. `discounts.manage` (M5) already
  // covers the discounts/flash-sales admin UI this milestone adds — no new
  // permission needed there.
  { key: "customers.manage", group: "customers", label: { bn: "গ্রাহক ও সেগমেন্ট পরিচালনা করুন", en: "Manage customers & segments" } },
  { key: "reviews.manage", group: "reviews", label: { bn: "রিভিউ ও প্রশ্নোত্তর পরিচালনা করুন", en: "Manage reviews & Q&A" } },
  { key: "settings.reviews.write", group: "settings", label: { bn: "রিভিউ সেটিংস পরিবর্তন করুন", en: "Edit review settings" } },
  { key: "reports.read", group: "reports", label: { bn: "ড্যাশবোর্ড ও রিপোর্ট দেখুন", en: "View dashboard & reports" } },
  { key: "settings.tracking.write", group: "settings", label: { bn: "ট্র্যাকিং সেটিংস পরিবর্তন করুন", en: "Edit tracking settings" } },
  { key: "settings.feeds.write", group: "settings", label: { bn: "প্রোডাক্ট ফিড সেটিংস পরিবর্তন করুন", en: "Edit product feed settings" } },

  // Milestone 9 (§16 M9) — hardening & launch readiness.
  { key: "customers.privacy", group: "customers", label: { bn: "গ্রাহকের তথ্য এক্সপোর্ট/অ্যানোনিমাইজ করুন", en: "Export or anonymize customer data" } },
  { key: "settings.ops.write", group: "settings", label: { bn: "অপারেশন সেটিংস পরিবর্তন করুন", en: "Edit operations settings" } },
  { key: "launch_checklist.read", group: "launch_checklist", label: { bn: "লঞ্চ চেকলিস্ট দেখুন", en: "View launch checklist" } },

  // Milestone 10 (§16 M10) — conversion features. Bundle items live under
  // the existing `catalog.manage` (they're a `Product` editor tab, same
  // granularity as relations/media); preorder fields are plain product
  // fields, same reasoning. Abandoned-cart recovery and the blog/lookbook
  // get their own permissions since neither maps to an existing module.
  { key: "marketing.abandoned_carts.manage", group: "marketing", label: { bn: "পরিত্যক্ত কার্ট পুনরুদ্ধার পরিচালনা করুন", en: "Manage abandoned-cart recovery" } },
  { key: "settings.marketing.write", group: "settings", label: { bn: "মার্কেটিং সেটিংস পরিবর্তন করুন", en: "Edit marketing settings" } },
  { key: "blog.manage", group: "blog", label: { bn: "ব্লগ ও লুকবুক পরিচালনা করুন", en: "Manage blog & lookbook" } },
  { key: "settings.pwa.write", group: "settings", label: { bn: "PWA ও পুশ সেটিংস পরিবর্তন করুন", en: "Edit PWA & push settings" } },

  // Milestone 11 (§16 M11) — order operations automation.
  { key: "automation.manage", group: "automation", label: { bn: "অটোমেশন রুল পরিচালনা করুন", en: "Manage automation rules" } },
  { key: "orders.queue.manage", group: "orders", label: { bn: "অর্ডার কিউ ও অ্যাসাইনমেন্ট পরিচালনা করুন", en: "Manage the order queue & assignment" } },
  { key: "orders.merge_split", group: "orders", label: { bn: "অর্ডার মার্জ/স্প্লিট করুন", en: "Merge & split orders" } },
  { key: "couriers.rules.manage", group: "shipping", label: { bn: "কুরিয়ার অ্যাসাইনমেন্ট রুল পরিচালনা করুন", en: "Manage courier assignment rules" } },
  { key: "approvals.decide", group: "approvals", label: { bn: "অনুমোদন অনুরোধ সিদ্ধান্ত দিন", en: "Approve or reject requests" } },
  { key: "approvals.bypass", group: "approvals", label: { bn: "অনুমোদন ছাড়াই কার্যকর করুন", en: "Bypass approval workflows" } },
  { key: "settings.approvals.write", group: "settings", label: { bn: "অনুমোদন সেটিংস পরিবর্তন করুন", en: "Edit approval settings" } },
  // Field-level permissions (§4.1/§8.2): a field is hidden/masked in API
  // responses unless the staff member's role holds the matching `fields.*`
  // permission (or, for cost price, `catalog.cost.read`). The "Field access"
  // admin screen is just a filtered view of the role matrix over these.
  { key: "fields.customer_phone.read", group: "fields", label: { bn: "গ্রাহকের পূর্ণ ফোন নম্বর দেখুন", en: "See customers' full phone numbers" } },
  { key: "fields.order_cost.read", group: "fields", label: { bn: "অর্ডারের ক্রয়মূল্য ও মুনাফা দেখুন", en: "See order cost price & profit" } },

  // Milestone 12 (§16 M12) — inventory and finance. Transfers and stock takes
  // stay under `inventory.manage` (§8.2 lists them on the Inventory screen);
  // *applying* a stock take rewrites on-hand for a whole location, so it gets
  // its own permission. True profit is cost data, so it needs its own read
  // permission separate from `reports.read`.
  { key: "procurement.manage", group: "procurement", label: { bn: "সাপ্লায়ার ও পারচেজ অর্ডার পরিচালনা করুন", en: "Manage suppliers & purchase orders" } },
  { key: "inventory.stock_takes.apply", group: "inventory", label: { bn: "স্টক গণনা প্রয়োগ করুন", en: "Apply stock takes" } },
  { key: "finance.manage", group: "finance", label: { bn: "COD রিকনসিলিয়েশন ও সেটেলমেন্ট পরিচালনা করুন", en: "Manage COD reconciliation & settlements" } },
  { key: "finance.profit.read", group: "finance", label: { bn: "প্রকৃত মুনাফা রিপোর্ট দেখুন", en: "View the true profit report" } },
  { key: "reports.schedule.manage", group: "reports", label: { bn: "নির্ধারিত ইমেইল রিপোর্ট পরিচালনা করুন", en: "Manage scheduled email reports" } },
  { key: "dashboard.layouts.manage", group: "reports", label: { bn: "রোল ও ডিফল্ট ড্যাশবোর্ড লেআউট পরিবর্তন করুন", en: "Edit role & default dashboard layouts" } },
  { key: "settings.inventory.write", group: "settings", label: { bn: "ইনভেন্টরি সেটিংস পরিবর্তন করুন", en: "Edit inventory settings" } },
  { key: "settings.finance.write", group: "settings", label: { bn: "ফাইন্যান্স সেটিংস পরিবর্তন করুন", en: "Edit finance settings" } },
  { key: "settings.reports.write", group: "settings", label: { bn: "রিপোর্ট ও অ্যালার্ট সেটিংস পরিবর্তন করুন", en: "Edit report & alert settings" } },

  // Milestone 13 (§16 M13) — CRM, marketing automation and AI content.
  // Sending a broadcast spends real money (SMS/WhatsApp), so it is split
  // from composing one; generating AI drafts is split from configuring
  // providers, prompts and budgets.
  { key: "loyalty.manage", group: "loyalty", label: { bn: "লয়্যালটি টিয়ার ও পয়েন্ট পরিচালনা করুন", en: "Manage loyalty tiers & points" } },
  { key: "marketing.journeys.manage", group: "marketing", label: { bn: "অটোমেটেড জার্নি পরিচালনা করুন", en: "Manage automated journeys" } },
  { key: "marketing.broadcasts.manage", group: "marketing", label: { bn: "ব্রডকাস্ট তৈরি ও সম্পাদনা করুন", en: "Create & edit broadcasts" } },
  { key: "marketing.broadcasts.send", group: "marketing", label: { bn: "ব্রডকাস্ট পাঠান বা শিডিউল করুন", en: "Send or schedule broadcasts" } },
  { key: "marketing.audiences.manage", group: "marketing", label: { bn: "বিজ্ঞাপন অডিয়েন্স সিঙ্ক পরিচালনা করুন", en: "Manage ad audience sync" } },
  { key: "marketing.ad_spend.manage", group: "marketing", label: { bn: "বিজ্ঞাপন খরচ ইমপোর্ট ও ROAS দেখুন", en: "Import ad spend & view ROAS" } },
  { key: "marketing.calendar.read", group: "marketing", label: { bn: "প্রোমো ক্যালেন্ডার দেখুন", en: "View the promo calendar" } },
  { key: "ai.manage", group: "ai", label: { bn: "AI প্রোভাইডার, প্রম্পট ও বাজেট পরিচালনা করুন", en: "Manage AI providers, prompts & budgets" } },
  { key: "ai.use", group: "ai", label: { bn: "AI দিয়ে ড্রাফট তৈরি করুন", en: "Generate AI drafts" } },
  { key: "seo.audit", group: "seo", label: { bn: "SEO স্কোর ও ভাঙা লিংক পরীক্ষা করুন", en: "Run SEO scores & broken link checks" } },
  { key: "settings.loyalty.write", group: "settings", label: { bn: "লয়্যালটি সেটিংস পরিবর্তন করুন", en: "Edit loyalty settings" } },
  { key: "settings.ai.write", group: "settings", label: { bn: "AI সেটিংস পরিবর্তন করুন", en: "Edit AI settings" } },
  { key: "settings.crm.write", group: "settings", label: { bn: "CRM সেটিংস পরিবর্তন করুন", en: "Edit CRM settings" } },
  // §16 M14 — personalization and experimentation.
  { key: "personalization.manage", group: "personalization", label: { bn: "রেকমেন্ডেশন ও ভিজ্যুয়াল সার্চ পরিচালনা করুন", en: "Manage recommendations & visual search" } },
  { key: "experiments.read", group: "personalization", label: { bn: "A/B টেস্ট ও ফলাফল দেখুন", en: "View A/B tests & results" } },
  { key: "experiments.manage", group: "personalization", label: { bn: "A/B টেস্ট তৈরি, চালু ও বন্ধ করুন", en: "Create, start & stop A/B tests" } },
  { key: "settings.personalization.write", group: "settings", label: { bn: "পার্সোনালাইজেশন সেটিংস পরিবর্তন করুন", en: "Edit personalization settings" } },
  // §16 M15 — support.
  { key: "support.inbox", group: "support", label: { bn: "ইনবক্স দেখুন ও গ্রাহককে উত্তর দিন", en: "View the inbox and reply to customers" } },
  { key: "support.manage", group: "support", label: { bn: "কথোপকথন অন্যকে দিন, সংরক্ষিত উত্তর পরিচালনা করুন", en: "Assign conversations & manage canned replies" } },
  { key: "support.tickets", group: "support", label: { bn: "টিকিট তৈরি ও পরিচালনা করুন", en: "Create & manage tickets" } },
  { key: "support.calls", group: "support", label: { bn: "ক্লিক-টু-কল ও কল লগ", en: "Click-to-call & call log" } },
  { key: "settings.support.write", group: "settings", label: { bn: "সাপোর্ট সেটিংস পরিবর্তন করুন", en: "Edit support settings" } },
  // §16 M16 — loyalty extensions. Issuing gift cards, adjusting wallets and
  // recording affiliate payouts all move money, so each is its own key.
  { key: "gift_cards.manage", group: "rewards", label: { bn: "গিফট কার্ড ইস্যু, বন্ধ ও সমন্বয় করুন", en: "Issue, disable & adjust gift cards" } },
  { key: "store_credit.manage", group: "rewards", label: { bn: "গ্রাহকের স্টোর ক্রেডিট সমন্বয় করুন", en: "Adjust customer store credit" } },
  { key: "referrals.manage", group: "rewards", label: { bn: "রেফারেল দেখুন ও বাতিল করুন", en: "View & void referrals" } },
  { key: "affiliates.manage", group: "rewards", label: { bn: "অ্যাফিলিয়েট ও কমিশন পরিচালনা করুন", en: "Manage affiliates & commissions" } },
  { key: "affiliates.payouts", group: "rewards", label: { bn: "অ্যাফিলিয়েট পেআউট রেকর্ড করুন", en: "Record affiliate payouts" } },
  { key: "settings.rewards.write", group: "settings", label: { bn: "গিফট কার্ড, রেফারেল ও অ্যাফিলিয়েট সেটিংস পরিবর্তন করুন", en: "Edit gift card, referral & affiliate settings" } },
  // §16 M17 — advanced analytics, procurement and platform. API keys and
  // config bundles can expose or overwrite the whole store, so each is its
  // own key and none is implied by a broader one.
  { key: "expenses.manage", group: "finance", label: { bn: "খরচ রেকর্ড ও সম্পাদনা করুন", en: "Record & edit expenses" } },
  { key: "finance.pnl.read", group: "finance", label: { bn: "লাভ-ক্ষতির (P&L) বিবরণী দেখুন", en: "View the profit & loss statement" } },
  { key: "materials.manage", group: "procurement", label: { bn: "কাঁচামাল ও BOM পরিচালনা করুন", en: "Manage materials & bills of materials" } },
  { key: "reports.builder.manage", group: "reports", label: { bn: "কাস্টম রিপোর্ট তৈরি ও সম্পাদনা করুন", en: "Build & edit custom reports" } },
  { key: "api_keys.manage", group: "platform", label: { bn: "API কী তৈরি ও বাতিল করুন", en: "Create & revoke API keys" } },
  { key: "webhooks.manage", group: "platform", label: { bn: "আউটবাউন্ড ওয়েবহুক পরিচালনা করুন", en: "Manage outbound webhooks" } },
  { key: "config_bundle.export", group: "platform", label: { bn: "কনফিগ বান্ডেল এক্সপোর্ট করুন", en: "Export the config bundle" } },
  { key: "config_bundle.import", group: "platform", label: { bn: "কনফিগ বান্ডেল ইমপোর্ট করুন", en: "Import a config bundle" } },
  { key: "settings.platform.write", group: "settings", label: { bn: "API, ওয়েবহুক ও অ্যানালিটিক্স সেটিংস পরিবর্তন করুন", en: "Edit API, webhook & analytics settings" } },
];

const PERMISSION_KEYS = new Set(PERMISSIONS.map((p) => p.key));

export function isKnownPermission(key: string): boolean {
  return PERMISSION_KEYS.has(key);
}

export function listPermissionGroups(): string[] {
  return [...new Set(PERMISSIONS.map((p) => p.group))];
}
