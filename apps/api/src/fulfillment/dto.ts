import { z } from "zod";

export const completePackingSchema = z.object({
  scannedItems: z.array(z.object({ orderItemId: z.string().min(1), scannedQuantity: z.number().int().min(0) })).default([]),
});
export type CompletePackingDto = z.infer<typeof completePackingSchema>;

export const handoverManifestQuerySchema = z.object({
  courierProviderInstanceId: z.string().nullable().default(null),
});
export type HandoverManifestQueryDto = z.infer<typeof handoverManifestQuerySchema>;

export const markHandedOverSchema = z.object({
  shipmentIds: z.array(z.string().min(1)).min(1),
});
export type MarkHandedOverDto = z.infer<typeof markHandedOverSchema>;
