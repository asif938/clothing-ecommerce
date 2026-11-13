import { z } from "zod";
import { defineSetting } from "./registry.ts";

/**
 * Milestone 14 (§16 M14) settings — personalized recommendations, visual
 * search and A/B testing. Registered from `./index.ts` like M13's file.
 */

export const RECOMMENDATIONS_ENABLED = defineSetting({
  key: "recommendations.enabled",
  group: "personalization",
  type: z.boolean(),
  default: true,
  label: { bn: "পার্সোনালাইজড রেকমেন্ডেশন চালু", en: "Personalized recommendations enabled" },
  help: {
    bn: "\"আপনার জন্য\", \"একসাথে কেনা হয়\" ও \"একই রকম\" সেকশন; বন্ধ থাকলে শুধু হাতে বাছাই করা রিলেটেড প্রোডাক্ট দেখায়",
    en: "\"For you\", \"frequently bought together\" and \"similar\" sections; when off, only hand-picked related products show",
  },
  secret: false,
  public: true,
  permission: "settings.personalization.write",
  ui: { widget: "toggle" },
});

export const RECOMMENDATIONS_WINDOW_DAYS = defineSetting({
  key: "recommendations.windowDays",
  group: "personalization",
  type: z.number().int().min(7).max(1095),
  default: 180,
  label: { bn: "কত দিনের অর্ডার থেকে \"একসাথে কেনা\" হিসাব হবে", en: "Order history window for \"bought together\" (days)" },
  secret: false,
  public: false,
  permission: "settings.personalization.write",
  ui: { widget: "text" },
});

export const RECOMMENDATIONS_VIEW_WINDOW_DAYS = defineSetting({
  key: "recommendations.viewWindowDays",
  group: "personalization",
  type: z.number().int().min(1).max(365),
  default: 30,
  label: { bn: "কত দিনের ভিজিট থেকে \"একসাথে দেখা\" হিসাব হবে", en: "Browsing window for \"viewed together\" (days)" },
  secret: false,
  public: false,
  permission: "settings.personalization.write",
  ui: { widget: "text" },
});

export const RECOMMENDATIONS_MIN_SUPPORT = defineSetting({
  key: "recommendations.minSupport",
  group: "personalization",
  type: z.number().int().min(1).max(100),
  default: 2,
  label: { bn: "একটি জোড়া গণ্য হতে কমপক্ষে কতবার একসাথে আসতে হবে", en: "Minimum times a pair must appear together" },
  help: { bn: "ছোট দোকানে ২, বড় দোকানে বেশি রাখুন", en: "2 suits a small shop; raise it as order volume grows" },
  secret: false,
  public: false,
  permission: "settings.personalization.write",
  ui: { widget: "text" },
});

export const RECOMMENDATIONS_EXCLUDE_PURCHASED = defineSetting({
  key: "recommendations.excludePurchased",
  group: "personalization",
  type: z.boolean(),
  default: true,
  label: { bn: "\"আপনার জন্য\"-তে আগে কেনা পণ্য বাদ দিন", en: "Hide already-purchased products from \"For you\"" },
  secret: false,
  public: false,
  permission: "settings.personalization.write",
  ui: { widget: "toggle" },
});

export const VISUAL_SEARCH_ENABLED = defineSetting({
  key: "visualSearch.enabled",
  group: "personalization",
  type: z.boolean(),
  default: false,
  label: { bn: "ছবি দিয়ে খোঁজা (ভিজ্যুয়াল সার্চ) চালু", en: "Visual search (search by photo) enabled" },
  help: {
    bn: "ক্রেতা ছবি আপলোড করে একই রকম পণ্য খুঁজতে পারবেন; ক্যাটালগের ছবি ব্যাকগ্রাউন্ডে ইনডেক্স হয়",
    en: "Shoppers upload a photo to find similar products; catalog images are indexed in the background",
  },
  secret: false,
  public: true,
  permission: "settings.personalization.write",
  ui: { widget: "toggle" },
});

export const VISUAL_SEARCH_USE_AI = defineSetting({
  key: "visualSearch.useAi",
  group: "personalization",
  type: z.boolean(),
  default: false,
  label: { bn: "ভিজ্যুয়াল সার্চে AI ভিশন ব্যবহার করুন", en: "Use AI vision in visual search" },
  help: {
    bn: "AI ছবির পোশাকের ধরন, রং ও প্যাটার্ন বুঝে ফলাফল আরও ভালো করে; প্রতিটি খোঁজে AI বাজেট খরচ হয়",
    en: "AI reads garment type, colours and pattern for better matches; each search spends AI budget",
  },
  secret: false,
  public: false,
  permission: "settings.personalization.write",
  ui: { widget: "toggle" },
});

export const VISUAL_SEARCH_AI_INDEX_CATALOG = defineSetting({
  key: "visualSearch.aiIndexCatalog",
  group: "personalization",
  type: z.boolean(),
  default: false,
  label: { bn: "ক্যাটালগের ছবিতেও AI ট্যাগ তৈরি করুন", en: "Also AI-tag catalog images" },
  help: {
    bn: "প্রতিটি পণ্যের প্রধান ছবির জন্য একবার AI কল; বাজেট শেষ হলে থেমে যায়",
    en: "One AI call per product's main image; stops when the AI budget runs out",
  },
  secret: false,
  public: false,
  permission: "settings.personalization.write",
  ui: { widget: "toggle" },
});

export const VISUAL_SEARCH_MAX_RESULTS = defineSetting({
  key: "visualSearch.maxResults",
  group: "personalization",
  type: z.number().int().min(4).max(48),
  default: 24,
  label: { bn: "ভিজ্যুয়াল সার্চে সর্বোচ্চ ফলাফল", en: "Maximum visual search results" },
  secret: false,
  public: false,
  permission: "settings.personalization.write",
  ui: { widget: "text" },
});

export const VISUAL_SEARCH_PER_VISITOR_PER_HOUR = defineSetting({
  key: "visualSearch.perVisitorPerHour",
  group: "personalization",
  type: z.number().int().min(1).max(500),
  default: 20,
  label: { bn: "প্রতি ভিজিটর ঘণ্টায় সর্বোচ্চ ছবি-খোঁজ", en: "Visual searches per visitor per hour" },
  secret: false,
  public: false,
  permission: "settings.personalization.write",
  ui: { widget: "text" },
});

export const EXPERIMENTS_ENABLED = defineSetting({
  key: "experiments.enabled",
  group: "personalization",
  type: z.boolean(),
  default: true,
  label: { bn: "A/B টেস্ট চালু", en: "A/B testing enabled" },
  help: { bn: "বন্ধ থাকলে সব ভিজিটর কন্ট্রোল সংস্করণ দেখেন", en: "When off, every visitor sees the control version" },
  secret: false,
  public: true,
  permission: "settings.personalization.write",
  ui: { widget: "toggle" },
});

export const EXPERIMENTS_CONFIDENCE_PERCENT = defineSetting({
  key: "experiments.confidencePercent",
  group: "personalization",
  type: z.number().int().min(80).max(99),
  default: 95,
  label: { bn: "ফলাফল নিশ্চিত ধরার আস্থা স্তর (%)", en: "Confidence level to call a result (%)" },
  secret: false,
  public: false,
  permission: "settings.personalization.write",
  ui: { widget: "text" },
});

export const EXPERIMENTS_MIN_VISITORS = defineSetting({
  key: "experiments.minVisitorsPerVariant",
  group: "personalization",
  type: z.number().int().min(10).max(100_000),
  default: 100,
  label: { bn: "ফলাফল দেখানোর আগে প্রতি সংস্করণে ন্যূনতম ভিজিটর", en: "Minimum visitors per variant before calling a result" },
  secret: false,
  public: false,
  permission: "settings.personalization.write",
  ui: { widget: "text" },
});
