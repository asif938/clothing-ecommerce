import { z } from "zod";

/** DTOs for the M12 stock operations (transfers, stock takes) and inventory analysis. */

const uniqueVariants = (items: { variantId: string }[]) => new Set(items.map((i) => i.variantId)).size === items.length;
const quantityLines = z
  .array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(1_000_000) }))
  .min(1)
  .max(1000)
  .refine(uniqueVariants, "Each variant may appear only once");

export const createTransferSchema = z
  .object({
    fromLocationId: z.string().min(1),
    toLocationId: z.string().min(1),
    note: z.string().trim().max(500).nullable().optional(),
    items: quantityLines,
  })
  .refine((dto) => dto.fromLocationId !== dto.toLocationId, { message: "Source and destination must differ", path: ["toLocationId"] });
export type CreateTransferDto = z.infer<typeof createTransferSchema>;

export const updateTransferSchema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
  items: quantityLines.optional(),
});
export type UpdateTransferDto = z.infer<typeof updateTransferSchema>;

export const receiveTransferSchema = z.object({
  /** Per-line quantities actually received; omitted lines are received in full. */
  lines: z
    .array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(0) }))
    .refine(uniqueVariants, "Each variant may appear only once")
    .optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type ReceiveTransferDto = z.infer<typeof receiveTransferSchema>;

export const listTransfersQuerySchema = z.object({ status: z.enum(["draft", "in_transit", "received", "cancelled"]).optional() });
export type ListTransfersQueryDto = z.infer<typeof listTransfersQuerySchema>;

export const createStockTakeSchema = z.object({
  locationId: z.string().min(1),
  note: z.string().trim().max(500).nullable().optional(),
  /** Limit the count to these products (a partial/cycle count); omitted = every variant at the location. */
  productIds: z.array(z.string().min(1)).max(500).optional(),
});
export type CreateStockTakeDto = z.infer<typeof createStockTakeSchema>;

export const countLinesSchema = z.object({
  lines: z
    .array(z.object({ variantId: z.string().min(1), countedQty: z.number().int().min(0).nullable() }))
    .min(1)
    .max(2000)
    .refine(uniqueVariants, "Each variant may appear only once"),
});
export type CountLinesDto = z.infer<typeof countLinesSchema>;

export const scanSchema = z.object({
  code: z.string().trim().min(1).max(100),
  quantity: z.number().int().min(-1000).max(1000).refine((n) => n !== 0).default(1),
});
export type ScanDto = z.infer<typeof scanSchema>;

export const applyStockTakeSchema = z.object({
  /** Treat lines nobody counted as counted zero (a full wall-to-wall count); default leaves them untouched. */
  zeroUncounted: z.boolean().default(false),
});
export type ApplyStockTakeDto = z.infer<typeof applyStockTakeSchema>;

export const listStockTakesQuerySchema = z.object({ status: z.enum(["counting", "applied", "cancelled"]).optional() });
export type ListStockTakesQueryDto = z.infer<typeof listStockTakesQuerySchema>;

export const sizeCurveQuerySchema = z
  .object({
    productId: z.string().optional(),
    categoryId: z.string().optional(),
    days: z.coerce.number().int().min(7).max(730).optional(),
    buyQuantity: z.coerce.number().int().min(0).max(1_000_000).default(0),
  })
  .refine((q) => !!q.productId !== !!q.categoryId, "Pass exactly one of productId or categoryId");
export type SizeCurveQueryDto = z.infer<typeof sizeCurveQuerySchema>;

export const deadStockQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(730).optional(),
  locationId: z.string().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});
export type DeadStockQueryDto = z.infer<typeof deadStockQuerySchema>;

export const applyMarkdownsSchema = z.object({
  items: z
    .array(z.object({ variantId: z.string().min(1), newPrice: z.number().int().min(0) }))
    .min(1)
    .max(500)
    .refine(uniqueVariants, "Each variant may appear only once"),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().nullable().optional(),
});
export type ApplyMarkdownsDto = z.infer<typeof applyMarkdownsSchema>;
