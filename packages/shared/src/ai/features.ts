import { z } from "zod";
import type { LocalizedText } from "../i18n/localized-text.ts";

/**
 * AI content features (docs/PROJECT_SPEC.md §10.4, §16 M13). Each feature
 * has an admin-editable prompt template (`{variable}` placeholders, same
 * syntax as message templates) and a fixed, code-owned *output contract*
 * appended after it — staff can reword the instructions freely without
 * being able to break the JSON the API parses. All output is saved as a
 * draft for human review, never auto-published.
 *
 * Later-phase features in §10.4 (review summary, size advice, reply
 * suggestions, chat assistant, report insights) register here when their
 * milestone lands (M14/M15).
 */

export const AI_FEATURES = ["product_description", "seo_meta", "alt_text", "translation", "visual_tags", "reply_suggestion", "chat_assistant"] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

/** Features that produce a reviewable product draft (the rest feed other systems, e.g. `visual_tags` → visual search, §16 M14). */
export const AI_DRAFT_FEATURES = ["product_description", "seo_meta", "alt_text", "translation"] as const satisfies readonly AiFeature[];
export type AiDraftFeature = (typeof AI_DRAFT_FEATURES)[number];

const localizedOut = z.object({ bn: z.string().trim().min(1).max(5000), en: z.string().trim().min(1).max(5000) });

export const AI_OUTPUT_SCHEMAS = {
  product_description: z.object({ description: localizedOut, shortDescription: localizedOut.optional() }),
  seo_meta: z.object({ seoTitle: localizedOut, seoDescription: localizedOut }),
  alt_text: z.object({ alt: localizedOut }),
  translation: z.object({ fields: z.record(z.string(), z.string().max(10_000)) }),
  visual_tags: z.object({
    garment: z.string().trim().max(80),
    colors: z.array(z.string().trim().max(40)).max(8),
    pattern: z.string().trim().max(60).optional(),
    style: z.array(z.string().trim().max(40)).max(8).optional(),
    keywords: z.array(z.string().trim().max(40)).max(16),
  }),
  // §16 M15 — support inbox.
  reply_suggestion: z.object({ suggestions: z.array(z.string().trim().min(1).max(1000)).min(1).max(3) }),
  /** The chat assistant replies in plain text through tool-using chat; this schema only exists so every feature has one. */
  chat_assistant: z.object({ reply: z.string() }),
} satisfies Record<AiFeature, z.ZodType>;

export type AiOutput<F extends AiFeature> = z.infer<(typeof AI_OUTPUT_SCHEMAS)[F]>;

export interface AiFeatureDefinition {
  key: AiFeature;
  label: LocalizedText;
  help: LocalizedText;
  /** Variables the prompt template may use, shown in the editor. */
  variables: string[];
  /** Whether product images are sent along (vision). */
  usesImages: boolean;
  defaultPrompt: string;
  /** Appended by code after the rendered template; carries an `<example>` the mock driver echoes. */
  outputContract: string;
  /** §16 M15 — runs as tool-using chat (`AiService.chat`), replying in plain text; has no JSON output contract. */
  chat?: boolean;
}

const COMMON = ["brand_name", "tone"];

export const AI_FEATURE_DEFINITIONS: Record<AiFeature, AiFeatureDefinition> = {
  product_description: {
    key: "product_description",
    label: { bn: "পণ্যের বিবরণ", en: "Product description" },
    help: { bn: "ছবি ও কীওয়ার্ড থেকে বাংলা ও ইংরেজি বিবরণ", en: "Bangla and English description from images and keywords" },
    variables: [...COMMON, "product_title", "category", "attributes", "options", "fabric", "keywords"],
    usesImages: true,
    defaultPrompt:
      "You write product copy for {brand_name}, a clothing brand in Bangladesh. Write a description for the product below in a {tone} tone. " +
      "Describe what is visible in the photos (cut, fabric look, colour, details) and what the facts say; do not invent materials, sizes or claims that are not given. " +
      "Write natural Bangla for Bangladeshi shoppers (not a word-for-word translation) and clear English. 2–4 short paragraphs or a short paragraph plus bullet points, plain HTML (<p>, <ul>, <li>, <strong> only).\n\n" +
      "Product: {product_title}\nCategory: {category}\nAttributes: {attributes}\nOptions: {options}\nFabric: {fabric}\nKeywords to include naturally: {keywords}",
    outputContract:
      'Respond with only a JSON object, no markdown fences, of this shape:\n<example>{"description":{"bn":"<p>…</p>","en":"<p>…</p>"},"shortDescription":{"bn":"…","en":"…"}}</example>',
  },
  seo_meta: {
    key: "seo_meta",
    label: { bn: "SEO শিরোনাম ও বিবরণ", en: "SEO title & description" },
    help: { bn: "সার্চ ফলাফলের জন্য মেটা ট্যাগ", en: "Meta tags for search results" },
    variables: [...COMMON, "product_title", "category", "description", "keywords"],
    usesImages: false,
    defaultPrompt:
      "Write search-engine meta tags for this {brand_name} product page, in Bangla and English. " +
      "Title: 30–60 characters, includes the product type. Description: 120–155 characters, specific and inviting, mentions cash on delivery in Bangladesh only if it fits naturally. Do not stuff keywords.\n\n" +
      "Product: {product_title}\nCategory: {category}\nKeywords: {keywords}\nDescription: {description}",
    outputContract: 'Respond with only a JSON object, no markdown fences:\n<example>{"seoTitle":{"bn":"…","en":"…"},"seoDescription":{"bn":"…","en":"…"}}</example>',
  },
  alt_text: {
    key: "alt_text",
    label: { bn: "ছবির Alt টেক্সট", en: "Image alt text" },
    help: { bn: "ছবি দেখে স্ক্রিন-রিডারের জন্য বর্ণনা", en: "Describes the image for screen readers" },
    variables: [...COMMON, "product_title", "option_value"],
    usesImages: true,
    defaultPrompt:
      "Write alt text for this product photo of \"{product_title}\" ({option_value}). Describe what is shown — garment, colour, notable details, how it is worn — in under 125 characters, in Bangla and English. Do not start with \"image of\".",
    outputContract: 'Respond with only a JSON object, no markdown fences:\n<example>{"alt":{"bn":"…","en":"…"}}</example>',
  },
  translation: {
    key: "translation",
    label: { bn: "অনুবাদ (বাংলা ↔ ইংরেজি)", en: "Translation (Bangla ↔ English)" },
    help: { bn: "একটি ভাষা থেকে অন্য ভাষায় অনুবাদ", en: "Translates fields from one language to the other" },
    variables: [...COMMON, "source_language", "target_language", "fields_json"],
    usesImages: false,
    defaultPrompt:
      "Translate each field of this clothing store's content from {source_language} to {target_language}. Keep HTML tags, product names, sizes and numbers unchanged. Use natural, everyday {target_language} that a shopper in Bangladesh would write, not a literal translation.\n\nFields (JSON): {fields_json}",
    outputContract: 'Respond with only a JSON object with the same keys, no markdown fences:\n<example>{"fields":{"title":"…","description":"…"}}</example>',
  },
  visual_tags: {
    key: "visual_tags",
    label: { bn: "ভিজ্যুয়াল সার্চ ট্যাগ", en: "Visual search tags" },
    help: {
      bn: "ছবি দেখে পোশাকের ধরন, রং ও প্যাটার্ন — ছবি দিয়ে খোঁজায় ব্যবহার হয়",
      en: "Garment type, colours and pattern read from a photo — used by visual search",
    },
    variables: ["brand_name"],
    usesImages: true,
    defaultPrompt:
      "You help a Bangladeshi clothing store ({brand_name}) find products that look like a shopper's photo. Look at the main garment in the image " +
      "(ignore background, people's faces and accessories unless the accessory is the main item). Name the garment type the way a Bangladeshi shop would " +
      "(e.g. panjabi, saree, kurti, three-piece, salwar kameez, t-shirt, polo shirt, shirt, jeans, hoodie), its main colours in plain English words, " +
      "its pattern (solid, striped, checked, floral, printed, embroidered…), a few style words, and up to 16 short English search keywords.",
    outputContract:
      'Respond with only a JSON object, no markdown fences:\n<example>{"garment":"panjabi","colors":["navy","white"],"pattern":"embroidered","style":["festive","straight cut"],"keywords":["panjabi","navy","embroidered","cotton","eid"]}</example>',
  },
  reply_suggestion: {
    key: "reply_suggestion",
    label: { bn: "উত্তরের পরামর্শ (সাপোর্ট)", en: "Reply suggestions (support)" },
    help: { bn: "ইনবক্সে গ্রাহকের শেষ বার্তার জন্য ৩টি উত্তরের খসড়া", en: "Three draft replies to the customer's latest message in the inbox" },
    variables: [...COMMON, "channel", "customer_name", "customer_context", "conversation", "language"],
    usesImages: false,
    defaultPrompt:
      "You help a support agent at {brand_name}, a clothing shop in Bangladesh, answer customers on {channel}. Write up to three short, different reply options " +
      "to the customer's latest message, in {language} (match how the customer writes — Bangla, English or Banglish). Be {tone}, polite and specific. " +
      "Use only the facts below; never promise refunds, discounts, delivery dates or stock that are not stated. If something must be checked, say the agent will check.\n\n" +
      "Customer: {customer_name}\nWhat we know: {customer_context}\n\nConversation (oldest first):\n{conversation}",
    outputContract: 'Respond with only a JSON object, no markdown fences:\n<example>{"suggestions":["…","…"]}</example>',
  },
  chat_assistant: {
    key: "chat_assistant",
    label: { bn: "চ্যাট সহকারী (স্বয়ংক্রিয় উত্তর)", en: "Chat assistant (automatic replies)" },
    help: {
      bn: "লাইভ চ্যাট/মেসেজে পণ্য, সাইজ, স্টক ও অর্ডারের প্রশ্নের উত্তর দেয়; দরকার হলে মানুষের কাছে পাঠায়",
      en: "Answers product, size, stock and order questions in chat, and hands over to a person when needed",
    },
    variables: ["brand_name", "tone", "channel", "support_hours", "support_phone"],
    usesImages: false,
    defaultPrompt:
      "You are the online shop assistant for {brand_name}, a clothing brand in Bangladesh, chatting with a customer on {channel}. Be {tone}, brief (1–4 short sentences) and friendly. " +
      "Reply in the language the customer uses (Bangla, English or Banglish).\n\n" +
      "Rules:\n" +
      "- Answer only about our products, sizes, stock, delivery and the customer's orders. Politely decline anything else.\n" +
      "- Never guess prices, stock, sizes or order details: look them up with the tools every time, and say so if a tool finds nothing.\n" +
      "- Order details need the order number; the tool checks it belongs to this customer. Never reveal anything about other orders or customers.\n" +
      "- Never promise discounts, refunds, exchanges, compensation or delivery dates beyond what the tools return, and never ask for passwords, OTP codes or card/bKash PINs.\n" +
      "- Call handoff_to_human when the customer asks for a person, is upset or complaining, wants a refund/return/cancellation/payment fix, or when you can't help after one try.\n" +
      "- Share product links exactly as the tools return them.\n\n" +
      "Support hours: {support_hours}. Phone: {support_phone}.",
    outputContract: "",
    chat: true,
  },
};

export const AI_DEFAULT_TONE = "warm, confident and concise";

/** Pulls the JSON object out of a model reply: tolerates ```json fences and stray prose around it. */
export function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The AI reply did not contain a JSON object");
  return JSON.parse(candidate.slice(start, end + 1));
}

export function parseAiOutput<F extends AiFeature>(feature: F, text: string): AiOutput<F> {
  return AI_OUTPUT_SCHEMAS[feature].parse(extractJsonObject(text)) as AiOutput<F>;
}

/** The text between `<example>` and `</example>` — what the mock driver returns. */
export function exampleFromContract(text: string): string | null {
  const match = /<example>([\s\S]*?)<\/example>/.exec(text);
  return match ? match[1]!.trim() : null;
}

/**
 * Estimated cost in micro-USD (1 USD = 1,000,000) from token counts and
 * per-million-token prices in US cents. Integer maths, rounded up so
 * budgets err on the safe side.
 */
export function estimateAiCostMicroUsd(inputTokens: number, outputTokens: number, inputCentsPerMTok: number, outputCentsPerMTok: number): number {
  return Math.ceil((inputTokens * inputCentsPerMTok + outputTokens * outputCentsPerMTok) / 100);
}

/** Budgets are set in US cents; spend is tracked in micro-USD. */
export function centsToMicroUsd(cents: number): number {
  return cents * 10_000;
}

export type BudgetState = "ok" | "alert" | "exceeded";

export function budgetState(spentMicroUsd: number, budgetCents: number | null, alertPercent: number): BudgetState {
  if (budgetCents === null) return "ok";
  const budget = centsToMicroUsd(budgetCents);
  if (spentMicroUsd >= budget) return "exceeded";
  if (spentMicroUsd * 100 >= budget * alertPercent) return "alert";
  return "ok";
}
