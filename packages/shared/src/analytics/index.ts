import { z } from "zod";
import { AUTOMATION_TRIGGERS } from "../automation/rules.ts";

/**
 * Milestone 17 (§16 M17) shared definitions: the report builder's datasets
 * and config, public API scopes, outbound webhook events and the config
 * bundle's sections. Pure data + zod — the API validates with these and the
 * admin renders its pickers from them, so the two can't drift (golden rule 6).
 */

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

type Label = { bn: string; en: string };

export interface ReportFieldDef {
  key: string;
  label: Label;
}
export interface ReportMetricDef extends ReportFieldDef {
  /** How the value is displayed (and exported). */
  format: "count" | "money" | "percent";
}
export interface ReportDatasetDef {
  key: "sales" | "products";
  label: Label;
  dimensions: ReportFieldDef[];
  metrics: ReportMetricDef[];
}

/**
 * `sales` has one row per order; `products` one row per order line. Orders
 * that never became sales (cancelled, expired, unpaid online) are excluded by
 * default — the `includeUnsold` option opts back in.
 */
export const REPORT_DATASETS: Record<ReportDatasetDef["key"], ReportDatasetDef> = {
  sales: {
    key: "sales",
    label: { bn: "বিক্রয় (অর্ডার অনুযায়ী)", en: "Sales (per order)" },
    dimensions: [
      { key: "day", label: { bn: "দিন", en: "Day" } },
      { key: "week", label: { bn: "সপ্তাহ", en: "Week" } },
      { key: "month", label: { bn: "মাস", en: "Month" } },
      { key: "status", label: { bn: "স্ট্যাটাস", en: "Status" } },
      { key: "channel", label: { bn: "চ্যানেল", en: "Channel" } },
      { key: "source", label: { bn: "সোর্স (UTM)", en: "Source (UTM)" } },
      { key: "paymentStatus", label: { bn: "পেমেন্ট স্ট্যাটাস", en: "Payment status" } },
      { key: "customerType", label: { bn: "নতুন/পুরনো গ্রাহক", en: "New vs returning" } },
    ],
    metrics: [
      { key: "orders", label: { bn: "অর্ডার", en: "Orders" }, format: "count" },
      { key: "units", label: { bn: "ইউনিট", en: "Units" }, format: "count" },
      { key: "subtotal", label: { bn: "সাবটোটাল", en: "Subtotal" }, format: "money" },
      { key: "discount", label: { bn: "ডিসকাউন্ট", en: "Discounts" }, format: "money" },
      { key: "shipping", label: { bn: "শিপিং ফি", en: "Shipping fees" }, format: "money" },
      { key: "revenue", label: { bn: "মোট (রেভিনিউ)", en: "Revenue (total)" }, format: "money" },
      { key: "aov", label: { bn: "গড় অর্ডার মূল্য", en: "Average order value" }, format: "money" },
      { key: "discountRate", label: { bn: "ডিসকাউন্টের হার", en: "Discount rate" }, format: "percent" },
    ],
  },
  products: {
    key: "products",
    label: { bn: "পণ্য (লাইন অনুযায়ী)", en: "Products (per order line)" },
    dimensions: [
      { key: "day", label: { bn: "দিন", en: "Day" } },
      { key: "month", label: { bn: "মাস", en: "Month" } },
      { key: "product", label: { bn: "পণ্য", en: "Product" } },
      { key: "category", label: { bn: "ক্যাটাগরি", en: "Category" } },
      { key: "size", label: { bn: "সাইজ", en: "Size" } },
      { key: "color", label: { bn: "রঙ", en: "Color" } },
      { key: "sku", label: { bn: "SKU", en: "SKU" } },
      { key: "channel", label: { bn: "চ্যানেল", en: "Channel" } },
    ],
    metrics: [
      { key: "orders", label: { bn: "অর্ডার", en: "Orders" }, format: "count" },
      { key: "units", label: { bn: "ইউনিট", en: "Units" }, format: "count" },
      { key: "revenue", label: { bn: "বিক্রয় মূল্য", en: "Sales value" }, format: "money" },
      { key: "cogs", label: { bn: "ক্রয়মূল্য (COGS)", en: "Cost of goods" }, format: "money" },
      { key: "grossProfit", label: { bn: "গ্রস মুনাফা", en: "Gross profit" }, format: "money" },
      { key: "grossMargin", label: { bn: "গ্রস মার্জিন", en: "Gross margin" }, format: "percent" },
      { key: "avgPrice", label: { bn: "গড় বিক্রয়মূল্য", en: "Average selling price" }, format: "money" },
    ],
  },
};

export const REPORT_DATASET_KEYS = ["sales", "products"] as const;
export const REPORT_FILTER_OPS = ["eq", "neq", "in"] as const;

export const reportFilterSchema = z.object({
  field: z.string().min(1).max(40),
  op: z.enum(REPORT_FILTER_OPS),
  /** `eq`/`neq` take one value; `in` takes a list. Always strings — dimensions are labels. */
  values: z.array(z.string().max(200)).min(1).max(50),
});

export const reportConfigSchema = z.object({
  dataset: z.enum(REPORT_DATASET_KEYS),
  dimensions: z.array(z.string().min(1).max(40)).max(2),
  metrics: z.array(z.string().min(1).max(40)).min(1).max(8),
  filters: z.array(reportFilterSchema).max(8).default([]),
  sort: z.object({ key: z.string().min(1).max(40), direction: z.enum(["asc", "desc"]) }).nullable().default(null),
  limit: z.number().int().min(1).max(5000).default(500),
  includeUnsold: z.boolean().default(false),
});
export type ReportConfig = z.infer<typeof reportConfigSchema>;

/** Returns a description of the first problem with a config against its dataset, or null if it's valid. */
export function validateReportConfig(config: ReportConfig): string | null {
  const dataset = REPORT_DATASETS[config.dataset];
  const dimensions = new Set(dataset.dimensions.map((d) => d.key));
  const metrics = new Set(dataset.metrics.map((m) => m.key));
  for (const key of config.dimensions) if (!dimensions.has(key)) return `Unknown dimension "${key}" for ${config.dataset}`;
  if (new Set(config.dimensions).size !== config.dimensions.length) return "A dimension can only be used once";
  for (const key of config.metrics) if (!metrics.has(key)) return `Unknown metric "${key}" for ${config.dataset}`;
  if (new Set(config.metrics).size !== config.metrics.length) return "A metric can only be used once";
  for (const filter of config.filters) if (!dimensions.has(filter.field)) return `Can't filter on "${filter.field}" for ${config.dataset}`;
  if (config.sort && !dimensions.has(config.sort.key) && !metrics.has(config.sort.key)) return `Can't sort by "${config.sort.key}"`;
  return null;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export interface ExpenseCategoryDef {
  key: string;
  label: Label;
}

/** Seed value for `finance.expenseCategories`; staff add or rename categories in Settings. */
export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategoryDef[] = [
  { key: "rent", label: { bn: "ভাড়া", en: "Rent" } },
  { key: "salaries", label: { bn: "বেতন", en: "Salaries" } },
  { key: "packaging", label: { bn: "প্যাকেজিং", en: "Packaging" } },
  { key: "utilities", label: { bn: "ইউটিলিটি", en: "Utilities" } },
  { key: "software", label: { bn: "সফটওয়্যার ও সাবস্ক্রিপশন", en: "Software & subscriptions" } },
  { key: "photography", label: { bn: "ফটোশুট ও কনটেন্ট", en: "Photography & content" } },
  { key: "transport", label: { bn: "যাতায়াত ও পরিবহন", en: "Transport" } },
  { key: "taxes", label: { bn: "কর ও ফি", en: "Taxes & fees" } },
  { key: "other", label: { bn: "অন্যান্য", en: "Other" } },
];

export const expenseCategoryListSchema = z
  .array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), label: z.object({ bn: z.string().min(1).max(80), en: z.string().min(1).max(80) }) }))
  .min(1)
  .max(60)
  .refine((list) => new Set(list.map((c) => c.key)).size === list.length, "Category keys must be unique");

// ---------------------------------------------------------------------------
// Public API keys and outbound webhooks
// ---------------------------------------------------------------------------

export const API_SCOPES = [
  { key: "products.read", label: { bn: "পণ্য ও ক্যাটালগ পড়া", en: "Read products & catalog" } },
  { key: "inventory.read", label: { bn: "স্টক লেভেল পড়া", en: "Read stock levels" } },
  { key: "orders.read", label: { bn: "অর্ডার পড়া", en: "Read orders" } },
] as const;
export type ApiScope = (typeof API_SCOPES)[number]["key"];
export const API_SCOPE_KEYS = API_SCOPES.map((s) => s.key) as [ApiScope, ...ApiScope[]];

/** Webhook events mirror the order lifecycle triggers (§16 M11) plus a `webhook.test` ping. */
export const WEBHOOK_EVENTS = [
  ...AUTOMATION_TRIGGERS.map((t) => ({ key: t.key as string, label: t.label })),
  { key: "webhook.test", label: { bn: "পরীক্ষামূলক পিং", en: "Test ping" } },
];
export const WEBHOOK_EVENT_KEYS = WEBHOOK_EVENTS.map((e) => e.key) as [string, ...string[]];

// ---------------------------------------------------------------------------
// Config bundle
// ---------------------------------------------------------------------------

export const CONFIG_BUNDLE_VERSION = 1;

/** Sections a bundle can carry, in the order they are applied (later ones may reference earlier ones). */
export const CONFIG_BUNDLE_SECTIONS = [
  { key: "settings", label: { bn: "সেটিংস (সিক্রেট ছাড়া)", en: "Settings (secrets excluded)" } },
  { key: "uiStrings", label: { bn: "UI টেক্সট", en: "UI strings" } },
  { key: "messageTemplates", label: { bn: "মেসেজ টেমপ্লেট", en: "Message templates" } },
  { key: "categories", label: { bn: "ক্যাটাগরি", en: "Categories" } },
  { key: "attributes", label: { bn: "অ্যাট্রিবিউট", en: "Attributes" } },
  { key: "menus", label: { bn: "মেনু", en: "Menus" } },
  { key: "pages", label: { bn: "CMS পেজ", en: "CMS pages" } },
] as const;
export type ConfigBundleSection = (typeof CONFIG_BUNDLE_SECTIONS)[number]["key"];
export const CONFIG_BUNDLE_SECTION_KEYS = CONFIG_BUNDLE_SECTIONS.map((s) => s.key) as [ConfigBundleSection, ...ConfigBundleSection[]];
