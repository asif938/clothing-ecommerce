import { z } from "zod";

export const completeRefundSchema = z.object({
  externalRef: z.string().min(1).max(120).nullable().default(null),
});
export type CompleteRefundDto = z.infer<typeof completeRefundSchema>;

export const rejectRefundSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type RejectRefundDto = z.infer<typeof rejectRefundSchema>;
