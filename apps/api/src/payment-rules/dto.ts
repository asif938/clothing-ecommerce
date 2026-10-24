import { z } from "zod";

const conditionsSchema = z.record(z.string(), z.unknown());
const actionSchema = z.object({
  type: z.enum(["disable_cod", "disable_method", "require_advance", "require_otp", "require_manual_review", "block_order", "show_message"]),
  method: z.string().optional(),
  kind: z.enum(["delivery_fee", "fixed", "percent", "full"]).optional(),
  amount: z.number().int().optional(),
  percent: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
});

export const createPaymentRuleSchema = z.object({
  name: z.string().min(1).max(160),
  priority: z.number().int().default(0),
  isActive: z.boolean().default(true),
  conditions: conditionsSchema.default({}),
  actions: z.array(actionSchema).default([]),
  stopProcessing: z.boolean().default(false),
});
export type CreatePaymentRuleDto = z.infer<typeof createPaymentRuleSchema>;
export const updatePaymentRuleSchema = createPaymentRuleSchema.partial();
export type UpdatePaymentRuleDto = z.infer<typeof updatePaymentRuleSchema>;
