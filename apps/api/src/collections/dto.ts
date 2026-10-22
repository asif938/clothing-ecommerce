import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared/i18n";

const ruleConditionSchema = z.object({
  field: z.enum(["category", "tag", "price", "attribute", "status"]),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains"]),
  value: z.unknown(),
});

const collectionRulesSchema = z.object({ match: z.enum(["all", "any"]), conditions: z.array(ruleConditionSchema) });

export const createCollectionSchema = z.object({
  name: localizedTextSchema,
  slug: z.string().min(1).optional(),
  description: localizedTextSchema.optional(),
  imageMediaId: z.string().nullable().optional(),
  bannerMediaId: z.string().nullable().optional(),
  type: z.enum(["manual", "automatic"]).optional(),
  rules: collectionRulesSchema.nullable().optional(),
  sortMode: z.string().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  seoTitle: localizedTextSchema.optional(),
  seoDescription: localizedTextSchema.optional(),
});
export type CreateCollectionDto = z.infer<typeof createCollectionSchema>;

export const updateCollectionSchema = createCollectionSchema.partial();
export type UpdateCollectionDto = z.infer<typeof updateCollectionSchema>;

export const previewRulesSchema = z.object({ rules: collectionRulesSchema });
export type PreviewRulesDto = z.infer<typeof previewRulesSchema>;

export const addCollectionProductSchema = z.object({ productId: z.string().min(1), position: z.number().int().optional() });
export type AddCollectionProductDto = z.infer<typeof addCollectionProductSchema>;

export const reorderCollectionProductsSchema = z.object({ productIds: z.array(z.string()).min(1) });
export type ReorderCollectionProductsDto = z.infer<typeof reorderCollectionProductsSchema>;
