import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";
import { updateSchemaFrom } from "../common/zod-update";

export const createReturnReasonSchema = z.object({
  code: z.string().min(1).max(60),
  label: localizedTextSchema,
  defaultPaidBy: z.enum(["customer", "brand"]).default("customer"),
  isActive: z.boolean().default(true),
  position: z.number().int().default(0),
});
export type CreateReturnReasonDto = z.infer<typeof createReturnReasonSchema>;
export const updateReturnReasonSchema = updateSchemaFrom(createReturnReasonSchema);
export type UpdateReturnReasonDto = z.infer<typeof updateReturnReasonSchema>;

const returnItemSchema = z.object({
  orderItemId: z.string().min(1),
  quantity: z.number().int().min(1),
  exchangeForVariantId: z.string().min(1).nullable().default(null),
});

export const createReturnRequestSchema = z.object({
  orderId: z.string().min(1),
  type: z.enum(["refund", "exchange", "store_credit"]),
  reasonCode: z.string().min(1).nullable().default(null),
  customerComment: z.string().max(2000).nullable().default(null),
  mediaIds: z.array(z.string()).default([]),
  items: z.array(returnItemSchema).min(1),
});
export type CreateReturnRequestDto = z.infer<typeof createReturnRequestSchema>;

/** §16 M10 — the guest (phone+order-number-verified) path, closing the gap flagged since M6 ("the order-tracking page links out to login rather than also supporting phone+order-number verification for this one flow"). */
export const createReturnRequestByTrackingSchema = createReturnRequestSchema.omit({ orderId: true }).extend({
  phone: z.string().min(1),
  orderNumber: z.string().min(1),
});
export type CreateReturnRequestByTrackingDto = z.infer<typeof createReturnRequestByTrackingSchema>;

export const approveReturnSchema = z.object({
  returnShippingPaidBy: z.enum(["customer", "brand"]).nullable().default(null),
});
export type ApproveReturnDto = z.infer<typeof approveReturnSchema>;

export const rejectReturnSchema = z.object({
  rejectedReason: z.string().min(1).max(500),
});
export type RejectReturnDto = z.infer<typeof rejectReturnSchema>;

export const inspectReturnSchema = z.object({
  items: z.array(z.object({ orderItemId: z.string().min(1), passed: z.boolean(), restock: z.boolean() })).min(1),
});
export type InspectReturnDto = z.infer<typeof inspectReturnSchema>;
