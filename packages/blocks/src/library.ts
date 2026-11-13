/**
 * MVP block library (docs/PROJECT_SPEC.md §9.1). This is a representative
 * subset, not the full list the spec names — flash-sale countdown,
 * testimonials/reviews, trust badges, Instagram/UGC gallery, size guide
 * table, contact+map, order form and video each depend on a system this
 * milestone doesn't build yet (flash sales/reviews are M8, size charts'
 * storefront rendering is M4). Every block type here follows the same
 * schema.ts/defaults.ts/Component.tsx shape, so adding one of those later
 * is additive, not a redesign — see docs/DECISIONS.md.
 */
import { registerBlock } from "./registry.ts";
import { heroSchema } from "./blocks/hero/schema.ts";
import { heroDefaults } from "./blocks/hero/defaults.ts";
import { HeroBlock } from "./blocks/hero/Component.tsx";
import { richTextSchema } from "./blocks/rich-text/schema.ts";
import { richTextDefaults } from "./blocks/rich-text/defaults.ts";
import { RichTextBlock } from "./blocks/rich-text/Component.tsx";
import { imageTextSchema } from "./blocks/image-text/schema.ts";
import { imageTextDefaults } from "./blocks/image-text/defaults.ts";
import { ImageTextBlock } from "./blocks/image-text/Component.tsx";
import { categoryTilesSchema } from "./blocks/category-tiles/schema.ts";
import { categoryTilesDefaults } from "./blocks/category-tiles/defaults.ts";
import { CategoryTilesBlock } from "./blocks/category-tiles/Component.tsx";
import { productGridSchema } from "./blocks/product-grid/schema.ts";
import { productGridDefaults } from "./blocks/product-grid/defaults.ts";
import { ProductGridBlock } from "./blocks/product-grid/Component.tsx";
import { bannerStripSchema } from "./blocks/banner-strip/schema.ts";
import { bannerStripDefaults } from "./blocks/banner-strip/defaults.ts";
import { BannerStripBlock } from "./blocks/banner-strip/Component.tsx";
import { faqAccordionSchema } from "./blocks/faq-accordion/schema.ts";
import { faqAccordionDefaults } from "./blocks/faq-accordion/defaults.ts";
import { FaqAccordionBlock } from "./blocks/faq-accordion/Component.tsx";
import { newsletterSignupSchema } from "./blocks/newsletter-signup/schema.ts";
import { newsletterSignupDefaults } from "./blocks/newsletter-signup/defaults.ts";
import { NewsletterSignupBlock } from "./blocks/newsletter-signup/Component.tsx";
import { spacerSchema } from "./blocks/spacer/schema.ts";
import { spacerDefaults } from "./blocks/spacer/defaults.ts";
import { SpacerBlock } from "./blocks/spacer/Component.tsx";
import { customHtmlSchema } from "./blocks/custom-html/schema.ts";
import { customHtmlDefaults } from "./blocks/custom-html/defaults.ts";
import { CustomHtmlBlock } from "./blocks/custom-html/Component.tsx";
import { lookbookSchema } from "./blocks/lookbook/schema.ts";
import { lookbookDefaults } from "./blocks/lookbook/defaults.ts";
import { LookbookBlock } from "./blocks/lookbook/Component.tsx";
import { forYouSchema } from "./blocks/for-you/schema.ts";
import { forYouDefaults } from "./blocks/for-you/defaults.ts";
import { ForYouBlock } from "./blocks/for-you/Component.tsx";

registerBlock({ type: "hero", label: { bn: "হিরো", en: "Hero" }, schema: heroSchema, defaults: heroDefaults, component: HeroBlock });
registerBlock({ type: "rich_text", label: { bn: "টেক্সট", en: "Rich text" }, schema: richTextSchema, defaults: richTextDefaults, component: RichTextBlock });
registerBlock({ type: "image_text", label: { bn: "ছবি ও টেক্সট", en: "Image + text" }, schema: imageTextSchema, defaults: imageTextDefaults, component: ImageTextBlock });
registerBlock({ type: "category_tiles", label: { bn: "ক্যাটাগরি টাইল", en: "Category tiles" }, schema: categoryTilesSchema, defaults: categoryTilesDefaults, component: CategoryTilesBlock });
registerBlock({ type: "product_grid", label: { bn: "প্রোডাক্ট গ্রিড", en: "Product grid" }, schema: productGridSchema, defaults: productGridDefaults, component: ProductGridBlock });
registerBlock({ type: "banner_strip", label: { bn: "ব্যানার স্ট্রিপ", en: "Banner strip" }, schema: bannerStripSchema, defaults: bannerStripDefaults, component: BannerStripBlock });
registerBlock({ type: "faq_accordion", label: { bn: "FAQ", en: "FAQ accordion" }, schema: faqAccordionSchema, defaults: faqAccordionDefaults, component: FaqAccordionBlock });
registerBlock({ type: "newsletter_signup", label: { bn: "নিউজলেটার", en: "Newsletter signup" }, schema: newsletterSignupSchema, defaults: newsletterSignupDefaults, component: NewsletterSignupBlock });
registerBlock({ type: "spacer", label: { bn: "স্পেসার", en: "Spacer" }, schema: spacerSchema, defaults: spacerDefaults, component: SpacerBlock });
registerBlock({
  type: "custom_html",
  label: { bn: "কাস্টম HTML", en: "Custom HTML" },
  schema: customHtmlSchema,
  defaults: customHtmlDefaults,
  component: CustomHtmlBlock,
  superAdminOnly: true,
});
registerBlock({ type: "lookbook", label: { bn: "লুকবুক হটস্পট", en: "Lookbook hotspots" }, schema: lookbookSchema, defaults: lookbookDefaults, component: LookbookBlock });
registerBlock({ type: "for_you", label: { bn: "আপনার জন্য (পার্সোনালাইজড)", en: "For you (personalized)" }, schema: forYouSchema, defaults: forYouDefaults, component: ForYouBlock });
