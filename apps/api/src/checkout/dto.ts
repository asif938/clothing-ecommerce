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
  /** §10.5/§13.3 (M8) — the client pixel's own event id for this purchase, so the server-side CAPI/MP/Events-API copy dispatched later shares it for platform-side dedup; `fbc`/`fbp` are Meta's own click-id/browser-id cookies, read client-side since the server can't see cross-site cookies set by Meta's pixel script. */
  trackingEventId: z.string().max(100).optional(),
  fbc: z.string().max(300).optional(),
  fbp: z.string().max(300).optional(),
  sourceUrl: z.string().url().optional(),
});
export type PlaceOrderDto = z.infer<typeof placeOrderSchema>;

export const trackOrderSchema = z.object({ phone: bdPhoneSchema, orderNumber: z.string().min(1) });
export type TrackOrderDto = z.infer<typeof trackOrderSchema>;
