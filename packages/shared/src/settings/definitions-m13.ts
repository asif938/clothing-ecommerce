import { z } from "zod";
import { defineSetting } from "./registry.ts";

/**
 * Milestone 13 (§16 M13) settings — CRM, marketing automation and AI
 * content. Kept in their own module so `definitions.ts` doesn't keep
 * growing; registered from `./index.ts` exactly like the original file.
 * Loyalty defaults follow spec §17 ("Loyalty (when enabled)").
 */

export const LOYALTY_ENABLED = defineSetting({
  key: "loyalty.enabled",
  group: "loyalty",
  type: z.boolean(),
  default: false,
  label: { bn: "লয়্যালটি প্রোগ্রাম চালু", en: "Loyalty program enabled" },
  help: { bn: "ডেলিভারি হওয়া অর্ডারে পয়েন্ট, চেকআউটে পয়েন্ট ব্যবহার", en: "Points on delivered orders, redeemable at checkout" },
  secret: false,
  public: true,
  permission: "settings.loyalty.write",
  ui: { widget: "toggle" },
});

export const LOYALTY_SPEND_PER_POINT = defineSetting({
  key: "loyalty.spendPerPoint",
  group: "loyalty",
  type: z.number().int().min(100),
  default: 10_000,
  label: { bn: "প্রতি ১ পয়েন্টের জন্য খরচ (পয়সা)", en: "Spend per 1 point earned (poisha)" },
  help: { bn: "ডিফল্ট ৳১০০ = ১ পয়েন্ট; টিয়ারের গুণক এর ওপর প্রযোজ্য", en: "Default ৳100 = 1 point; tier multipliers apply on top" },
  secret: false,
  public: true,
  permission: "settings.loyalty.write",
  ui: { widget: "money" },
});

export const LOYALTY_POINT_VALUE = defineSetting({
  key: "loyalty.pointValue",
  group: "loyalty",
  type: z.number().int().min(1),
  default: 100,
  label: { bn: "১ পয়েন্টের মূল্য (পয়সা)", en: "Value of 1 point (poisha)" },
  secret: false,
  public: true,
  permission: "settings.loyalty.write",
  ui: { widget: "money" },
});

export const LOYALTY_MIN_REDEEM_POINTS = defineSetting({
  key: "loyalty.minRedeemPoints",
  group: "loyalty",
  type: z.number().int().min(1),
  default: 50,
  label: { bn: "ব্যবহারের জন্য ন্যূনতম পয়েন্ট", en: "Minimum points per redemption" },
  secret: false,
  public: true,
  permission: "settings.loyalty.write",
  ui: { widget: "text" },
});

export const LOYALTY_MAX_REDEEM_PERCENT = defineSetting({
  key: "loyalty.maxRedeemPercent",
  group: "loyalty",
  type: z.number().int().min(1).max(100),
  default: 20,
  label: { bn: "পণ্যের মূল্যের সর্বোচ্চ কত % পয়েন্টে দেওয়া যাবে", en: "Max % of the goods total payable with points" },
  secret: false,
  public: true,
  permission: "settings.loyalty.write",
  ui: { widget: "text" },
});

export const LOYALTY_PENDING_DAYS = defineSetting({
  key: "loyalty.pendingDays",
  group: "loyalty",
  type: z.number().int().min(0).max(90),
  default: 7,
  label: { bn: "ডেলিভারির পর পয়েন্ট ব্যবহারযোগ্য হতে কত দিন", en: "Days after delivery before points become usable" },
  help: { bn: "সাধারণত রিটার্ন উইন্ডোর সমান রাখুন", en: "Usually the same as the return window" },
  secret: false,
  public: false,
  permission: "settings.loyalty.write",
  ui: { widget: "text" },
});

export const LOYALTY_EXPIRY_MONTHS = defineSetting({
  key: "loyalty.expiryMonths",
  group: "loyalty",
  type: z.number().int().min(0).max(120),
  default: 12,
  label: { bn: "পয়েন্টের মেয়াদ (মাস, ০ = কখনো না)", en: "Points expire after (months, 0 = never)" },
  secret: false,
  public: true,
  permission: "settings.loyalty.write",
  ui: { widget: "text" },
});

export const LOYALTY_BONUS_REVIEW_PHOTO = defineSetting({
  key: "loyalty.bonus.reviewPhoto",
  group: "loyalty",
  type: z.number().int().min(0),
  default: 20,
  label: { bn: "ছবিসহ রিভিউয়ের বোনাস পয়েন্ট", en: "Bonus points for an approved photo review" },
  secret: false,
  public: true,
  permission: "settings.loyalty.write",
  ui: { widget: "text" },
});

export const LOYALTY_BONUS_BIRTHDAY = defineSetting({
  key: "loyalty.bonus.birthday",
  group: "loyalty",
  type: z.number().int().min(0),
  default: 50,
  label: { bn: "জন্মদিনের বোনাস পয়েন্ট", en: "Birthday bonus points" },
  secret: false,
  public: true,
  permission: "settings.loyalty.write",
  ui: { widget: "text" },
});

export const CRM_RFM_ENABLED = defineSetting({
  key: "crm.rfm.enabled",
  group: "crm",
  type: z.boolean(),
  default: true,
  label: { bn: "প্রতিদিন RFM স্কোর হিসাব করুন", en: "Compute RFM scores nightly" },
  secret: false,
  public: false,
  permission: "settings.crm.write",
  ui: { widget: "toggle" },
});

export const CRM_RFM_WINDOW_DAYS = defineSetting({
  key: "crm.rfm.windowDays",
  group: "crm",
  type: z.number().int().min(30).max(1095),
  default: 365,
  label: { bn: "RFM-এর জন্য কত দিনের অর্ডার বিবেচনা করা হবে", en: "RFM order history window (days)" },
  secret: false,
  public: false,
  permission: "settings.crm.write",
  ui: { widget: "text" },
});

export const MARKETING_JOURNEYS_ENABLED = defineSetting({
  key: "marketing.journeys.enabled",
  group: "marketing",
  type: z.boolean(),
  default: false,
  label: { bn: "অটোমেটেড জার্নি চালু", en: "Automated journeys enabled" },
  help: { bn: "স্বাগতম, রিভিউ অনুরোধ, উইন-ব্যাক, জন্মদিন বার্তা", en: "Welcome, review request, win-back and birthday messages" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "toggle" },
});

export const MARKETING_BROADCASTS_ENABLED = defineSetting({
  key: "marketing.broadcasts.enabled",
  group: "marketing",
  type: z.boolean(),
  default: true,
  label: { bn: "ব্রডকাস্ট চালু", en: "Broadcasts enabled" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "toggle" },
});

export const MARKETING_BROADCASTS_BATCH_SIZE = defineSetting({
  key: "marketing.broadcasts.batchSize",
  group: "marketing",
  type: z.number().int().min(10).max(5000),
  default: 200,
  label: { bn: "প্রতি ধাপে কতজনকে ব্রডকাস্ট কিউ করা হবে", en: "Broadcast recipients queued per tick" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "text" },
});

export const MARKETING_COST_SMS_PER_SEGMENT = defineSetting({
  key: "marketing.costs.smsPerSegment",
  group: "marketing",
  type: z.number().int().min(0),
  default: 35,
  label: { bn: "প্রতি SMS সেগমেন্টের খরচ (পয়সা)", en: "Cost per SMS segment (poisha)" },
  help: { bn: "ব্রডকাস্টের খরচ অনুমানে ব্যবহৃত হয়", en: "Used for broadcast cost estimates" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "money" },
});

export const MARKETING_COST_WHATSAPP_PER_MESSAGE = defineSetting({
  key: "marketing.costs.whatsappPerMessage",
  group: "marketing",
  type: z.number().int().min(0),
  default: 120,
  label: { bn: "প্রতি WhatsApp মার্কেটিং বার্তার খরচ (পয়সা)", en: "Cost per WhatsApp marketing message (poisha)" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "money" },
});

export const MARKETING_COST_EMAIL_PER_MESSAGE = defineSetting({
  key: "marketing.costs.emailPerMessage",
  group: "marketing",
  type: z.number().int().min(0),
  default: 0,
  label: { bn: "প্রতি ইমেইলের খরচ (পয়সা)", en: "Cost per email (poisha)" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "money" },
});

export const MARKETING_AUDIENCE_SYNC_ENABLED = defineSetting({
  key: "marketing.audienceSync.enabled",
  group: "marketing",
  type: z.boolean(),
  default: false,
  label: { bn: "Meta/Google-এ অডিয়েন্স সিঙ্ক চালু", en: "Audience sync to Meta/Google enabled" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "toggle" },
});

export const MARKETING_AUDIENCE_SYNC_REQUIRE_CONSENT = defineSetting({
  key: "marketing.audienceSync.requireConsent",
  group: "marketing",
  type: z.boolean(),
  default: true,
  label: { bn: "শুধু মার্কেটিং সম্মতি দেওয়া গ্রাহকদের সিঙ্ক করুন", en: "Only sync customers with marketing consent" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "toggle" },
});

export const AD_PLATFORMS = ["meta", "google", "tiktok", "other"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];
export const adSpendSourceMapSchema = z.record(z.enum(AD_PLATFORMS), z.array(z.string().min(1)));
export type AdSpendSourceMap = Partial<Record<AdPlatform, string[]>>;

export const MARKETING_AD_SPEND_SOURCE_MAP = defineSetting<AdSpendSourceMap>({
  key: "marketing.adSpend.utmSourceMap",
  group: "marketing",
  type: adSpendSourceMapSchema as z.ZodType<AdSpendSourceMap>,
  default: { meta: ["facebook", "fb", "instagram", "ig", "meta"], google: ["google", "adwords", "youtube"], tiktok: ["tiktok"] },
  label: { bn: "utm_source থেকে বিজ্ঞাপন প্ল্যাটফর্ম", en: "utm_source values per ad platform" },
  help: { bn: "ROAS রিপোর্টে অর্ডারকে প্ল্যাটফর্মের সাথে মেলাতে", en: "Matches orders to platforms in the ROAS report" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: { widget: "json" },
});

export const MARKETING_ROAS_REVENUE_BASIS = defineSetting({
  key: "marketing.roas.revenueBasis",
  group: "marketing",
  type: z.enum(["placed", "delivered"]),
  default: "placed",
  label: { bn: "ROAS-এ কোন অর্ডার গণনা হবে", en: "Orders counted as ROAS revenue" },
  secret: false,
  public: false,
  permission: "settings.marketing.write",
  ui: {
    widget: "select",
    options: [
      { value: "placed", label: { bn: "সব অর্ডার (বাতিল ছাড়া)", en: "All orders except cancelled" } },
      { value: "delivered", label: { bn: "শুধু ডেলিভার হওয়া", en: "Delivered only" } },
    ],
  },
});

export const AI_ENABLED = defineSetting({
  key: "ai.enabled",
  group: "ai",
  type: z.boolean(),
  default: false,
  label: { bn: "AI কনটেন্ট সহায়তা চালু", en: "AI content assistance enabled" },
  help: { bn: "AI-এর লেখা সবসময় ড্রাফট হিসেবে আসে, স্টাফ প্রয়োগ করলে তবেই প্রকাশ হয়", en: "AI output is always a draft until staff apply it" },
  secret: false,
  public: false,
  permission: "settings.ai.write",
  ui: { widget: "toggle" },
});

export const AI_FALLBACK_TO_NEXT_PROVIDER = defineSetting({
  key: "ai.fallbackToNextProvider",
  group: "ai",
  type: z.boolean(),
  default: true,
  label: { bn: "প্রোভাইডার ব্যর্থ হলে পরবর্তী সক্রিয় প্রোভাইডার চেষ্টা করুন", en: "Try the next enabled provider when one fails" },
  secret: false,
  public: false,
  permission: "settings.ai.write",
  ui: { widget: "toggle" },
});

export const AI_MONTHLY_BUDGET_CENTS = defineSetting({
  key: "ai.monthlyBudgetCents",
  group: "ai",
  type: z.number().int().min(0).nullable(),
  default: null,
  label: { bn: "সব AI ফিচারের মাসিক বাজেট (USD সেন্ট, খালি = সীমা নেই)", en: "Monthly budget across all AI features (USD cents, empty = no limit)" },
  secret: false,
  public: false,
  permission: "settings.ai.write",
  ui: { widget: "text" },
});

export const AI_BUDGET_ALERT_PERCENT = defineSetting({
  key: "ai.budgetAlertPercent",
  group: "ai",
  type: z.number().int().min(10).max(100),
  default: 80,
  label: { bn: "বাজেটের কত % খরচ হলে অ্যালার্ট", en: "Alert when this % of a budget is used" },
  secret: false,
  public: false,
  permission: "settings.ai.write",
  ui: { widget: "text" },
});

export const SEO_BROKEN_LINKS_CHECK_EXTERNAL = defineSetting({
  key: "seo.brokenLinks.checkExternal",
  group: "seo",
  type: z.boolean(),
  default: false,
  label: { bn: "ভাঙা লিংক পরীক্ষায় বাইরের লিংকও যাচাই করুন", en: "Also check external links in the broken link scan" },
  help: { bn: "প্রতিটি বাইরের লিংকে একটি HEAD অনুরোধ পাঠানো হয়", en: "Sends one HEAD request per external link" },
  secret: false,
  public: false,
  permission: "settings.seo.write",
  ui: { widget: "toggle" },
});
