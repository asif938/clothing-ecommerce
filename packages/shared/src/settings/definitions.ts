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
  default: 10,
  label: { bn: "পাসওয়ার্ডের সর্বনিম্ন দৈর্ঘ্য", en: "Minimum password length" },
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
  label: { bn: "ফ্রি ডেলিভারি থ্রেশহোল্ড (পয়সা)", en: "Free delivery threshold (poisha)" },
  help: { bn: "খালি রাখলে বন্ধ থাকবে", en: "Leave empty to disable" },
  secret: false,
  public: false,
  permission: "settings.shipping.write",
  ui: { widget: "text" },
});

export const SHIPPING_FALLBACK_FEE = defineSetting({
  key: "shipping.fallbackFee",
  group: "shipping",
  type: z.number().int().min(0).nullable(),
  default: null,
  label: { bn: "কোনো জোন না মিললে ফি (পয়সা)", en: "Fee when no zone matches (poisha)" },
  help: { bn: "খালি রাখলে কোনো জোন না মিললে চেকআউট ব্লক হবে", en: "Leave empty to block checkout when no zone matches" },
  secret: false,
  public: false,
  permission: "settings.shipping.write",
  ui: { widget: "text" },
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
  label: { bn: "উচ্চ-মূল্যের থ্রেশহোল্ড (পয়সা)", en: "High-value threshold (poisha)" },
  secret: false,
  public: false,
  permission: "settings.risk.write",
  ui: { widget: "text" },
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
  label: { bn: "গিফট র‍্যাপ ফি (পয়সা)", en: "Gift wrap fee (poisha)" },
  secret: false,
  public: false,
  permission: "settings.checkout.write",
  ui: { widget: "text" },
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
