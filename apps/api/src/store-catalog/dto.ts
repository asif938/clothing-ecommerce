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
