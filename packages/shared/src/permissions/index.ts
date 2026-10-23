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
];

const PERMISSION_KEYS = new Set(PERMISSIONS.map((p) => p.key));

export function isKnownPermission(key: string): boolean {
  return PERMISSION_KEYS.has(key);
}

export function listPermissionGroups(): string[] {
  return [...new Set(PERMISSIONS.map((p) => p.group))];
}
