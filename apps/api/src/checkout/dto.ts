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

export const placeOrderSchema = z.object({
  paymentMethod: z.enum(["cod", "mock", "sslcommerz", "bkash", "nagad"]),
  /** Only used when `paymentMethod: "cod"` and a payment rule requires an advance — which online method collects it. */
  advanceMethod: z.enum(["mock", "sslcommerz", "bkash", "nagad"]).default("mock"),
  otpCode: z.string().min(4).max(6).optional(),
  termsAccepted: z.boolean().default(false),
  turnstileToken: z.string().optional(),
  deviceId: z.string().max(200).optional(),
  utmSource: z.string().max(100).optional(),
});
export type PlaceOrderDto = z.infer<typeof placeOrderSchema>;

export const trackOrderSchema = z.object({ phone: bdPhoneSchema, orderNumber: z.string().min(1) });
export type TrackOrderDto = z.infer<typeof trackOrderSchema>;
