import { z } from "zod";

const optionalText = z.string().trim().max(2000).nullable().optional();

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: optionalText,
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().nullable().optional().or(z.literal("").transform(() => null)),
  address: optionalText,
  notes: optionalText,
  isActive: z.boolean().optional(),
});
export type SupplierDto = z.infer<typeof supplierSchema>;
export const updateSupplierSchema = supplierSchema.partial();
export type UpdateSupplierDto = z.infer<typeof updateSupplierSchema>;

const poItemSchema = z.object({
  variantId: z.string().min(1),
  qtyOrdered: z.number().int().min(1).max(1_000_000),
  // Poisha (golden rule 3).
  unitCost: z.number().int().min(0),
});

const uniqueVariants = (items: { variantId: string }[]) => new Set(items.map((i) => i.variantId)).size === items.length;

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  type: z.enum(["purchase", "production"]).default("purchase"),
  locationId: z.string().min(1),
  expectedAt: z.coerce.date().nullable().optional(),
  notes: optionalText,
  items: z.array(poItemSchema).min(1).max(500).refine(uniqueVariants, "Each variant may appear only once"),
});
export type CreatePurchaseOrderDto = z.infer<typeof createPurchaseOrderSchema>;

export const updatePurchaseOrderSchema = z.object({
  supplierId: z.string().min(1).optional(),
  type: z.enum(["purchase", "production"]).optional(),
  locationId: z.string().min(1).optional(),
  expectedAt: z.coerce.date().nullable().optional(),
  notes: optionalText,
  items: z.array(poItemSchema).min(1).max(500).refine(uniqueVariants, "Each variant may appear only once").optional(),
});
export type UpdatePurchaseOrderDto = z.infer<typeof updatePurchaseOrderSchema>;

export const receivePurchaseOrderSchema = z.object({
  lines: z
    .array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1) }))
    .min(1)
    .refine(uniqueVariants, "Each variant may appear only once"),
  allowOverReceipt: z.boolean().default(false),
  note: z.string().trim().max(500).nullable().optional(),
});
export type ReceivePurchaseOrderDto = z.infer<typeof receivePurchaseOrderSchema>;

export const listPurchaseOrdersQuerySchema = z.object({
  status: z.enum(["draft", "sent", "partially_received", "received", "cancelled"]).optional(),
  supplierId: z.string().optional(),
});
export type ListPurchaseOrdersQueryDto = z.infer<typeof listPurchaseOrdersQuerySchema>;
