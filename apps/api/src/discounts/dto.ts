import { z } from "zod";
import { updateSchemaFrom } from "../common/zod-update";

const conditionsSchema = z
  .object({
    minSubtotal: z.number().int().min(0).optional(),
    minQty: z.number().int().min(0).optional(),
    includeCategoryIds: z.array(z.string()).optional(),
    excludeCategoryIds: z.array(z.string()).optional(),
    includeProductIds: z.array(z.string()).optional(),
    excludeProductIds: z.array(z.string()).optional(),
    includeTags: z.array(z.string()).optional(),
    excludeTags: z.array(z.string()).optional(),
    firstOrderOnly: z.boolean().optional(),
    channels: z.array(z.string()).optional(),
  })
  .partial();

const limitsSchema = z
  .object({
    totalUses: z.number().int().min(1).optional(),
    perCustomer: z.number().int().min(1).optional(),
    perPhone: z.number().int().min(1).optional(),
  })
  .partial();

const combinableWithSchema = z.object({ automatic: z.boolean().optional(), codes: z.boolean().optional() }).partial();

export const createDiscountSchema = z.object({
  name: z.string().min(1).max(160),
  type: z.enum(["code", "automatic"]),
  code: z.string().min(2).max(40).toUpperCase().nullable().optional(),
  valueType: z.enum(["percent", "fixed", "free_shipping"]),
  value: z.number().int().min(0).default(0),
  conditions: conditionsSchema.nullable().optional(),
  limits: limitsSchema.nullable().optional(),
  combinableWith: combinableWithSchema.nullable().optional(),
  priority: z.number().int().default(0),
  marginGuardOverride: z.boolean().default(false),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  status: z.enum(["draft", "active", "scheduled", "expired", "disabled"]).default("draft"),
});
export type CreateDiscountDto = z.infer<typeof createDiscountSchema>;
export const updateDiscountSchema = updateSchemaFrom(createDiscountSchema);
export type UpdateDiscountDto = z.infer<typeof updateDiscountSchema>;

export const generateBulkCodesSchema = z.object({
  count: z.number().int().min(1).max(5000),
  prefix: z.string().max(20).optional(),
  codeLength: z.number().int().min(4).max(20).default(8),
});
export type GenerateBulkCodesDto = z.infer<typeof generateBulkCodesSchema>;

export const createFlashSaleSchema = z.object({
  name: z.record(z.string(), z.string()),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  status: z.enum(["scheduled", "active", "ended", "disabled"]).default("scheduled"),
  bannerText: z.record(z.string(), z.string()).nullable().optional(),
  items: z
    .array(z.object({ variantId: z.string().min(1), salePrice: z.number().int().min(0), stockCap: z.number().int().min(0).nullable().optional() }))
    .default([]),
});
export type CreateFlashSaleDto = z.infer<typeof createFlashSaleSchema>;
export const updateFlashSaleSchema = updateSchemaFrom(createFlashSaleSchema);
export type UpdateFlashSaleDto = z.infer<typeof updateFlashSaleSchema>;
