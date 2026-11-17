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

/**
 * "env" (the default) means new uploads use the env-configured S3/R2
 * driver — storage bucket credentials stay infra-only (docs/DECISIONS.md,
 * Milestone 1). Any other value is a `provider_instances.id` for an
 * alternative storage provider (Cloudinary — change request 2026-10-22).
 * Switching this affects NEW uploads only; existing media keeps the
 * provider it was uploaded to (`media.providerInstanceId`).
 */
export const MEDIA_DEFAULT_PROVIDER = defineSetting({
  key: "media.defaultProvider",
  group: "media",
  type: z.string().min(1),
  default: "env",
  label: { bn: "ডিফল্ট মিডিয়া প্রোভাইডার", en: "Default media provider" },
  help: {
    bn: '"env" মানে পরিবেশ ভেরিয়েবলে কনফিগার করা S3/R2। নতুন আপলোডের জন্য প্রযোজ্য — পুরনো ফাইল অপরিবর্তিত থাকে।',
    en: 'Use "env" for the S3/R2 driver configured via environment variables, or a storage provider\'s id (e.g. Cloudinary). Applies to new uploads only — existing files keep working on their original provider.',
  },
  secret: false,
  public: false,
  permission: "providers.manage",
  ui: { widget: "text" },
});

export const MEDIA_FALLBACK_TO_ENV_ON_PROVIDER_LIMIT = defineSetting({
  key: "media.fallbackToEnvOnProviderLimit",
  group: "media",
  type: z.boolean(),
  default: true,
  label: { bn: "লিমিটের কাছে গেলে ডিফল্ট স্টোরেজে ফিরে যান", en: "Fall back to default storage near provider limit" },
  help: {
    bn: "ক্লাউডিনারির মত শেয়ার্ড-ক্রেডিট প্রোভাইডার ৯৫% ব্যবহারের কাছাকাছি গেলে নতুন আপলোড env-কনফিগার করা স্টোরেজে পাঠানো হবে।",
    en: "When a shared-credit provider like Cloudinary nears 95% usage, new uploads are sent to the env-configured storage instead.",
  },
  secret: false,
  public: false,
  permission: "providers.manage",
  ui: { widget: "toggle" },
});

export const SECURITY_PASSWORD_MIN_LENGTH = defineSetting({
  key: "security.passwordMinLength",
  group: "security",
  type: z.number().int().min(8).max(64),
  default: 12,
  label: { bn: "পাসওয়ার্ডের সর্বনিম্ন দৈর্ঘ্য", en: "Minimum password length" },
  secret: false,
  public: false,
  permission: "settings.security.write",
  ui: { widget: "text" },
});

/** §12 — idle timeout: a session with no authenticated request for this long is treated as expired, independent of its absolute `staffSessionTtlHours` lifetime. */
export const SECURITY_STAFF_SESSION_IDLE_MINUTES = defineSetting({
  key: "security.staffSessionIdleMinutes",
  group: "security",
  type: z.number().int().min(5).max(24 * 60),
  default: 60,
  label: { bn: "নিষ্ক্রিয়তার মেয়াদ (মিনিট)", en: "Idle timeout (minutes)" },
  secret: false,
  public: false,
  permission: "settings.security.write",
  ui: { widget: "text" },
});

/** §12 "login rate limit and lockout" — failed attempts at or above this count lock the account for `loginLockoutMinutes`. */
export const SECURITY_LOGIN_MAX_ATTEMPTS = defineSetting({
  key: "security.loginMaxAttempts",
  group: "security",
  type: z.number().int().min(3).max(20),
  default: 5,
  label: { bn: "সর্বোচ্চ ব্যর্থ লগইন চেষ্টা", en: "Max failed login attempts" },
  secret: false,
  public: false,
  permission: "settings.security.write",
  ui: { widget: "text" },
});

export const SECURITY_LOGIN_LOCKOUT_MINUTES = defineSetting({
  key: "security.loginLockoutMinutes",
  group: "security",
  type: z.number().int().min(1).max(24 * 60),
  default: 15,
  label: { bn: "লকআউটের মেয়াদ (মিনিট)", en: "Lockout duration (minutes)" },
  secret: false,
  public: false,
  permission: "settings.security.write",
  ui: { widget: "text" },
});

/** §12 "optional IP allow-list setting" for the admin panel. Empty = disabled. Comma-separated IPv4/IPv6 addresses or CIDR blocks. */
export const SECURITY_ADMIN_IP_ALLOWLIST = defineSetting({
  key: "security.adminIpAllowlist",
  group: "security",
  type: z.string(),
  default: "",
  label: { bn: "অ্যাডমিন আইপি অ্যালাউলিস্ট", en: "Admin IP allow-list" },
  help: {
    bn: "কমা দিয়ে আলাদা করা আইপি/CIDR (যেমন 203.0.113.4, 10.0.0.0/8)। খালি রাখলে বন্ধ থাকবে।",
    en: "Comma-separated IPs/CIDR blocks (e.g. 203.0.113.4, 10.0.0.0/8) allowed to reach the admin API. Leave empty to disable.",
  },
  secret: false,
  public: false,
  permission: "settings.security.write",
  ui: { widget: "text" },
});

/**
 * Milestone 3 (docs/PROJECT_SPEC.md §4.4.3/§7.2/§7.6): layout variants,
 * fonts, maintenance mode, cookie consent, chat buttons, SEO title
 * template. All `public: true` — the storefront layout reads every one of
 * these from `GET /store/config` on every request (no caching beyond
 * what the revalidation pipeline controls), which is how a brand color,
 * header variant, or hero text change reaches the live site without a
 * deploy (§16 M3 acceptance scenario).
 */
export const THEME_HEADER_VARIANT = defineSetting({
  key: "theme.headerVariant",
  group: "theme",
  type: z.enum(["centered", "left", "mega", "minimal"]),
  default: "left",
  label: { bn: "হেডার ভ্যারিয়েন্ট", en: "Header variant" },
  secret: false,
  public: true,
  permission: "settings.theme.write",
  ui: {
    widget: "select",
    options: [
      { value: "centered", label: { bn: "মাঝখানে লোগো", en: "Centered logo" } },
      { value: "left", label: { bn: "বামে লোগো", en: "Left logo" } },
      { value: "mega", label: { bn: "মেগা মেনু সহ", en: "With mega menu" } },
      { value: "minimal", label: { bn: "মিনিমাল", en: "Minimal" } },
    ],
  },
});

export const THEME_FOOTER_VARIANT = defineSetting({
  key: "theme.footerVariant",
  group: "theme",
  type: z.enum(["columns", "compact"]),
  default: "columns",
  label: { bn: "ফুটার ভ্যারিয়েন্ট", en: "Footer variant" },
  secret: false,
  public: true,
  permission: "settings.theme.write",
  ui: {
    widget: "select",
    options: [
      { value: "columns", label: { bn: "কলাম", en: "Columns" } },
      { value: "compact", label: { bn: "কম্প্যাক্ট", en: "Compact" } },
    ],
  },
});

export const THEME_PRODUCT_CARD_VARIANT = defineSetting({
  key: "theme.productCardVariant",
  group: "theme",
  type: z.enum(["standard", "hoverImage", "quickAdd"]),
  default: "standard",
  label: { bn: "প্রোডাক্ট কার্ড ভ্যারিয়েন্ট", en: "Product card variant" },
  secret: false,
  public: true,
  permission: "settings.theme.write",
  ui: {
    widget: "select",
    options: [
      { value: "standard", label: { bn: "স্ট্যান্ডার্ড", en: "Standard" } },
      { value: "hoverImage", label: { bn: "হোভার ইমেজ", en: "With hover image" } },
      { value: "quickAdd", label: { bn: "কুইক-অ্যাড", en: "With quick-add" } },
    ],
  },
});

export const THEME_FONT_BANGLA = defineSetting({
  key: "theme.fontBangla",
  group: "theme",
  type: z.enum(["hind-siliguri", "noto-sans-bengali", "noto-serif-bengali"]),
  default: "hind-siliguri",
  label: { bn: "বাংলা ফন্ট", en: "Bangla font" },
  secret: false,
  public: true,
  permission: "settings.theme.write",
  ui: {
    widget: "select",
    options: [
      { value: "hind-siliguri", label: { bn: "Hind Siliguri", en: "Hind Siliguri" } },
      { value: "noto-sans-bengali", label: { bn: "Noto Sans Bengali", en: "Noto Sans Bengali" } },
      { value: "noto-serif-bengali", label: { bn: "Noto Serif Bengali", en: "Noto Serif Bengali" } },
    ],
  },
});

export const THEME_FONT_LATIN = defineSetting({
  key: "theme.fontLatin",
  group: "theme",
  type: z.enum(["inter", "poppins", "system"]),
  default: "inter",
  label: { bn: "ল্যাটিন ফন্ট", en: "Latin font" },
  secret: false,
  public: true,
  permission: "settings.theme.write",
  ui: {
    widget: "select",
    options: [
      { value: "inter", label: { bn: "Inter", en: "Inter" } },
      { value: "poppins", label: { bn: "Poppins", en: "Poppins" } },
      { value: "system", label: { bn: "সিস্টেম ফন্ট", en: "System font" } },
    ],
  },
});

export const FEATURES_MAINTENANCE_MODE = defineSetting({
  key: "features.maintenanceMode",
  group: "features",
  type: z.boolean(),
  default: false,
  label: { bn: "মেইনটেন্যান্স মোড", en: "Maintenance mode" },
  help: { bn: "চালু করলে স্টোরফ্রন্টে সবার জন্য মেইনটেন্যান্স পেজ দেখানো হবে।", en: "When on, every storefront visitor sees the maintenance page." },
  secret: false,
  public: true,
  permission: "settings.features.write",
  ui: { widget: "toggle" },
});

export const FEATURES_COOKIE_CONSENT = defineSetting({
  key: "features.cookieConsent",
  group: "features",
  type: z.boolean(),
  default: false,
  label: { bn: "কুকি সম্মতি ব্যানার", en: "Cookie consent banner" },
  secret: false,
  public: true,
  permission: "settings.features.write",
  ui: { widget: "toggle" },
});

export const CHAT_WHATSAPP_ENABLED = defineSetting({
  key: "chat.whatsappEnabled",
  group: "chat",
  type: z.boolean(),
  default: false,
  label: { bn: "হোয়াটসঅ্যাপ চ্যাট বাটন", en: "WhatsApp chat button" },
  secret: false,
  public: true,
  permission: "settings.chat.write",
  ui: { widget: "toggle" },
});

export const CHAT_WHATSAPP_NUMBER = defineSetting({
  key: "chat.whatsappNumber",
  group: "chat",
  type: z.string().nullable(),
  default: null,
  label: { bn: "হোয়াটসঅ্যাপ নম্বর", en: "WhatsApp number" },
  help: { bn: "আন্তর্জাতিক ফরম্যাটে, যেমন 8801700000000", en: "International format, e.g. 8801700000000" },
  secret: false,
  public: true,
  permission: "settings.chat.write",
  ui: { widget: "text" },
});

export const CHAT_MESSENGER_ENABLED = defineSetting({
  key: "chat.messengerEnabled",
  group: "chat",
  type: z.boolean(),
  default: false,
  label: { bn: "মেসেঞ্জার চ্যাট বাটন", en: "Messenger chat button" },
  secret: false,
  public: true,
  permission: "settings.chat.write",
  ui: { widget: "toggle" },
});

export const CHAT_MESSENGER_PAGE_URL = defineSetting({
  key: "chat.messengerPageUrl",
  group: "chat",
  type: z.string().nullable(),
  default: null,
  label: { bn: "মেসেঞ্জার পেজ লিংক", en: "Messenger page link" },
  secret: false,
  public: true,
  permission: "settings.chat.write",
  ui: { widget: "text" },
});

/**
 * Milestone 5 (docs/PROJECT_SPEC.md §6.3-§6.13, §17): shipping/weight
 * defaults, payment/risk/checkout behavior, order numbering, customer-auth
 * (OTP + Google) toggles. None of these are `public: true` — unlike M3's
 * theme/brand settings, nothing here is read directly by an unauthenticated
 * storefront page; the cart/checkout API reads them server-side.
 */
export const SHIPPING_DEFAULT_ITEM_WEIGHT_GRAMS = defineSetting({
  key: "shipping.defaultItemWeightGrams",
  group: "shipping",
  type: z.number().int().min(1),
  default: 400,
  label: { bn: "ডিফল্ট পণ্যের ওজন (গ্রাম)", en: "Default item weight (grams)" },
  help: { bn: "যখন কোনো ভ্যারিয়েন্টের ওজন সেট করা নেই তখন ব্যবহৃত হয়", en: "Used when a variant has no weight set" },
  secret: false,
  public: false,
  permission: "settings.shipping.write",
  ui: { widget: "text" },
});

export const SHIPPING_FREE_DELIVERY_THRESHOLD = defineSetting({
  key: "shipping.freeDeliveryThreshold",
  group: "shipping",
  type: z.number().int().min(0).nullable(),
  default: null,
  label: { bn: "ফ্রি ডেলিভারি থ্রেশহোল্ড (৳)", en: "Free delivery threshold (৳)" },
  help: { bn: "খালি রাখলে বন্ধ থাকবে", en: "Leave empty to disable" },
  secret: false,
  public: false,
  permission: "settings.shipping.write",
  ui: { widget: "money" },
});

export const SHIPPING_FALLBACK_FEE = defineSetting({
  key: "shipping.fallbackFee",
  group: "shipping",
  type: z.number().int().min(0).nullable(),
  default: null,
  label: { bn: "কোনো জোন না মিললে ফি (৳)", en: "Fee when no zone matches (৳)" },
  help: { bn: "খালি রাখলে কোনো জোন না মিললে চেকআউট ব্লক হবে", en: "Leave empty to block checkout when no zone matches" },
  secret: false,
  public: false,
  permission: "settings.shipping.write",
  ui: { widget: "money" },
});

export const PAYMENT_COD_ENABLED = defineSetting({
  key: "payment.codEnabled",
  group: "payment",
  type: z.boolean(),
  default: true,
  label: { bn: "ক্যাশ অন ডেলিভারি চালু", en: "Cash on delivery enabled" },
  secret: false,
  public: false,
  permission: "settings.payment.write",
  ui: { widget: "toggle" },
});

export const PAYMENT_TIMEOUT_MINUTES = defineSetting({
  key: "payment.timeoutMinutes",
  group: "payment",
  type: z.number().int().min(1).max(24 * 60),
  default: 30,
  label: { bn: "পেমেন্ট টাইমআউট (মিনিট)", en: "Payment timeout (minutes)" },
  help: { bn: "এই সময়ের মধ্যে পেমেন্ট সম্পন্ন না হলে অর্ডারটি মেয়াদোত্তীর্ণ হয়ে যাবে এবং স্টক মুক্ত হবে", en: "Unpaid pending_payment orders expire after this and release their stock reservation" },
  secret: false,
  public: false,
  permission: "settings.payment.write",
  ui: { widget: "text" },
});

const DEFAULT_RISK_WEIGHTS = {
  blocklisted_phone: 100,
  courier_history_low: 40,
  courier_history_medium: 20,
  doorstep_rejection: 15,
  cancelled_after_confirm: 10,
  new_customer_high_value: 15,
  same_phone_or_device_burst: 20,
  same_ip_multi_phone_burst: 25,
  address_too_short_or_test_words: 15,
  name_looks_invalid: 10,
  delivered_history_no_rejections: -30,
  otp_verified: -10,
};

export const RISK_WEIGHTS = defineSetting({
  key: "risk.weights",
  group: "risk",
  type: z.record(z.string(), z.number()),
  default: DEFAULT_RISK_WEIGHTS,
  label: { bn: "রিস্ক স্কোরিং ওয়েট", en: "Risk scoring weights" },
  secret: false,
  public: false,
  permission: "settings.risk.write",
  ui: { widget: "json" },
});

export const RISK_THRESHOLDS = defineSetting({
  key: "risk.thresholds",
  group: "risk",
  type: z.object({ low: z.number().int(), medium: z.number().int() }),
  default: { low: 30, medium: 60 },
  label: { bn: "রিস্ক লেভেল থ্রেশহোল্ড", en: "Risk level thresholds" },
  help: { bn: "low < low-threshold ≤ medium < medium-threshold ≤ high", en: "low < low-threshold ≤ medium < medium-threshold ≤ high" },
  secret: false,
  public: false,
  permission: "settings.risk.write",
  ui: { widget: "json" },
});

export const RISK_HOLD_HIGH_RISK = defineSetting({
  key: "risk.holdHighRisk",
  group: "risk",
  type: z.boolean(),
  default: false,
  label: { bn: "হাই-রিস্ক অর্ডার হোল্ডে রাখুন", en: "Hold high-risk orders" },
  secret: false,
  public: false,
  permission: "settings.risk.write",
  ui: { widget: "toggle" },
});

export const RISK_HIGH_VALUE_THRESHOLD = defineSetting({
  key: "risk.highValueThreshold",
  group: "risk",
  type: z.number().int().min(0),
  default: 500_00,
  label: { bn: "উচ্চ-মূল্যের থ্রেশহোল্ড (৳)", en: "High-value threshold (৳)" },
  secret: false,
  public: false,
  permission: "settings.risk.write",
  ui: { widget: "money" },
});

export const RISK_DUPLICATE_WINDOW_MINUTES = defineSetting({
  key: "risk.duplicateWindowMinutes",
  group: "risk",
  type: z.number().int().min(1),
  default: 60,
  label: { bn: "ডুপ্লিকেট অর্ডার উইন্ডো (মিনিট)", en: "Duplicate-order window (minutes)" },
  secret: false,
  public: false,
  permission: "settings.risk.write",
  ui: { widget: "text" },
});

export const CHECKOUT_CUSTOMER_EMAIL_REQUIREMENT = defineSetting({
  key: "checkout.customerEmailRequirement",
  group: "checkout",
  type: z.enum(["hidden", "optional", "required"]),
  default: "optional",
  label: { bn: "চেকআউটে ইমেইল", en: "Email at checkout" },
  secret: false,
  public: false,
  permission: "settings.checkout.write",
  ui: {
    widget: "select",
    options: [
      { value: "hidden", label: { bn: "দেখানো হবে না", en: "Hidden" } },
      { value: "optional", label: { bn: "ঐচ্ছিক", en: "Optional" } },
      { value: "required", label: { bn: "আবশ্যক", en: "Required" } },
    ],
  },
});

export const CHECKOUT_TERMS_CHECKBOX_ENABLED = defineSetting({
  key: "checkout.termsCheckboxEnabled",
  group: "checkout",
  type: z.boolean(),
  default: false,
  label: { bn: "শর্তাবলী চেকবক্স", en: "Terms checkbox" },
  secret: false,
  public: false,
  permission: "settings.checkout.write",
  ui: { widget: "toggle" },
});

export const CHECKOUT_MAX_COUPON_CODES_PER_ORDER = defineSetting({
  key: "checkout.maxCouponCodesPerOrder",
  group: "checkout",
  type: z.number().int().min(1).max(10),
  default: 1,
  label: { bn: "প্রতি অর্ডারে সর্বোচ্চ কুপন কোড", en: "Max coupon codes per order" },
  secret: false,
  public: false,
  permission: "settings.checkout.write",
  ui: { widget: "text" },
});

export const CHECKOUT_OTP_REQUIRED = defineSetting({
  key: "checkout.otpRequired",
  group: "checkout",
  type: z.boolean(),
  default: false,
  label: { bn: "চেকআউটে OTP আবশ্যক", en: "OTP required at checkout" },
  secret: false,
  public: false,
  permission: "settings.checkout.write",
  ui: { widget: "toggle" },
});

export const CHECKOUT_TURNSTILE_ENABLED = defineSetting({
  key: "checkout.turnstileEnabled",
  group: "checkout",
  type: z.boolean(),
  default: false,
  label: { bn: "চেকআউটে ক্যাপচা", en: "Captcha at checkout" },
  secret: false,
  public: false,
  permission: "settings.checkout.write",
  ui: { widget: "toggle" },
});

export const CHECKOUT_SIMPLE_DHAKA_TOGGLE = defineSetting({
  key: "checkout.simpleDhakaToggle",
  group: "checkout",
  type: z.boolean(),
  default: false,
  label: { bn: "ঢাকার ভেতরে/বাইরে সহজ টগল", en: "Simple inside/outside Dhaka toggle" },
  help: { bn: "চালু করলে বিভাগ/জেলা/এলাকা নির্বাচনের বদলে একটি সহজ টগল দেখাবে", en: "When on, shows a simple toggle instead of division/district/area selects" },
  secret: false,
  public: false,
  permission: "settings.checkout.write",
  ui: { widget: "toggle" },
});

export const CHECKOUT_GIFT_WRAP_ENABLED = defineSetting({
  key: "checkout.giftWrapEnabled",
  group: "checkout",
  type: z.boolean(),
  default: false,
  label: { bn: "গিফট র‍্যাপ অপশন", en: "Gift wrap option" },
  secret: false,
  public: false,
  permission: "settings.checkout.write",
  ui: { widget: "toggle" },
});

export const CHECKOUT_GIFT_WRAP_FEE = defineSetting({
  key: "checkout.giftWrapFee",
  group: "checkout",
  type: z.number().int().min(0),
  default: 0,
  label: { bn: "গিফট র‍্যাপ ফি (৳)", en: "Gift wrap fee (৳)" },
  secret: false,
  public: false,
  permission: "settings.checkout.write",
  ui: { widget: "money" },
});

export const CHECKOUT_ALLOW_CUSTOMER_CANCEL_WHILE_PENDING = defineSetting({
  key: "checkout.allowCustomerCancelWhilePending",
  group: "checkout",
  type: z.boolean(),
  default: true,
  label: { bn: "পেন্ডিং অর্ডার গ্রাহক নিজে বাতিল করতে পারবে", en: "Customer can cancel while order is pending" },
  secret: false,
  public: false,
  permission: "settings.checkout.write",
  ui: { widget: "toggle" },
});

export const ORDERS_NUMBER_FORMAT = defineSetting({
  key: "orders.numberFormat",
  group: "orders",
  type: z.string().min(1),
  default: "{PREFIX}{YYMMDD}{SEQ4}",
  label: { bn: "অর্ডার নম্বর ফরম্যাট", en: "Order number format" },
  help: { bn: "ভ্যারিয়েবল: {PREFIX} (ব্র্যান্ডের নামের প্রথম ৩ অক্ষর), {YYMMDD}, {SEQ4}", en: "Variables: {PREFIX} (brand name's first 3 letters), {YYMMDD}, {SEQ4}" },
  secret: false,
  public: false,
  permission: "settings.orders.write",
  ui: { widget: "text" },
});

export const AUTH_OTP_LENGTH = defineSetting({
  key: "auth.otpLength",
  group: "auth",
  type: z.number().int().min(4).max(6),
  default: 6,
  label: { bn: "OTP এর দৈর্ঘ্য", en: "OTP length" },
  secret: false,
  public: false,
  permission: "settings.auth.write",
  ui: { widget: "text" },
});

export const AUTH_OTP_TTL_MINUTES = defineSetting({
  key: "auth.otpTtlMinutes",
  group: "auth",
  type: z.number().int().min(1).max(60),
  default: 5,
  label: { bn: "OTP এর মেয়াদ (মিনিট)", en: "OTP validity (minutes)" },
  secret: false,
  public: false,
  permission: "settings.auth.write",
  ui: { widget: "text" },
});

export const AUTH_OTP_MAX_ATTEMPTS = defineSetting({
  key: "auth.otpMaxAttempts",
  group: "auth",
  type: z.number().int().min(1).max(20),
  default: 5,
  label: { bn: "OTP যাচাইয়ের সর্বোচ্চ চেষ্টা", en: "Max OTP verify attempts" },
  secret: false,
  public: false,
  permission: "settings.auth.write",
  ui: { widget: "text" },
});

export const AUTH_OTP_RESEND_SECONDS = defineSetting({
  key: "auth.otpResendSeconds",
  group: "auth",
  type: z.number().int().min(10).max(600),
  default: 60,
  label: { bn: "OTP পুনরায় পাঠানোর বিরতি (সেকেন্ড)", en: "OTP resend cooldown (seconds)" },
  secret: false,
  public: false,
  permission: "settings.auth.write",
  ui: { widget: "text" },
});

export const AUTH_OTP_MAX_SENDS_PER_PHONE_PER_10_MIN = defineSetting({
  key: "auth.otpMaxSendsPerPhonePer10Min",
  group: "auth",
  type: z.number().int().min(1).max(20),
  default: 3,
  label: { bn: "প্রতি ফোন নম্বরে ১০ মিনিটে সর্বোচ্চ OTP প্রেরণ", en: "Max OTP sends per phone per 10 minutes" },
  secret: false,
  public: false,
  permission: "settings.auth.write",
  ui: { widget: "text" },
});

export const AUTH_GOOGLE_ENABLED = defineSetting({
  key: "auth.googleEnabled",
  group: "auth",
  type: z.boolean(),
  default: false,
  label: { bn: "গুগল সাইন-ইন চালু", en: "Google sign-in enabled" },
  secret: false,
  public: true,
  permission: "settings.auth.write",
  ui: { widget: "toggle" },
});

export const AUTH_GOOGLE_CLIENT_ID = defineSetting({
  key: "auth.googleClientId",
  group: "auth",
  type: z.string().nullable(),
  default: null,
  label: { bn: "গুগল ক্লায়েন্ট আইডি", en: "Google client ID" },
  secret: false,
  public: true,
  permission: "settings.auth.write",
  ui: { widget: "text" },
});

export const AUTH_GOOGLE_CLIENT_SECRET = defineSetting({
  key: "auth.googleClientSecret",
  group: "auth",
  type: z.string().nullable(),
  default: null,
  label: { bn: "গুগল ক্লায়েন্ট সিক্রেট", en: "Google client secret" },
  secret: true,
  public: false,
  permission: "settings.auth.write",
  ui: { widget: "text" },
});

export const PRICING_MARGIN_GUARD_ENABLED = defineSetting({
  key: "pricing.marginGuard.enabled",
  group: "pricing",
  type: z.boolean(),
  default: false,
  label: { bn: "মার্জিন গার্ড চালু", en: "Margin guard enabled" },
  help: { bn: "ক্রয়মূল্যের চেয়ে কম দামে বিক্রি রোধ করতে ডিসকাউন্ট ব্লক করুন", en: "Block a discount from pushing a line's net price below cost" },
  secret: false,
  public: false,
  permission: "discounts.manage",
  ui: { widget: "toggle" },
});

export const PRICING_MARGIN_GUARD_MIN_MARGIN_PERCENT = defineSetting({
  key: "pricing.marginGuard.minMarginPercent",
  group: "pricing",
  type: z.number().min(0).max(1000),
  default: 0,
  label: { bn: "সর্বনিম্ন মার্জিন (%)", en: "Minimum margin (%)" },
  secret: false,
  public: false,
  permission: "discounts.manage",
  ui: { widget: "text" },
});

export const PRICING_MARGIN_GUARD_BLOCK_WHOLE_DISCOUNT = defineSetting({
  key: "pricing.marginGuard.blockWholeDiscount",
  group: "pricing",
  type: z.boolean(),
  default: false,
  label: { bn: "পুরো ডিসকাউন্ট ব্লক করুন (শুধু লাইন নয়)", en: "Block the whole discount (not just the line)" },
  secret: false,
  public: false,
  permission: "discounts.manage",
  ui: { widget: "toggle" },
});

export const SEO_TITLE_TEMPLATE = defineSetting({
  key: "seo.titleTemplate",
  group: "seo",
  type: z.string().min(1),
  default: "{title} | {brand}",
  label: { bn: "SEO টাইটেল টেমপ্লেট", en: "SEO title template" },
  help: { bn: "ব্যবহারযোগ্য ভ্যারিয়েবল: {title}, {brand}", en: "Available variables: {title}, {brand}" },
  secret: false,
  public: true,
  permission: "settings.seo.write",
  ui: { widget: "text" },
});

/**
 * Milestone 6 (docs/PROJECT_SPEC.md §6.8-§6.10, §10.2, §16 M6): order
 * fulfillment, courier polling, and returns/doorstep-rejection policy. None
 * of these are `public: true` — read server-side by staff-facing fulfillment
 * flows and the checkout/tracking APIs, never directly by the storefront.
 */
export const ORDERS_STOCK_DECREMENT_AT = defineSetting({
  key: "orders.stockDecrementAt",
  group: "orders",
  type: z.enum(["packed", "shipped"]),
  default: "shipped",
  label: { bn: "স্টক থেকে বাস্তবে বিয়োগ করার সময়", en: "When stock is actually decremented" },
  help: {
    bn: "অর্ডার করার সময় স্টক রিজার্ভ হয়; এই সেটিং ঠিক করে কখন সেটা on-hand থেকে প্রকৃতপক্ষে বিয়োগ হবে",
    en: "Stock is reserved at order placement either way; this controls when it's actually removed from on-hand",
  },
  secret: false,
  public: false,
  permission: "settings.orders.write",
  ui: {
    widget: "select",
    options: [
      { value: "packed", label: { bn: "প্যাক করার সময়", en: "When packed" } },
      { value: "shipped", label: { bn: "শিপ করার সময়", en: "When shipped" } },
    ],
  },
});

export const ORDERS_PACKING_REQUIRES_SCAN = defineSetting({
  key: "orders.packingRequiresScan",
  group: "orders",
  type: z.boolean(),
  default: true,
  label: { bn: "প্যাকিংয়ে বারকোড স্ক্যান আবশ্যক", en: "Packing requires scanning each item" },
  secret: false,
  public: false,
  permission: "settings.orders.write",
  ui: { widget: "toggle" },
});

export const ORDERS_RELEASE_COUPON_USAGE_ON_CANCEL = defineSetting({
  key: "orders.releaseCouponUsageOnCancel",
  group: "orders",
  type: z.boolean(),
  default: true,
  label: { bn: "বাতিল হলে কুপন ব্যবহার মুক্ত করুন", en: "Release coupon usage on cancellation" },
  secret: false,
  public: false,
  permission: "settings.orders.write",
  ui: { widget: "toggle" },
});

export const FULFILLMENT_PICK_LIST_GROUP_BY = defineSetting({
  key: "fulfillment.pickListGroupBy",
  group: "fulfillment",
  type: z.enum(["product", "bin"]),
  default: "product",
  label: { bn: "পিক লিস্ট গ্রুপিং", en: "Pick list grouping" },
  secret: false,
  public: false,
  permission: "fulfillment.manage",
  ui: {
    widget: "select",
    options: [
      { value: "product", label: { bn: "পণ্য অনুযায়ী", en: "By product" } },
      { value: "bin", label: { bn: "বিন অনুযায়ী", en: "By bin location" } },
    ],
  },
});

export const COURIERS_POLL_INTERVAL_MINUTES = defineSetting({
  key: "couriers.pollIntervalMinutes",
  group: "couriers",
  type: z.number().int().min(5).max(24 * 60),
  default: 120,
  label: { bn: "কুরিয়ার স্ট্যাটাস পোল বিরতি (মিনিট)", en: "Courier status poll interval (minutes)" },
  help: { bn: "যেসব কুরিয়ারের webhook নেই বা মিস হয়েছে তাদের জন্য ফলব্যাক", en: "Fallback for couriers without webhooks, or when one is missed" },
  secret: false,
  public: false,
  permission: "settings.couriers.write",
  ui: { widget: "text" },
});

export const RETURNS_ENABLED_TYPES = defineSetting({
  key: "returns.enabledTypes",
  group: "returns",
  type: z.array(z.enum(["exchange", "refund", "store_credit"])),
  default: ["exchange", "refund", "store_credit"],
  label: { bn: "চালু রিটার্নের ধরন", en: "Enabled return types" },
  secret: false,
  public: true,
  permission: "settings.returns.write",
  ui: { widget: "json" },
});

export const RETURNS_WINDOW_DAYS = defineSetting({
  key: "returns.windowDays",
  group: "returns",
  type: z.number().int().min(0).max(90),
  default: 7,
  label: { bn: "রিটার্ন উইন্ডো (দিন)", en: "Return window (days)" },
  help: { bn: "ডেলিভারির পর কতদিন রিটার্ন/এক্সচেঞ্জ অনুরোধ করা যাবে; এই সময় পার হলে অর্ডার স্বয়ংক্রিয়ভাবে সম্পন্ন হয়ে যায়", en: "How many days after delivery a return/exchange can be requested; the order auto-completes once this passes" },
  secret: false,
  public: true,
  permission: "settings.returns.write",
  ui: { widget: "text" },
});

export const RETURNS_DOORSTEP_REJECTION_ALLOWED = defineSetting({
  key: "returns.doorstepRejectionAllowed",
  group: "returns",
  type: z.boolean(),
  default: true,
  label: { bn: "ডেলিভারির সময় গ্রাহক প্রত্যাখ্যান করতে পারবে", en: "Customer may reject the parcel at the door" },
  secret: false,
  public: true,
  permission: "settings.returns.write",
  ui: { widget: "toggle" },
});

export const RETURNS_DOORSTEP_CUSTOMER_PAYS = defineSetting({
  key: "returns.doorstepCustomerPays",
  group: "returns",
  type: z.enum(["delivery_fee_only", "delivery_fee_plus_return", "free"]),
  default: "delivery_fee_only",
  label: { bn: "ডোরস্টেপ প্রত্যাখ্যানে গ্রাহক কী পরিশোধ করবে", en: "What the customer pays on doorstep rejection" },
  secret: false,
  public: true,
  permission: "settings.returns.write",
  ui: {
    widget: "select",
    options: [
      { value: "delivery_fee_only", label: { bn: "শুধু ডেলিভারি চার্জ", en: "Delivery charge only" } },
      { value: "delivery_fee_plus_return", label: { bn: "ডেলিভারি + ফেরত চার্জ", en: "Delivery + return charge" } },
      { value: "free", label: { bn: "ফ্রি", en: "Free" } },
    ],
  },
});

export const RETURNS_DOORSTEP_REFUND_METHOD = defineSetting({
  key: "returns.doorstepRefundMethod",
  group: "returns",
  type: z.enum(["same_method", "manual_transfer", "store_credit"]),
  default: "manual_transfer",
  label: { bn: "ডোরস্টেপ প্রত্যাখ্যানে রিফান্ড পদ্ধতি", en: "Doorstep-rejection refund method" },
  help: { bn: "যদি আগাম/সম্পূর্ণ পেমেন্ট করা থাকে — পরিশোধিত বিয়োগ চার্জ কীভাবে ফেরত দেওয়া হবে", en: "If paid in advance/full — how the paid amount minus charges gets refunded" },
  secret: false,
  public: false,
  permission: "settings.returns.write",
  ui: {
    widget: "select",
    options: [
      { value: "same_method", label: { bn: "একই মোবাইল ব্যাংকিং পদ্ধতিতে", en: "Same mobile banking method" } },
      { value: "manual_transfer", label: { bn: "ফাইন্যান্স স্টাফ দ্বারা ম্যানুয়াল ট্রান্সফার", en: "Manual transfer by finance staff" } },
      { value: "store_credit", label: { bn: "স্টোর ক্রেডিট", en: "Store credit" } },
    ],
  },
});

/**
 * Milestone 7 (docs/PROJECT_SPEC.md §6.11, §16 M7): notification dispatch
 * behavior. Quiet hours and the per-channel SMS cost estimate are the two
 * settings §6.11 calls out by name; marketing opt-out itself is already
 * modeled on `Customer.marketingConsent{Sms,Email,Whatsapp}` (M5) but has no
 * *enforcement* point yet — every M7 event is transactional, not marketing,
 * so quiet hours/consent gating has nothing to apply to until M8's campaign
 * sends exist. Both settings are real and read by `NotificationDispatchService`
 * now, just not yet exercised by any marketing-flagged event — see
 * docs/DECISIONS.md.
 */
export const NOTIFICATIONS_QUIET_HOURS_ENABLED = defineSetting({
  key: "notifications.quietHoursEnabled",
  group: "notifications",
  type: z.boolean(),
  default: false,
  label: { bn: "নিরিবিলি সময় সক্রিয় করুন", en: "Enable quiet hours" },
  help: { bn: "শুধু মার্কেটিং বার্তার জন্য প্রযোজ্য, জরুরি অর্ডার বার্তার জন্য নয়", en: "Applies to marketing messages only, never transactional order messages" },
  secret: false,
  public: false,
  permission: "settings.notifications.write",
  ui: { widget: "toggle" },
});

export const NOTIFICATIONS_QUIET_HOURS_START = defineSetting({
  key: "notifications.quietHoursStart",
  group: "notifications",
  type: z.string().regex(/^\d{2}:\d{2}$/),
  default: "21:00",
  label: { bn: "নিরিবিলি সময় শুরু (HH:MM)", en: "Quiet hours start (HH:MM)" },
  secret: false,
  public: false,
  permission: "settings.notifications.write",
  ui: { widget: "text" },
});

export const NOTIFICATIONS_QUIET_HOURS_END = defineSetting({
  key: "notifications.quietHoursEnd",
  group: "notifications",
  type: z.string().regex(/^\d{2}:\d{2}$/),
  default: "09:00",
  label: { bn: "নিরিবিলি সময় শেষ (HH:MM)", en: "Quiet hours end (HH:MM)" },
  secret: false,
  public: false,
  permission: "settings.notifications.write",
  ui: { widget: "text" },
});

/**
 * Milestone 8 (docs/PROJECT_SPEC.md §10.5, §13.3, §16 M8): client pixel ids
 * (read by the storefront via `GET /store/config`, same as every other
 * `public: true` setting) and the one setting that governs the server-side
 * Purchase event's timing (§6.11: "server-side Purchase event, setting:
 * send Purchase on placement or on confirmation"). GTM needs only a
 * container id — `dataLayer` events already follow the GA4 e-commerce
 * shape via `lib/analytics.ts` (M4), so there's nothing else to configure
 * for it specifically.
 */
export const TRACKING_GTM_CONTAINER_ID = defineSetting({
  key: "tracking.gtmContainerId",
  group: "tracking",
  type: z.string().nullable(),
  default: null,
  label: { bn: "GTM কন্টেইনার আইডি", en: "GTM container ID" },
  help: { bn: "যেমন GTM-XXXXXXX — খালি রাখলে GTM লোড হবে না", en: "e.g. GTM-XXXXXXX — leave empty to not load GTM" },
  secret: false,
  public: true,
  permission: "settings.tracking.write",
  ui: { widget: "text" },
});

export const TRACKING_META_PIXEL_ID = defineSetting({
  key: "tracking.metaPixelId",
  group: "tracking",
  type: z.string().nullable(),
  default: null,
  label: { bn: "Meta পিক্সেল আইডি", en: "Meta Pixel ID" },
  secret: false,
  public: true,
  permission: "settings.tracking.write",
  ui: { widget: "text" },
});

export const TRACKING_GA_MEASUREMENT_ID = defineSetting({
  key: "tracking.gaMeasurementId",
  group: "tracking",
  type: z.string().nullable(),
  default: null,
  label: { bn: "GA4 মেজারমেন্ট আইডি", en: "GA4 Measurement ID" },
  help: { bn: "যেমন G-XXXXXXXXXX", en: "e.g. G-XXXXXXXXXX" },
  secret: false,
  public: true,
  permission: "settings.tracking.write",
  ui: { widget: "text" },
});

export const TRACKING_TIKTOK_PIXEL_ID = defineSetting({
  key: "tracking.tiktokPixelId",
  group: "tracking",
  type: z.string().nullable(),
  default: null,
  label: { bn: "TikTok পিক্সেল আইডি", en: "TikTok Pixel ID" },
  secret: false,
  public: true,
  permission: "settings.tracking.write",
  ui: { widget: "text" },
});

export const TRACKING_PURCHASE_EVENT_TIMING = defineSetting({
  key: "tracking.purchaseEventTiming",
  group: "tracking",
  type: z.enum(["placement", "confirmation"]),
  default: "placement",
  label: { bn: "Purchase ইভেন্ট কখন পাঠানো হবে", en: "When to send the server-side Purchase event" },
  secret: false,
  public: false,
  permission: "settings.tracking.write",
  ui: {
    widget: "select",
    options: [
      { value: "placement", label: { bn: "অর্ডার প্লেসমেন্টে", en: "On order placement" } },
      { value: "confirmation", label: { bn: "অর্ডার কনফার্মেশনে", en: "On order confirmation" } },
    ],
  },
});

export const TRACKING_TEST_EVENT_CODE = defineSetting({
  key: "tracking.metaTestEventCode",
  group: "tracking",
  type: z.string().nullable(),
  default: null,
  label: { bn: "Meta টেস্ট ইভেন্ট কোড", en: "Meta test event code" },
  help: { bn: "Meta Events Manager-এ লাইভ টেস্ট করার সময় ব্যবহার করুন; খালি রাখলে পাঠানো হবে না", en: "Use while live-testing in Meta Events Manager; omitted from the payload when empty" },
  secret: false,
  public: false,
  permission: "settings.tracking.write",
  ui: { widget: "text" },
});

/** §5.5/§8.2 reviews — verified-purchase-gated submissions still default to staff moderation before going live; auto-approve is an opt-in speed/trust trade-off. */
export const REVIEWS_AUTO_APPROVE = defineSetting({
  key: "reviews.autoApprove",
  group: "reviews",
  type: z.boolean(),
  default: false,
  label: { bn: "রিভিউ অটো-অ্যাপ্রুভ করুন", en: "Auto-approve reviews" },
  help: { bn: "বন্ধ থাকলে প্রতিটি রিভিউ স্টাফ অনুমোদনের অপেক্ষায় থাকবে", en: "When off, every review waits for staff approval" },
  secret: false,
  public: false,
  permission: "settings.reviews.write",
  ui: { widget: "toggle" },
});

/** Product feeds (§10.5) — on-demand Meta catalog / Google Merchant XML, gated by a secret token in the feed URL rather than auth (platforms fetch feed URLs unauthenticated). */
export const FEEDS_ENABLED = defineSetting({
  key: "feeds.enabled",
  group: "feeds",
  type: z.boolean(),
  default: false,
  label: { bn: "প্রোডাক্ট ফিড সক্রিয় করুন", en: "Enable product feeds" },
  secret: false,
  public: false,
  permission: "settings.feeds.write",
  ui: { widget: "toggle" },
});

export const FEEDS_SECRET_TOKEN = defineSetting({
  key: "feeds.secretToken",
  group: "feeds",
  type: z.string().nullable(),
  default: null,
  label: { bn: "ফিড সিক্রেট টোকেন", en: "Feed secret token" },
  help: { bn: "ফিড URL-এ ব্যবহৃত হয় — খালি থাকলে ফিড কাজ করবে না", en: "Used in the feed URL — feeds refuse to serve while this is empty" },
  // Deliberately not `secret: true` despite the name: staff need to *see*
  // this value (not just set it once) to paste it into Meta/Google's own
  // feed-URL field — the usual "write-only credential" masking this
  // project's other secrets get (e.g. `auth.googleClientSecret`) would
  // defeat the one thing this value is for. `public: false` still keeps it
  // out of the storefront's own `GET /store/config` payload.
  secret: false,
  public: false,
  permission: "settings.feeds.write",
  ui: { widget: "text" },
});

export const SMS_COST_PER_SEGMENT_POISHA = defineSetting({
  key: "notifications.smsCostPerSegmentPoisha",
  group: "notifications",
  type: z.number().int().min(0),
  default: 50,
  label: { bn: "প্রতি SMS সেগমেন্টের আনুমানিক খরচ (৳)", en: "Estimated cost per SMS segment (৳)" },
  help: { bn: "টেমপ্লেট এডিটরে আনুমানিক খরচ দেখানোর জন্য ব্যবহৃত হয়; আসল বিলিং গেটওয়ে অনুযায়ী ভিন্ন হতে পারে", en: "Used only to estimate cost in the template editor — actual billing varies by gateway" },
  secret: false,
  public: false,
  permission: "settings.notifications.write",
  ui: { widget: "money" },
});

// Milestone 9 (§16 M9) — launch checklist / operations.

/** Written by `/public/cron/backup-heartbeat` (§15.4) after a successful `pg_dump`+upload — never set from the admin UI directly. ISO datetime string, null until the first backup ever reports in. */
export const OPS_LAST_BACKUP_AT = defineSetting({
  key: "ops.lastBackupAt",
  group: "ops",
  type: z.string().nullable(),
  default: null,
  label: { bn: "সর্বশেষ ব্যাকআপ", en: "Last backup" },
  secret: false,
  public: false,
  permission: "settings.ops.write",
  ui: { widget: "text" },
});

/** The one launch-checklist item with no system signal to check (§15/§13.2 "sitemap submitted" to Search Console) — the owner just marks it done. */
export const OPS_SITEMAP_SUBMITTED = defineSetting({
  key: "ops.sitemapSubmitted",
  group: "ops",
  type: z.boolean(),
  default: false,
  label: { bn: "সাইটম্যাপ জমা দেওয়া হয়েছে", en: "Sitemap submitted to search engines" },
  secret: false,
  public: false,
  permission: "settings.ops.write",
  ui: { widget: "toggle" },
});

/**
 * Milestone 10 (docs/PROJECT_SPEC.md §16 M10) — conversion features:
 * abandoned-cart recovery, the size recommender, the storefront PWA + web
 * push, and the blog/lookbook post list.
 */
export const MARKETING_ABANDONED_CART_ENABLED = defineSetting({
  key: "marketing.abandonedCart.enabled",
  group: "marketing",
  type: z.boolean(),
  default: false,
  label: { bn: "পরিত্যক্ত কার্ট পুনরুদ্ধার সক্রিয় করুন", en: "Enable abandoned-cart recovery" },
  help: { bn: "যোগাযোগের তথ্যসহ নিষ্ক্রিয় কার্টে স্বয়ংক্রিয়ভাবে SMS/WhatsApp/ইমেইল পাঠানো হবে", en: "Automatically sends SMS/WhatsApp/email to idle carts that have contact info" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "toggle" },
});

/** Minutes of inactivity before a cart is marked abandoned (step 0, not itself a message) — step 1/2/3 then fire this many additional minutes apart per `stepDelaysMinutes`. */
export const MARKETING_ABANDONED_CART_IDLE_MINUTES = defineSetting({
  key: "marketing.abandonedCart.idleMinutes",
  group: "marketing",
  type: z.number().int().min(10).max(1440),
  default: 60,
  label: { bn: "কত মিনিট নিষ্ক্রিয় থাকলে কার্ট পরিত্যক্ত ধরা হবে", en: "Minutes idle before a cart counts as abandoned" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "text" },
});

/** Ordered minutes-after-abandonment for each of the 3 sequence steps (§16 M10 "SMS/WhatsApp/email sequence"). */
export const MARKETING_ABANDONED_CART_STEP_DELAYS_MINUTES = defineSetting({
  key: "marketing.abandonedCart.stepDelaysMinutes",
  group: "marketing",
  type: z.array(z.number().int().min(1)).length(3),
  default: [60, 1440, 4320],
  label: { bn: "প্রতিটি রিমাইন্ডার কতক্ষণ পর পাঠানো হবে (মিনিট)", en: "Minutes after abandonment for each reminder" },
  help: { bn: "যেমন: [৬০, ১৪৪০, ৪৩২০] = ১ ঘণ্টা, ১ দিন, ৩ দিন পর", en: "e.g. [60, 1440, 4320] = 1 hour, 1 day, 3 days after" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "json" },
});

/** Which step (1-3) attaches a single-use discount code; 0 disables the coupon entirely. */
export const MARKETING_ABANDONED_CART_COUPON_STEP = defineSetting({
  key: "marketing.abandonedCart.couponStep",
  group: "marketing",
  type: z.number().int().min(0).max(3),
  default: 3,
  label: { bn: "কোন রিমাইন্ডারে কুপন যুক্ত হবে (০ = কখনো না)", en: "Which reminder attaches a coupon (0 = never)" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "text" },
});

export const MARKETING_ABANDONED_CART_COUPON_PERCENT_OFF = defineSetting({
  key: "marketing.abandonedCart.couponPercentOff",
  group: "marketing",
  type: z.number().int().min(1).max(90),
  default: 10,
  label: { bn: "কুপন ছাড়ের শতাংশ", en: "Coupon discount percent" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "text" },
});

export const MARKETING_ABANDONED_CART_COUPON_VALID_HOURS = defineSetting({
  key: "marketing.abandonedCart.couponValidHours",
  group: "marketing",
  type: z.number().int().min(1).max(720),
  default: 72,
  label: { bn: "কুপনের মেয়াদ (ঘণ্টা)", en: "Coupon validity (hours)" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "text" },
});

export const SIZE_RECOMMENDER_ENABLED = defineSetting({
  key: "sizeRecommender.enabled",
  group: "sizeRecommender",
  type: z.boolean(),
  default: true,
  label: { bn: "সাইজ সুপারিশকারী সক্রিয় করুন", en: "Enable the size recommender" },
  help: { bn: "যেসব প্রোডাক্টে সাইজ চার্ট আছে সেখানে পিডিপিতে \"আমার সাইজ খুঁজুন\" দেখাবে", en: "Shows \"Find my size\" on the PDP for products that have a size chart" },
  secret: false,
  public: true,
  permission: "settings.marketing.write",
  ui: { widget: "toggle" },
});

export const PWA_ENABLED = defineSetting({
  key: "pwa.enabled",
  group: "pwa",
  type: z.boolean(),
  default: true,
  label: { bn: "PWA সক্রিয় করুন", en: "Enable the storefront PWA" },
  secret: false,
  public: true,
  permission: "settings.pwa.write",
  ui: { widget: "toggle" },
});

export const PWA_SHORT_NAME = defineSetting({
  key: "pwa.shortName",
  group: "pwa",
  type: localizedTextSchema,
  default: { bn: "দোকান", en: "Shop" },
  label: { bn: "PWA সংক্ষিপ্ত নাম", en: "PWA short name" },
  help: { bn: "হোম স্ক্রিনে আইকনের নিচে যে নাম দেখা যাবে", en: "Shown under the icon once installed to a home screen" },
  secret: false,
  public: true,
  permission: "settings.pwa.write",
  ui: { widget: "localizedText" },
});

export const PWA_PUSH_ENABLED = defineSetting({
  key: "pwa.pushEnabled",
  group: "pwa",
  type: z.boolean(),
  default: false,
  label: { bn: "ওয়েব পুশ নোটিফিকেশন সক্রিয় করুন", en: "Enable web push notifications" },
  help: { bn: "VAPID কী জেনারেট না করা পর্যন্ত এটি চালু করলেও কার্যকর হবে না", en: "Has no effect until a VAPID keypair is generated below" },
  secret: false,
  public: true,
  permission: "settings.pwa.write",
  ui: { widget: "toggle" },
});

/** Safe to expose to the client — this is the whole point of the public half of a VAPID keypair (passed to `pushManager.subscribe`). Generated via `POST /admin/push/generate-vapid-keys`, never typed by hand. */
export const PWA_VAPID_PUBLIC_KEY = defineSetting({
  key: "pwa.vapidPublicKey",
  group: "pwa",
  type: z.string().nullable(),
  default: null,
  label: { bn: "VAPID পাবলিক কী", en: "VAPID public key" },
  secret: false,
  public: true,
  permission: "settings.pwa.write",
  ui: { widget: "text" },
});

export const PWA_VAPID_PRIVATE_KEY = defineSetting({
  key: "pwa.vapidPrivateKey",
  group: "pwa",
  type: z.string().nullable(),
  default: null,
  label: { bn: "VAPID প্রাইভেট কী", en: "VAPID private key" },
  secret: true,
  public: false,
  permission: "settings.pwa.write",
  ui: { widget: "text" },
});

export const BLOG_POSTS_PER_PAGE = defineSetting({
  key: "blog.postsPerPage",
  group: "blog",
  type: z.number().int().min(1).max(50),
  default: 9,
  label: { bn: "প্রতি পেজে ব্লগ পোস্ট সংখ্যা", en: "Blog posts per page" },
  secret: false,
  public: true,
  permission: "settings.marketing.write",
  ui: { widget: "text" },
});

// ---------------------------------------------------------------------------
// Milestone 11 (§16 M11) — order operations automation.
// ---------------------------------------------------------------------------

export const ORDERS_SELF_CONFIRM_ENABLED = defineSetting({
  key: "orders.selfConfirm.enabled",
  group: "orders",
  type: z.boolean(),
  default: false,
  label: { bn: "গ্রাহক নিজে অর্ডার কনফার্ম করতে পারবেন", en: "Customer self-confirmation" },
  help: { bn: "অর্ডার প্লেসের পর এসএমএস/হোয়াটসঅ্যাপে একটি কনফার্ম লিংক পাঠানো হয়", en: "Sends a confirm link by SMS/WhatsApp when an order is placed" },
  secret: false,
  public: false,
  permission: "settings.orders.write",
  ui: { widget: "toggle" },
});

export const ORDERS_SELF_CONFIRM_ALLOW_CANCEL = defineSetting({
  key: "orders.selfConfirm.allowCancel",
  group: "orders",
  type: z.boolean(),
  default: true,
  label: { bn: "কনফার্ম পেজ থেকে বাতিল করার অনুমতি", en: "Allow cancelling from the confirm page" },
  secret: false,
  public: false,
  permission: "settings.orders.write",
  ui: { widget: "toggle" },
});

export const ORDERS_SELF_CONFIRM_EXPIRY_HOURS = defineSetting({
  key: "orders.selfConfirm.expiryHours",
  group: "orders",
  type: z.number().int().min(1).max(720),
  default: 48,
  label: { bn: "কনফার্ম লিংকের মেয়াদ (ঘণ্টা)", en: "Confirm link validity (hours)" },
  secret: false,
  public: false,
  permission: "settings.orders.write",
  ui: { widget: "text" },
});

export const ORDERS_QUEUE_AUTO_ASSIGN = defineSetting({
  key: "orders.queue.autoAssign",
  group: "orders",
  type: z.boolean(),
  default: false,
  label: { bn: "নতুন অর্ডার স্বয়ংক্রিয়ভাবে কল এক্সিকিউটিভকে অ্যাসাইন করুন", en: "Auto-assign new orders to call executives" },
  secret: false,
  public: false,
  permission: "settings.orders.write",
  ui: { widget: "toggle" },
});

export const ORDERS_QUEUE_STRATEGY = defineSetting({
  key: "orders.queue.strategy",
  group: "orders",
  type: z.enum(["round_robin", "load_based"]),
  default: "round_robin",
  label: { bn: "অ্যাসাইনমেন্ট পদ্ধতি", en: "Assignment strategy" },
  secret: false,
  public: false,
  permission: "settings.orders.write",
  ui: {
    widget: "select",
    options: [
      { value: "round_robin", label: { bn: "রাউন্ড-রবিন", en: "Round-robin" } },
      { value: "load_based", label: { bn: "কম লোড আগে", en: "Least open orders first" } },
    ],
  },
});

export const SECURITY_FIELD_MASKING_ENABLED = defineSetting({
  key: "security.fieldMasking.enabled",
  group: "security",
  type: z.boolean(),
  default: false,
  label: { bn: "ফিল্ড-লেভেল অনুমতি কার্যকর করুন", en: "Enforce field-level permissions" },
  help: { bn: "চালু করলে যাদের অনুমতি নেই তাদের কাছে ফোন নম্বর মাস্ক ও ক্রয়মূল্য লুকানো থাকবে", en: "When on, phone numbers are masked and cost prices hidden for staff without the matching field permission" },
  secret: false,
  public: false,
  permission: "settings.security.write",
  ui: { widget: "toggle" },
});

export const APPROVALS_PRICE_OVERRIDE_REQUIRED = defineSetting({
  key: "approvals.priceOverride.required",
  group: "approvals",
  type: z.boolean(),
  default: false,
  label: { bn: "অর্ডারে দাম/শিপিং ওভাররাইডে অনুমোদন লাগবে", en: "Require approval for order price / shipping overrides" },
  secret: false,
  public: false,
  permission: "settings.approvals.write",
  ui: { widget: "toggle" },
});

export const APPROVALS_REFUND_THRESHOLD = defineSetting({
  key: "approvals.refund.thresholdAmount",
  group: "approvals",
  type: z.number().int().min(0),
  default: 0,
  label: { bn: "এই পরিমাণের বেশি রিফান্ডে অনুমোদন লাগবে (পয়সা, ০ = বন্ধ)", en: "Refunds above this amount need approval (poisha, 0 = off)" },
  secret: false,
  public: false,
  permission: "settings.approvals.write",
  ui: { widget: "money" },
});

export const PWA_ADMIN_PUSH_ENABLED = defineSetting({
  key: "pwa.adminPushEnabled",
  group: "pwa",
  type: z.boolean(),
  default: true,
  label: { bn: "অ্যাডমিন স্টাফকে পুশ নোটিফিকেশন", en: "Push notifications to admin staff" },
  secret: false,
  public: false,
  permission: "settings.pwa.write",
  ui: { widget: "toggle" },
});

// ---------------------------------------------------------------------------
// Milestone 12 (§16 M12) — inventory and finance.
// ---------------------------------------------------------------------------

export const INVENTORY_DEAD_STOCK_DAYS = defineSetting({
  key: "inventory.deadStockDays",
  group: "inventory",
  type: z.number().int().min(7).max(730),
  default: 90,
  label: { bn: "ডেড স্টক: এত দিন বিক্রি না হলে", en: "Dead stock: no sale for this many days" },
  secret: false,
  public: false,
  permission: "settings.inventory.write",
  ui: { widget: "text" },
});

export const markdownTierSchema = z.object({ minDays: z.number().int().min(1), percentOff: z.number().min(1).max(90) });
export type MarkdownTier = z.infer<typeof markdownTierSchema>;

export const INVENTORY_MARKDOWN_TIERS = defineSetting({
  key: "inventory.markdownTiers",
  group: "inventory",
  type: z.array(markdownTierSchema).max(10),
  default: [
    { minDays: 60, percentOff: 10 },
    { minDays: 90, percentOff: 20 },
    { minDays: 180, percentOff: 30 },
  ],
  label: { bn: "মার্কডাউন ধাপ (দিন → % ছাড়)", en: "Markdown tiers (days unsold → % off)" },
  help: {
    bn: "সাজেশন কখনো ক্রয়মূল্য + ন্যূনতম মার্জিনের নিচে যাবে না (মূল্য নির্ধারণ সেটিংস)",
    en: "Suggestions never go below cost + the minimum margin from the pricing settings",
  },
  secret: false,
  public: false,
  permission: "settings.inventory.write",
  ui: { widget: "json" },
});

export const INVENTORY_SIZE_CURVE_LOOKBACK_DAYS = defineSetting({
  key: "inventory.sizeCurveLookbackDays",
  group: "inventory",
  type: z.number().int().min(7).max(730),
  default: 90,
  label: { bn: "সাইজ-কার্ভ বিশ্লেষণের সময়কাল (দিন)", en: "Size-curve analysis window (days)" },
  secret: false,
  public: false,
  permission: "settings.inventory.write",
  ui: { widget: "text" },
});

export const PROCUREMENT_COST_METHOD = defineSetting({
  key: "procurement.costMethod",
  group: "inventory",
  type: z.enum(["weighted_average", "last_cost", "none"]),
  default: "weighted_average",
  label: { bn: "মাল গ্রহণের পর ক্রয়মূল্য আপডেট", en: "Update cost price on receiving" },
  secret: false,
  public: false,
  permission: "settings.inventory.write",
  ui: {
    widget: "select",
    options: [
      { value: "weighted_average", label: { bn: "ওজনযুক্ত গড়", en: "Weighted average" } },
      { value: "last_cost", label: { bn: "সর্বশেষ ক্রয়মূল্য", en: "Last purchase cost" } },
      { value: "none", label: { bn: "আপডেট করবেন না", en: "Don't update" } },
    ],
  },
});

export const FINANCE_COD_VARIANCE_TOLERANCE = defineSetting({
  key: "finance.codVarianceTolerance",
  group: "finance",
  type: z.number().int().min(0),
  default: 100,
  label: { bn: "COD পার্থক্যের সহনসীমা (৳)", en: "COD variance tolerance (৳)" },
  help: { bn: "এর চেয়ে বেশি পার্থক্য হলে লাইনটি চিহ্নিত হবে", en: "Lines differing by more than this are flagged" },
  secret: false,
  public: false,
  permission: "settings.finance.write",
  ui: { widget: "money" },
});

export const FINANCE_GATEWAY_FEE_BPS = defineSetting({
  key: "finance.gatewayFeeBps",
  group: "finance",
  type: z.record(z.string(), z.number().int().min(0).max(10_000)),
  default: { sslcommerz: 250, bkash: 185, nagad: 150, mock: 0 },
  label: { bn: "আনুমানিক গেটওয়ে ফি (বেসিস পয়েন্ট, ১০০ = ১%)", en: "Estimated gateway fee (basis points, 100 = 1%)" },
  help: {
    bn: "প্রকৃত মুনাফা রিপোর্টে ব্যবহৃত হয় যতক্ষণ না সেই সময়ের গেটওয়ে সেটেলমেন্ট এন্ট্রি করা হয়",
    en: "Used by the true profit report until a gateway settlement for that period is recorded",
  },
  secret: false,
  public: false,
  permission: "settings.finance.write",
  ui: { widget: "json" },
});

export const REPORTS_SCHEDULED_ENABLED = defineSetting({
  key: "reports.scheduled.enabled",
  group: "reports",
  type: z.boolean(),
  default: true,
  label: { bn: "নির্ধারিত ইমেইল রিপোর্ট পাঠান", en: "Send scheduled email reports" },
  secret: false,
  public: false,
  permission: "settings.reports.write",
  ui: { widget: "toggle" },
});

export const REPORTS_SCHEDULED_SEND_HOUR = defineSetting({
  key: "reports.scheduled.sendHour",
  group: "reports",
  type: z.number().int().min(0).max(23),
  default: 8,
  label: { bn: "রিপোর্ট পাঠানোর সময় (ঘণ্টা, ঢাকা সময়)", en: "Send hour (Dhaka time, 0–23)" },
  secret: false,
  public: false,
  permission: "settings.reports.write",
  ui: { widget: "text" },
});

export const ALERTS_ANOMALY_ENABLED = defineSetting({
  key: "alerts.anomaly.enabled",
  group: "reports",
  type: z.boolean(),
  default: true,
  label: { bn: "অস্বাভাবিকতা শনাক্ত করে অ্যালার্ট দিন", en: "Anomaly alerts" },
  help: {
    bn: "গতকালের অর্ডার, আয়, বাতিল ও রিজেকশন হার আগের দিনগুলোর গড়ের সাথে তুলনা করা হয়",
    en: "Compares yesterday's orders, revenue, cancellation and rejection rates with the trailing average",
  },
  secret: false,
  public: false,
  permission: "settings.reports.write",
  ui: { widget: "toggle" },
});

export const ALERTS_ANOMALY_THRESHOLD_PERCENT = defineSetting({
  key: "alerts.anomaly.thresholdPercent",
  group: "reports",
  type: z.number().min(5).max(500),
  default: 50,
  label: { bn: "গড় থেকে কত % বিচ্যুতি হলে অ্যালার্ট", en: "Alert when this % away from the baseline" },
  secret: false,
  public: false,
  permission: "settings.reports.write",
  ui: { widget: "text" },
});

export const ALERTS_ANOMALY_BASELINE_DAYS = defineSetting({
  key: "alerts.anomaly.baselineDays",
  group: "reports",
  type: z.number().int().min(3).max(90),
  default: 14,
  label: { bn: "তুলনার জন্য আগের দিনের সংখ্যা", en: "Baseline window (days)" },
  secret: false,
  public: false,
  permission: "settings.reports.write",
  ui: { widget: "text" },
});

export const ALERTS_ANOMALY_MIN_BASELINE_ORDERS = defineSetting({
  key: "alerts.anomaly.minBaselineOrders",
  group: "reports",
  type: z.number().int().min(1),
  default: 5,
  label: { bn: "ন্যূনতম গড় দৈনিক অর্ডার (এর কম হলে অ্যালার্ট নয়)", en: "Minimum average daily orders before alerting" },
  help: { bn: "নতুন বা ছোট দোকানে অকারণ অ্যালার্ট এড়াতে", en: "Avoids noisy alerts for new or very small stores" },
  secret: false,
  public: false,
  permission: "settings.reports.write",
  ui: { widget: "text" },
});
