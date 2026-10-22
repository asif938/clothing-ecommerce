import { z } from "zod";

export const createStockLocationSchema = z.object({
  name: z.string().min(1),
  address: z.record(z.string(), z.unknown()).nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  fulfillsOnline: z.boolean().optional(),
});
export type CreateStockLocationDto = z.infer<typeof createStockLocationSchema>;

export const updateStockLocationSchema = createStockLocationSchema.partial();
export type UpdateStockLocationDto = z.infer<typeof updateStockLocationSchema>;

export const stockMovementReasonSchema = z.enum([
  "sale",
  "cancel",
  "return_restock",
  "damage",
  "adjustment",
  "transfer_in",
  "transfer_out",
  "purchase_receive",
  "stock_take",
]);

export const adjustStockSchema = z.object({
  variantId: z.string().min(1),
  locationId: z.string().min(1),
  quantityDelta: z.number().int().refine((n) => n !== 0, "quantityDelta must not be zero"),
  reason: stockMovementReasonSchema,
  note: z.string().nullable().optional(),
});
export type AdjustStockDto = z.infer<typeof adjustStockSchema>;

export const updateLowStockThresholdSchema = z.object({ lowStockThreshold: z.number().int().min(0).nullable() });
export type UpdateLowStockThresholdDto = z.infer<typeof updateLowStockThresholdSchema>;

export const listInventoryQuerySchema = z.object({
  variantId: z.string().optional(),
  locationId: z.string().optional(),
  lowStockOnly: z.coerce.boolean().optional(),
});
export type ListInventoryQueryDto = z.infer<typeof listInventoryQuerySchema>;

export const listMovementsQuerySchema = z.object({
  variantId: z.string().optional(),
  locationId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});
export type ListMovementsQueryDto = z.infer<typeof listMovementsQuerySchema>;

export const barcodeLabelsQuerySchema = z.object({
  variantIds: z.string().min(1), // comma-separated
});
export type BarcodeLabelsQueryDto = z.infer<typeof barcodeLabelsQuerySchema>;
