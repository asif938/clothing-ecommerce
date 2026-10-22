import { z } from "zod";
import { localizedTextSchema } from "../i18n/localized-text.ts";
import { defineSetting } from "./registry.ts";

/**
 * Milestone 1 settings: brand basics, locale, the minimal theme fields the
 * setup wizard collects, and staff security. The full theme/layout system
 * (§4.4.2/4.4.3) is Milestone 3 — `theme.preset`/`theme.brandColor` here are
 * only what the wizard needs to persist a starting choice. Feature toggles
 * (§4.2) are registered by the milestone that introduces each feature, not
 * speculatively here — see docs/DECISIONS.md.
 */

export const BRAND_NAME = defineSetting({
  key: "brand.name",
  group: "brand",
  type: localizedTextSchema,
  default: {},
  label: { bn: "দোকানের নাম", en: "Store name" },
  help: { bn: "গ্রাহকদের কাছে প্রদর্শিত নাম", en: "Shown to customers" },
  secret: false,
  public: true,
  permission: "settings.brand.write",
  ui: { widget: "localizedText" },
});

export const BRAND_LEGAL_NAME = defineSetting({
  key: "brand.legalName",
  group: "brand",
  type: z.string().nullable(),
  default: null,
  label: { bn: "আইনগত নাম", en: "Legal name" },
  secret: false,
  public: true,
  permission: "settings.brand.write",
  ui: { widget: "text" },
});

export const BRAND_LOGO_LIGHT = defineSetting({
  key: "brand.logoLight",
  group: "brand",
  type: z.string().nullable(),
  default: null,
  label: { bn: "লোগো (লাইট)", en: "Logo (light background)" },
  secret: false,
  public: true,
  permission: "settings.brand.write",
  ui: { widget: "image" },
});

export const BRAND_LOGO_DARK = defineSetting({
  key: "brand.logoDark",
  group: "brand",
  type: z.string().nullable(),
  default: null,
  label: { bn: "লোগো (ডার্ক)", en: "Logo (dark background)" },
  secret: false,
  public: true,
  permission: "settings.brand.write",
  ui: { widget: "image" },
});

export const BRAND_FAVICON = defineSetting({
  key: "brand.favicon",
  group: "brand",
  type: z.string().nullable(),
  default: null,
  label: { bn: "ফ্যাভিকন", en: "Favicon" },
  secret: false,
  public: true,
  permission: "settings.brand.write",
  ui: { widget: "image" },
});

export const BRAND_PHONE = defineSetting({
  key: "brand.phone",
  group: "brand",
  type: z.string().nullable(),
  default: null,
  label: { bn: "ফোন নম্বর", en: "Phone number" },
  secret: false,
  public: true,
  permission: "settings.brand.write",
  ui: { widget: "text" },
});

export const BRAND_EMAIL = defineSetting({
  key: "brand.email",
  group: "brand",
  type: z.string().nullable(),
  default: null,
  label: { bn: "ইমেইল", en: "Email" },
  secret: false,
  public: true,
  permission: "settings.brand.write",
  ui: { widget: "text" },
});

export const BRAND_ADDRESS = defineSetting({
  key: "brand.address",
  group: "brand",
  type: localizedTextSchema,
  default: {},
  label: { bn: "ঠিকানা", en: "Address" },
  secret: false,
  public: true,
  permission: "settings.brand.write",
  ui: { widget: "localizedText" },
});

export const BRAND_SOCIAL_LINKS = defineSetting({
  key: "brand.socialLinks",
  group: "brand",
  type: z.record(z.string(), z.string()).default({}),
  default: {},
  label: { bn: "সোশ্যাল লিংক", en: "Social links" },
  help: { bn: "যেমন facebook, instagram, whatsapp", en: "e.g. facebook, instagram, whatsapp" },
  secret: false,
  public: true,
  permission: "settings.brand.write",
  ui: { widget: "json" },
});

export const LOCALE_DEFAULT = defineSetting({
  key: "locale.default",
  group: "locale",
  type: z.enum(["bn", "en"]),
  default: "bn",
  label: { bn: "ডিফল্ট ভাষা", en: "Default locale" },
  secret: false,
  public: true,
  permission: "settings.locale.write",
  ui: {
    widget: "select",
    options: [
      { value: "bn", label: { bn: "বাংলা", en: "Bangla" } },
      { value: "en", label: { bn: "ইংরেজি", en: "English" } },
    ],
  },
});

export const LOCALE_ENABLED = defineSetting({
  key: "locale.enabled",
  group: "locale",
  type: z.array(z.enum(["bn", "en"])).min(1),
  default: ["bn", "en"],
  label: { bn: "সক্রিয় ভাষাসমূহ", en: "Enabled locales" },
  secret: false,
  public: true,
  permission: "settings.locale.write",
  ui: { widget: "json" },
});

export const LOCALE_USE_BANGLA_DIGITS = defineSetting({
  key: "locale.useBanglaDigits",
  group: "locale",
  type: z.boolean(),
  default: true,
  label: { bn: "বাংলা সংখ্যা ব্যবহার করুন (০-৯)", en: "Use Bangla digits (০-৯)" },
  secret: false,
  public: true,
  permission: "settings.locale.write",
  ui: { widget: "toggle" },
});

export const LOCALE_TIMEZONE = defineSetting({
  key: "locale.timezone",
  group: "locale",
  type: z.string(),
  default: "Asia/Dhaka",
  label: { bn: "টাইম জোন", en: "Time zone" },
  secret: false,
  public: true,
  permission: "settings.locale.write",
  ui: { widget: "text" },
});

export const THEME_PRESET = defineSetting({
  key: "theme.preset",
  group: "theme",
  type: z.enum(["minimal", "classic", "bold"]),
  default: "minimal",
  label: { bn: "থিম প্রিসেট", en: "Theme preset" },
  secret: false,
  public: true,
  permission: "settings.theme.write",
  ui: {
    widget: "select",
    options: [
      { value: "minimal", label: { bn: "মিনিমাল", en: "Minimal" } },
      { value: "classic", label: { bn: "ক্লাসিক", en: "Classic" } },
      { value: "bold", label: { bn: "বোল্ড", en: "Bold" } },
    ],
  },
});

export const THEME_BRAND_COLOR = defineSetting({
  key: "theme.brandColor",
  group: "theme",
  type: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  default: "#111827",
  label: { bn: "ব্র্যান্ড রং", en: "Brand color" },
  secret: false,
  public: true,
  permission: "settings.theme.write",
  ui: { widget: "color" },
});

export const SECURITY_STAFF_SESSION_TTL_HOURS = defineSetting({
  key: "security.staffSessionTtlHours",
  group: "security",
  type: z.number().int().min(1).max(24 * 30),
  default: 12,
  label: { bn: "স্টাফ সেশনের মেয়াদ (ঘণ্টা)", en: "Staff session lifetime (hours)" },
  secret: false,
  public: false,
  permission: "settings.security.write",
  ui: { widget: "text" },
});

export const SECURITY_PASSWORD_MIN_LENGTH = defineSetting({
  key: "security.passwordMinLength",
  group: "security",
  type: z.number().int().min(8).max(64),
  default: 10,
  label: { bn: "পাসওয়ার্ডের সর্বনিম্ন দৈর্ঘ্য", en: "Minimum password length" },
  secret: false,
  public: false,
  permission: "settings.security.write",
  ui: { widget: "text" },
});
