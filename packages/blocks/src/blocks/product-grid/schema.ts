import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

export const productGridSourceSchema = z.enum(["manual", "category", "collection", "tag", "new_arrivals", "best_sellers", "on_sale"]);

export const productGridSchema = z.object({
  heading: localizedTextSchema.optional(),
  source: productGridSourceSchema,
  sourceId: z.string().optional(),
  productIds: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(24).default(8),
});
export type ProductGridProps = z.infer<typeof productGridSchema>;
