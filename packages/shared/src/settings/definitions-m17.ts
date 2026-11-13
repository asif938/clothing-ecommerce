import { z } from "zod";
import { defineSetting } from "./registry.ts";
import { DEFAULT_EXPENSE_CATEGORIES, expenseCategoryListSchema } from "../analytics/index.ts";

/**
 * Milestone 17 (§16 M17) settings — demand forecasting and reorder
 * suggestions, materials & BOM, expenses and P&L, the report builder, the
 * public API and outbound webhooks. The public API and webhooks are off by
 * default (spec §4.2 feature toggles).
 */

const INVENTORY = "settings.inventory.write";
const FINANCE = "settings.finance.write";
const PLATFORM = "settings.platform.write";

// ---------------------------------------------------------------------------
// Forecasting and reorder
// ---------------------------------------------------------------------------

export const FORECAST_LOOKBACK_DAYS = defineSetting({
  key: "forecast.lookbackDays",
  group: "inventory",
  type: z.number().int().min(14).max(365),
  default: 90,
  label: { bn: "ডিমান্ড ফোরকাস্ট: কত দিনের বিক্রি দেখা হবে", en: "Demand forecast: days of sales history" },
  help: { bn: "সাম্প্রতিক দিনগুলোর ওজন বেশি ধরা হয়", en: "Recent days weigh more than older ones" },
  secret: false,
  public: false,
  permission: INVENTORY,
  ui: { widget: "text" },
});

export const FORECAST_HORIZON_DAYS = defineSetting({
  key: "forecast.horizonDays",
  group: "inventory",
  type: z.number().int().min(7).max(180),
  default: 30,
  label: { bn: "ফোরকাস্টের সময়কাল (দিন)", en: "Forecast horizon (days)" },
  secret: false,
  public: false,
  permission: INVENTORY,
  ui: { widget: "text" },
});

export const PROCUREMENT_LEAD_TIME_DAYS = defineSetting({
  key: "procurement.leadTimeDays",
  group: "inventory",
  type: z.number().int().min(0).max(365),
  default: 14,
  label: { bn: "সাপ্লায়ারের ডিফল্ট লিড টাইম (দিন)", en: "Default supplier lead time (days)" },
  help: { bn: "সাপ্লায়ারের নিজস্ব লিড টাইম থাকলে সেটাই ধরা হয়", en: "A supplier's own lead time overrides this" },
  secret: false,
  public: false,
  permission: INVENTORY,
  ui: { widget: "text" },
});

export const PROCUREMENT_SAFETY_STOCK_DAYS = defineSetting({
  key: "procurement.safetyStockDays",
  group: "inventory",
  type: z.number().int().min(0).max(180),
  default: 7,
  label: { bn: "সেফটি স্টক (দিনের বিক্রি)", en: "Safety stock (days of sales)" },
  secret: false,
  public: false,
  permission: INVENTORY,
  ui: { widget: "text" },
});

export const PROCUREMENT_COVER_DAYS = defineSetting({
  key: "procurement.coverDays",
  group: "inventory",
  type: z.number().int().min(7).max(365),
  default: 45,
  label: { bn: "অর্ডারের পর কত দিনের স্টক থাকা উচিত", en: "Target days of cover after a reorder" },
  help: { bn: "রিঅর্ডার সাজেশন এই পরিমাণ স্টকের লক্ষ্যে হিসাব করে", en: "Reorder suggestions buy enough to reach this much stock" },
  secret: false,
  public: false,
  permission: INVENTORY,
  ui: { widget: "text" },
});

// ---------------------------------------------------------------------------
// Materials & BOM
// ---------------------------------------------------------------------------

export const MATERIALS_AUTO_CONSUME = defineSetting({
  key: "procurement.materials.autoConsume",
  group: "inventory",
  type: z.boolean(),
  default: false,
  label: { bn: "প্রোডাকশন অর্ডার রিসিভে কাঁচামাল স্বয়ংক্রিয়ভাবে কাটুন", en: "Consume materials when a production order is received" },
  help: {
    bn: "চালু থাকলে প্রতিটি রিসিভ করা ইউনিটের জন্য BOM অনুযায়ী কাঁচামাল স্টক থেকে কমবে",
    en: "When on, receiving finished goods on a production order deducts the BOM's materials from material stock",
  },
  secret: false,
  public: false,
  permission: INVENTORY,
  ui: { widget: "toggle" },
});

// ---------------------------------------------------------------------------
// Expenses and P&L
// ---------------------------------------------------------------------------

export const FINANCE_EXPENSE_CATEGORIES = defineSetting({
  key: "finance.expenseCategories",
  group: "finance",
  type: expenseCategoryListSchema,
  default: DEFAULT_EXPENSE_CATEGORIES,
  label: { bn: "খরচের ক্যাটাগরি", en: "Expense categories" },
  help: { bn: "key ছোট হাতের অক্ষর/সংখ্যা/আন্ডারস্কোর; খরচ রেকর্ডে ব্যবহৃত key মুছলে পুরনো রেকর্ড key নামেই দেখাবে", en: "Keys are lowercase letters, digits and underscores. Removing a key still used by recorded expenses leaves those expenses showing the raw key." },
  secret: false,
  public: false,
  permission: FINANCE,
  ui: { widget: "json" },
});

export const FINANCE_PNL_COUNT_AD_SPEND = defineSetting({
  key: "finance.pnl.countAdSpend",
  group: "finance",
  type: z.boolean(),
  default: true,
  label: { bn: "P&L-এ আমদানি করা বিজ্ঞাপন খরচ ধরুন", en: "Count imported ad spend in the P&L" },
  help: { bn: "বিজ্ঞাপন খরচ আলাদা করে খরচ হিসেবেও রেকর্ড করলে এটি বন্ধ রাখুন যাতে দু'বার না ধরা হয়", en: "Turn off if you also log ad spend as expenses, so it isn't counted twice" },
  secret: false,
  public: false,
  permission: FINANCE,
  ui: { widget: "toggle" },
});

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

export const REPORTS_BUILDER_MAX_RANGE_DAYS = defineSetting({
  key: "reports.builder.maxRangeDays",
  group: "reports",
  type: z.number().int().min(7).max(1095),
  default: 366,
  label: { bn: "কাস্টম রিপোর্টে সর্বোচ্চ তারিখ পরিসর (দিন)", en: "Report builder: maximum date range (days)" },
  help: { bn: "রিপোর্ট ডাটাবেস থেকে সরাসরি হিসাব করে, তাই পরিসর সীমিত রাখা হয়", en: "Reports are computed live from orders, so the range is capped to keep them fast" },
  secret: false,
  public: false,
  permission: "settings.reports.write",
  ui: { widget: "text" },
});

export const REPORTS_BUILDER_MAX_ROWS = defineSetting({
  key: "reports.builder.maxSourceRows",
  group: "reports",
  type: z.number().int().min(1000).max(200_000),
  default: 50_000,
  label: { bn: "কাস্টম রিপোর্টে সর্বোচ্চ সোর্স সারি", en: "Report builder: maximum source rows" },
  secret: false,
  public: false,
  permission: "settings.reports.write",
  ui: { widget: "text" },
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const PUBLIC_API_ENABLED = defineSetting({
  key: "publicApi.enabled",
  group: "platform",
  type: z.boolean(),
  default: false,
  label: { bn: "পাবলিক API চালু", en: "Public API enabled" },
  help: { bn: "বন্ধ থাকলে API কী দিয়ে কোনো অনুরোধ চলবে না", en: "While off, every API-key request is rejected" },
  secret: false,
  public: false,
  permission: PLATFORM,
  ui: { widget: "toggle" },
});

export const PUBLIC_API_RATE_LIMIT = defineSetting({
  key: "publicApi.rateLimitPerMinute",
  group: "platform",
  type: z.number().int().min(10).max(10_000),
  default: 120,
  label: { bn: "প্রতি API কী-তে প্রতি মিনিটে সর্বোচ্চ অনুরোধ", en: "Requests per minute per API key" },
  secret: false,
  public: false,
  permission: PLATFORM,
  ui: { widget: "text" },
});

// ---------------------------------------------------------------------------
// Outbound webhooks
// ---------------------------------------------------------------------------

export const WEBHOOKS_ENABLED = defineSetting({
  key: "webhooks.enabled",
  group: "platform",
  type: z.boolean(),
  default: false,
  label: { bn: "আউটবাউন্ড ওয়েবহুক চালু", en: "Outbound webhooks enabled" },
  help: { bn: "বন্ধ থাকলে কোনো ইভেন্ট পাঠানো হয় না (সংরক্ষিত ডেলিভারি ও পরীক্ষামূলক পিং বাদে)", en: "While off no events are queued; test pings still work" },
  secret: false,
  public: false,
  permission: PLATFORM,
  ui: { widget: "toggle" },
});

export const WEBHOOKS_MAX_ATTEMPTS = defineSetting({
  key: "webhooks.maxAttempts",
  group: "platform",
  type: z.number().int().min(1).max(12),
  default: 6,
  label: { bn: "ওয়েবহুক ডেলিভারির সর্বোচ্চ চেষ্টা", en: "Webhook delivery attempts" },
  help: { bn: "ব্যর্থ হলে ১ মিনিট থেকে শুরু করে দ্বিগুণ বিরতিতে আবার চেষ্টা", en: "Failures retry with doubling delays starting at 1 minute" },
  secret: false,
  public: false,
  permission: PLATFORM,
  ui: { widget: "text" },
});

export const WEBHOOKS_AUTO_DISABLE_AFTER = defineSetting({
  key: "webhooks.autoDisableAfterFailures",
  group: "platform",
  type: z.number().int().min(0).max(1000),
  default: 20,
  label: { bn: "পরপর এত ব্যর্থ ডেলিভারির পর ওয়েবহুক বন্ধ করুন (০ = কখনো না)", en: "Disable a webhook after this many consecutive failures (0 = never)" },
  secret: false,
  public: false,
  permission: PLATFORM,
  ui: { widget: "text" },
});
