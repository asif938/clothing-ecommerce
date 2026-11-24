/**
 * Form description for every page-builder block, so the editor shows real
 * inputs (text in both languages, image from the media library, category /
 * product / collection pickers, repeatable items) instead of raw JSON.
 *
 * The shapes mirror the zod schemas in `@clothing/blocks/schemas`, which
 * stay the source of truth: the editor validates against them before saving
 * and the API validates again on save. A block type missing here falls back
 * to the advanced JSON box (still Super-Admin-gated where the schema says so).
 * Labels are i18n keys under `blocks.fields.*` / `blocks.options.*`.
 */

type Props = Record<string, unknown>;

interface BaseField {
  key: string;
  /** Hide the field unless this returns true for the block's current props. */
  showIf?: (props: Props) => boolean;
  /** i18n key under `blocks.hints` shown under the input. */
  hint?: string;
  /** i18n key under `blocks.fields` when the prop name's usual label doesn't fit this block (e.g. `limit` counting reviews, not products). */
  labelKey?: string;
  /** Other props reset when this field changes (e.g. the picked category when the product source changes). */
  clears?: string[];
}

export type BlockField =
  | (BaseField & { kind: "localizedText" | "localizedTextarea" })
  | (BaseField & { kind: "link" })
  | (BaseField & { kind: "text" })
  | (BaseField & { kind: "image" })
  | (BaseField & { kind: "select"; options: string[] })
  | (BaseField & { kind: "number"; min: number; max: number })
  | (BaseField & { kind: "categories" })
  | (BaseField & { kind: "category" })
  | (BaseField & { kind: "collection" })
  | (BaseField & { kind: "products" })
  | (BaseField & { kind: "product" })
  | (BaseField & { kind: "html" })
  | (BaseField & { kind: "list"; itemFields: BlockField[]; max?: number; newItem: () => Props; itemLabel: string });

export interface BlockFormSpec {
  /** i18n key under `blocks.descriptions` — one line telling the owner what the block is for. */
  description: string;
  fields: BlockField[];
}

const newId = () => `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const BLOCK_FORMS: Record<string, BlockFormSpec> = {
  hero: {
    description: "hero",
    fields: [
      { key: "imageUrl", kind: "image", hint: "heroImage" },
      { key: "heading", kind: "localizedText" },
      { key: "subheading", kind: "localizedTextarea" },
      { key: "ctaText", kind: "localizedText" },
      { key: "ctaUrl", kind: "link" },
      { key: "align", kind: "select", options: ["left", "center", "right"] },
      { key: "imageAlt", kind: "localizedText", hint: "imageAlt" },
    ],
  },
  rich_text: {
    description: "rich_text",
    fields: [
      { key: "content", kind: "localizedTextarea" },
      { key: "align", kind: "select", options: ["left", "center"] },
    ],
  },
  image_text: {
    description: "image_text",
    fields: [
      { key: "imageUrl", kind: "image" },
      { key: "imagePosition", kind: "select", options: ["left", "right"] },
      { key: "heading", kind: "localizedText" },
      { key: "body", kind: "localizedTextarea" },
      { key: "ctaText", kind: "localizedText" },
      { key: "ctaUrl", kind: "link" },
      { key: "imageAlt", kind: "localizedText", hint: "imageAlt" },
    ],
  },
  category_tiles: {
    description: "category_tiles",
    fields: [
      { key: "heading", kind: "localizedText" },
      { key: "categoryIds", kind: "categories" },
    ],
  },
  product_grid: {
    description: "product_grid",
    fields: [
      { key: "heading", kind: "localizedText" },
      { key: "source", kind: "select", options: ["new_arrivals", "best_sellers", "on_sale", "category", "collection", "tag", "manual"], clears: ["sourceId", "productIds"] },
      { key: "sourceId", kind: "category", showIf: (p) => p.source === "category" },
      { key: "sourceId", kind: "collection", showIf: (p) => p.source === "collection" },
      { key: "sourceId", kind: "text", showIf: (p) => p.source === "tag", hint: "tag" },
      { key: "productIds", kind: "products", showIf: (p) => p.source === "manual" },
      { key: "limit", kind: "number", min: 1, max: 24 },
    ],
  },
  banner_strip: {
    description: "banner_strip",
    fields: [
      {
        key: "items",
        kind: "list",
        max: 4,
        itemLabel: "banner",
        newItem: () => ({ imageUrl: null }),
        itemFields: [
          { key: "imageUrl", kind: "image" },
          { key: "text", kind: "localizedText" },
          { key: "linkUrl", kind: "link" },
        ],
      },
    ],
  },
  faq_accordion: {
    description: "faq_accordion",
    fields: [
      { key: "heading", kind: "localizedText" },
      {
        key: "items",
        kind: "list",
        itemLabel: "question",
        newItem: () => ({ question: { bn: "", en: "" }, answer: { bn: "", en: "" } }),
        itemFields: [
          { key: "question", kind: "localizedText" },
          { key: "answer", kind: "localizedTextarea" },
        ],
      },
    ],
  },
  newsletter_signup: {
    description: "newsletter_signup",
    fields: [
      { key: "heading", kind: "localizedText" },
      { key: "body", kind: "localizedTextarea" },
    ],
  },
  spacer: {
    description: "spacer",
    fields: [{ key: "height", kind: "select", options: ["sm", "md", "lg", "xl"] }],
  },
  for_you: {
    description: "for_you",
    fields: [
      { key: "heading", kind: "localizedText" },
      { key: "fallbackHeading", kind: "localizedText", hint: "fallbackHeading" },
      { key: "limit", kind: "number", min: 2, max: 24 },
    ],
  },
  reviews: {
    description: "reviews",
    fields: [
      { key: "heading", kind: "localizedText" },
      { key: "source", kind: "select", options: ["recent", "top_rated", "with_photos", "none"], hint: "reviewsSource" },
      { key: "minRating", kind: "number", min: 1, max: 5, showIf: (p) => p.source !== "none", hint: "minRating" },
      { key: "limit", kind: "number", min: 1, max: 12, labelKey: "reviewLimit", showIf: (p) => p.source !== "none" },
      {
        key: "testimonials",
        kind: "list",
        max: 12,
        itemLabel: "testimonial",
        hint: "testimonials",
        newItem: () => ({ name: "", quote: { bn: "", en: "" }, rating: 5 }),
        itemFields: [
          { key: "name", kind: "text" },
          { key: "quote", kind: "localizedTextarea" },
          { key: "rating", kind: "number", min: 1, max: 5 },
        ],
      },
      { key: "verifiedLabel", kind: "localizedText" },
      { key: "fallbackName", kind: "localizedText", hint: "fallbackName" },
    ],
  },
  lookbook: {
    description: "lookbook",
    fields: [
      { key: "heading", kind: "localizedText" },
      { key: "imageUrl", kind: "image" },
      { key: "imageAlt", kind: "localizedText", hint: "imageAlt" },
      {
        key: "hotspots",
        kind: "list",
        itemLabel: "hotspot",
        newItem: () => ({ id: newId(), xPercent: 50, yPercent: 50, productId: "" }),
        itemFields: [
          { key: "productId", kind: "product" },
          { key: "xPercent", kind: "number", min: 0, max: 100, hint: "xPercent" },
          { key: "yPercent", kind: "number", min: 0, max: 100, hint: "yPercent" },
        ],
      },
    ],
  },
  custom_html: {
    description: "custom_html",
    fields: [{ key: "html", kind: "html", hint: "html" }],
  },
};

/** Order of the "Add a section" menu: the blocks an owner reaches for first come first. */
export const BLOCK_ORDER = ["hero", "product_grid", "category_tiles", "banner_strip", "image_text", "rich_text", "faq_accordion", "newsletter_signup", "reviews", "for_you", "lookbook", "spacer", "custom_html"];
