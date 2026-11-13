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

const optionalEmail = z
  .string()
  .trim()
  .email()
  .max(200)
  .optional()
  .or(z.literal("").transform(() => undefined));

/** Staff issuing a card by hand (compensation, giveaways, offline sales). */
export const issueGiftCardSchema = z
  .object({
    amount: z.number().int().min(100).max(100_000_000),
    /** ISO date; omitted = the `giftCards.expiryMonths` default; null = never expires. */
    expiresAt: z.string().date().nullable().optional(),
    recipientName: z.string().trim().max(120).optional(),
    recipientPhone: bdPhoneSchema.optional(),
    recipientEmail: optionalEmail,
    message: z.string().trim().max(300).optional(),
    locale: z.enum(["bn", "en"]).default("bn"),
    /** Send the code to the recipient now (needs a phone or email). */
    send: z.boolean().default(true),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => !v.send || v.recipientPhone || v.recipientEmail, { message: "Add a phone or email to send the card", path: ["recipientPhone"] });
export type IssueGiftCardDto = z.infer<typeof issueGiftCardSchema>;

export const adjustGiftCardSchema = z.object({
  amount: z
    .number()
    .int()
    .refine((v) => v !== 0, "Amount can't be zero")
    .refine((v) => Math.abs(v) <= 100_000_000, "Amount too large"),
  note: z.string().trim().min(3).max(300),
});
export type AdjustGiftCardDto = z.infer<typeof adjustGiftCardSchema>;

export const setGiftCardStatusSchema = z.object({ status: z.enum(["active", "disabled"]), note: z.string().trim().max(300).optional() });
export type SetGiftCardStatusDto = z.infer<typeof setGiftCardStatusSchema>;

export const reissueGiftCardSchema = z.object({
  recipientPhone: bdPhoneSchema.optional(),
  recipientEmail: optionalEmail,
});
export type ReissueGiftCardDto = z.infer<typeof reissueGiftCardSchema>;

export const listGiftCardsSchema = z.object({
  status: z.enum(["pending", "active", "disabled", "redeemed", "expired", "cancelled"]).optional(),
  /** Last 4 characters of a code, or a purchaser/recipient phone. */
  q: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type ListGiftCardsDto = z.infer<typeof listGiftCardsSchema>;

/** Storefront: buy a digital gift card (§7.3 `/gift-cards`). Paid online only — there's nothing to collect cash for at a door. */
export const purchaseGiftCardSchema = z.object({
  amount: z.number().int().min(100).max(100_000_000),
  paymentMethod: z.enum(["mock", "sslcommerz", "bkash", "nagad"]),
  purchaserName: z.string().trim().min(1).max(120),
  purchaserPhone: bdPhoneSchema,
  purchaserEmail: optionalEmail,
  recipientName: z.string().trim().min(1).max(120),
  recipientPhone: bdPhoneSchema.optional(),
  recipientEmail: optionalEmail,
  message: z.string().trim().max(300).optional(),
  locale: z.enum(["bn", "en"]).default("bn"),
}).refine((v) => v.recipientPhone || v.recipientEmail, { message: "Add the recipient's phone or email", path: ["recipientPhone"] });
export type PurchaseGiftCardDto = z.infer<typeof purchaseGiftCardSchema>;

export const giftCardCodeSchema = z.object({ code: z.string().trim().min(4).max(40) });
export type GiftCardCodeDto = z.infer<typeof giftCardCodeSchema>;
