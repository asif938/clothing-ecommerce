import { z } from "zod";
import { normalizeBdPhone } from "@clothing/shared";

const bdPhoneSchema = z.string().transform((v, ctx) => {
  const normalized = normalizeBdPhone(v);
  if (!normalized) {
    ctx.addIssue({ code: "custom", message: "Not a valid Bangladesh mobile number" });
    return z.NEVER;
  }
  return normalized;
});

export const listOrdersQuerySchema = z.object({
  status: z.string().optional(),
  paymentStatus: z.string().optional(),
  riskLevel: z.string().optional(),
  assignedTo: z.string().optional(),
  tag: z.string().optional(),
  duplicatesOnly: z.coerce.boolean().optional(),
  search: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListOrdersQueryDto = z.infer<typeof listOrdersQuerySchema>;

export const manualOrderItemSchema = z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1) });

export const createManualOrderSchema = z.object({
  channel: z.enum(["phone", "messenger", "whatsapp", "admin"]).default("phone"),
  customerPhone: bdPhoneSchema,
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email().nullable().default(null),
  divisionId: z.string().min(1),
  districtId: z.string().min(1),
  areaId: z.string().min(1),
  addressLine: z.string().min(1).max(500),
  landmark: z.string().max(200).nullable().default(null),
  items: z.array(manualOrderItemSchema).min(1),
  manualDiscountAmount: z.number().int().min(0).default(0),
  shippingRateId: z.string().nullable().default(null),
  payment: z.discriminatedUnion("status", [
    z.object({ status: z.literal("cod") }),
    z.object({ status: z.literal("already_paid"), method: z.enum(["bkash", "nagad", "cod", "sslcommerz", "mock"]), externalRef: z.string().max(120).nullable().default(null) }),
  ]),
  customerNote: z.string().max(1000).nullable().default(null),
});
export type CreateManualOrderDto = z.infer<typeof createManualOrderSchema>;

export const addNoteSchema = z.object({ note: z.string().min(1).max(2000) });
export type AddNoteDto = z.infer<typeof addNoteSchema>;

export const addCallOutcomeSchema = z.object({
  outcome: z.enum(["no_answer", "confirmed", "call_later", "wrong_number", "cancelled"]),
  note: z.string().max(1000).nullable().default(null),
});
export type AddCallOutcomeDto = z.infer<typeof addCallOutcomeSchema>;

export const assignOrderSchema = z.object({ staffId: z.string().nullable() });
export type AssignOrderDto = z.infer<typeof assignOrderSchema>;

export const setTagsSchema = z.object({ tags: z.array(z.string().min(1).max(40)).max(20) });
export type SetTagsDto = z.infer<typeof setTagsSchema>;

export const transitionOrderSchema = z.object({
  to: z.enum(["confirmed", "on_hold", "processing", "cancelled", "pending"]),
  reason: z.string().max(500).nullable().default(null),
});
export type TransitionOrderDto = z.infer<typeof transitionOrderSchema>;

export const addManualPaymentSchema = z.object({
  method: z.enum(["cod", "mock", "sslcommerz", "bkash", "nagad", "store_credit"]),
  purpose: z.enum(["full", "advance", "balance"]),
  amount: z.number().int().min(1),
  externalRef: z.string().max(120).nullable().default(null),
});
export type AddManualPaymentDto = z.infer<typeof addManualPaymentSchema>;

const editOrderItemSchema = z.object({
  orderItemId: z.string().nullable(), // null => a new line
  variantId: z.string().min(1).optional(), // required when orderItemId is null
  quantity: z.number().int().min(0),
  unitPriceOverride: z.number().int().min(0).nullable().default(null),
});

export const editOrderSchema = z.object({
  items: z.array(editOrderItemSchema).optional(),
  address: z
    .object({ divisionId: z.string().min(1), districtId: z.string().min(1), areaId: z.string().min(1), addressLine: z.string().min(1), landmark: z.string().nullable().default(null) })
    .optional(),
  shippingFeeOverride: z.number().int().min(0).nullable().optional(),
  reason: z.string().min(1).max(500),
});
export type EditOrderDto = z.infer<typeof editOrderSchema>;

export const bulkActionSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(["confirm", "cancel", "tag", "assign"]),
  reason: z.string().max(500).nullable().default(null),
  tag: z.string().max(40).nullable().default(null),
  staffId: z.string().nullable().default(null),
});
export type BulkActionDto = z.infer<typeof bulkActionSchema>;
