import { z } from "zod";

export const listCategoriesQuerySchema = z.object({ ids: z.string().min(1) });
export type ListCategoriesQueryDto = z.infer<typeof listCategoriesQuerySchema>;

export const listProductsQuerySchema = z.object({
  source: z.enum(["manual", "category", "collection", "tag", "new_arrivals", "best_sellers", "on_sale"]),
  sourceId: z.string().optional(),
  productIds: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(24).default(8),
});
export type ListProductsQueryDto = z.infer<typeof listProductsQuerySchema>;

/**
 * Category/collection listing (docs/PROJECT_SPEC.md §16 M4) — `attributes`
 * is passed over the wire as repeated `attr_<attributeId>=valueId1,valueId2`
 * query params; the controller parses those into `Record<attributeId,
 * valueId[]>` before this shape is used, since zod has no "parse every
 * `attr_*` key" primitive.
 */
export const listingSortSchema = z.enum(["relevance", "newest", "price_asc", "price_desc", "bestselling"]);

export const listingQuerySchema = z.object({
  categoryId: z.string().optional(),
  collectionId: z.string().optional(),
  tag: z.string().optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  inStockOnly: z.coerce.boolean().optional(),
  sort: listingSortSchema.default("relevance"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});
export type ListingQueryDto = z.infer<typeof listingQuerySchema>;
export interface ListingQuery extends ListingQueryDto {
  attributes?: Record<string, string[]>;
}

export const suggestQuerySchema = z.object({ q: z.string().min(1) });
export type SuggestQueryDto = z.infer<typeof suggestQuerySchema>;

/** Home page `reviews` block (docs/PROJECT_SPEC.md §9.1): approved reviews from across the store. */
export const listFeaturedReviewsQuerySchema = z.object({
  sort: z.enum(["recent", "top_rated", "with_photos"]).default("recent"),
  minRating: z.coerce.number().int().min(1).max(5).default(4),
  limit: z.coerce.number().int().min(1).max(12).default(6),
});
export type ListFeaturedReviewsQueryDto = z.infer<typeof listFeaturedReviewsQuerySchema>;
