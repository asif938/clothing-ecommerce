/**
 * Validation-only view of the block registry — schema + defaults + which
 * block types are Super-Admin-only, with no React import at all. The API
 * (apps/api's PagesService) validates saved block props against this; it
 * has no reason to pull in React or any Component.tsx, and shouldn't need
 * a JSX-aware build step just to run `nest build`. The storefront, which
 * does need the components, imports the full `@clothing/blocks` (`.`)
 * entry point instead — see `library.ts`.
 */
import type { z } from "zod";
import { heroSchema } from "./blocks/hero/schema.ts";
export { upgradeHeroProps } from "./blocks/hero/schema.ts";
import { heroDefaults } from "./blocks/hero/defaults.ts";
import { richTextSchema } from "./blocks/rich-text/schema.ts";
import { richTextDefaults } from "./blocks/rich-text/defaults.ts";
import { imageTextSchema } from "./blocks/image-text/schema.ts";
import { imageTextDefaults } from "./blocks/image-text/defaults.ts";
import { categoryTilesSchema } from "./blocks/category-tiles/schema.ts";
import { categoryTilesDefaults } from "./blocks/category-tiles/defaults.ts";
import { productGridSchema } from "./blocks/product-grid/schema.ts";
import { productGridDefaults } from "./blocks/product-grid/defaults.ts";
import { bannerStripSchema } from "./blocks/banner-strip/schema.ts";
import { bannerStripDefaults } from "./blocks/banner-strip/defaults.ts";
import { faqAccordionSchema } from "./blocks/faq-accordion/schema.ts";
import { faqAccordionDefaults } from "./blocks/faq-accordion/defaults.ts";
import { newsletterSignupSchema } from "./blocks/newsletter-signup/schema.ts";
import { newsletterSignupDefaults } from "./blocks/newsletter-signup/defaults.ts";
import { spacerSchema } from "./blocks/spacer/schema.ts";
import { spacerDefaults } from "./blocks/spacer/defaults.ts";
import { customHtmlSchema } from "./blocks/custom-html/schema.ts";
import { customHtmlDefaults } from "./blocks/custom-html/defaults.ts";
import { lookbookSchema } from "./blocks/lookbook/schema.ts";
import { lookbookDefaults } from "./blocks/lookbook/defaults.ts";
import { forYouSchema } from "./blocks/for-you/schema.ts";
import { forYouDefaults } from "./blocks/for-you/defaults.ts";
import { reviewsSchema } from "./blocks/reviews/schema.ts";
import { reviewsDefaults } from "./blocks/reviews/defaults.ts";

export interface BlockSchemaEntry {
  type: string;
  schema: z.ZodType;
  defaults: unknown;
  superAdminOnly?: boolean;
}

export const BLOCK_SCHEMAS: Record<string, BlockSchemaEntry> = {
  hero: { type: "hero", schema: heroSchema, defaults: heroDefaults },
  rich_text: { type: "rich_text", schema: richTextSchema, defaults: richTextDefaults },
  image_text: { type: "image_text", schema: imageTextSchema, defaults: imageTextDefaults },
  category_tiles: { type: "category_tiles", schema: categoryTilesSchema, defaults: categoryTilesDefaults },
  product_grid: { type: "product_grid", schema: productGridSchema, defaults: productGridDefaults },
  banner_strip: { type: "banner_strip", schema: bannerStripSchema, defaults: bannerStripDefaults },
  faq_accordion: { type: "faq_accordion", schema: faqAccordionSchema, defaults: faqAccordionDefaults },
  newsletter_signup: { type: "newsletter_signup", schema: newsletterSignupSchema, defaults: newsletterSignupDefaults },
  spacer: { type: "spacer", schema: spacerSchema, defaults: spacerDefaults },
  custom_html: { type: "custom_html", schema: customHtmlSchema, defaults: customHtmlDefaults, superAdminOnly: true },
  lookbook: { type: "lookbook", schema: lookbookSchema, defaults: lookbookDefaults },
  for_you: { type: "for_you", schema: forYouSchema, defaults: forYouDefaults },
  reviews: { type: "reviews", schema: reviewsSchema, defaults: reviewsDefaults },
};

export interface BlockInstanceLike {
  id: string;
  type: string;
  props: unknown;
  visibility?: unknown;
  schedule?: unknown;
}

export interface BlockValidationError {
  blockId: string;
  type: string;
  message: string;
}

/**
 * Validates a whole page's block list in one pass: unknown types and
 * schema failures are collected as errors (so the editor can point at the
 * exact block), and `custom_html` additionally requires `isSuperAdmin`.
 */
export function validateBlocks(blocks: BlockInstanceLike[], isSuperAdmin: boolean): { valid: BlockInstanceLike[]; errors: BlockValidationError[] } {
  const valid: BlockInstanceLike[] = [];
  const errors: BlockValidationError[] = [];

  for (const block of blocks) {
    const entry = BLOCK_SCHEMAS[block.type];
    if (!entry) {
      errors.push({ blockId: block.id, type: block.type, message: `Unknown block type "${block.type}"` });
      continue;
    }
    if (entry.superAdminOnly && !isSuperAdmin) {
      errors.push({ blockId: block.id, type: block.type, message: `Block type "${block.type}" is Super Admin only` });
      continue;
    }
    const result = entry.schema.safeParse(block.props);
    if (!result.success) {
      errors.push({ blockId: block.id, type: block.type, message: result.error.issues.map((issue) => issue.message).join("; ") });
      continue;
    }
    valid.push({ ...block, props: result.data });
  }

  return { valid, errors };
}
