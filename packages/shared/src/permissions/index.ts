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
];

const PERMISSION_KEYS = new Set(PERMISSIONS.map((p) => p.key));

export function isKnownPermission(key: string): boolean {
  return PERMISSION_KEYS.has(key);
}

export function listPermissionGroups(): string[] {
  return [...new Set(PERMISSIONS.map((p) => p.group))];
}
