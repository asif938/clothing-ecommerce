import { z } from "zod";
import { normalizeBdPhone } from "@clothing/shared";
import { isAffiliateCodeShape, normalizeAffiliateCode } from "@clothing/shared/rewards";

const bdPhoneSchema = z.string().transform((v, ctx) => {
  const normalized = normalizeBdPhone(v);
  if (!normalized) {
    ctx.addIssue({ code: "custom", message: "Not a valid Bangladesh mobile number" });
    return z.NEVER;
  }
  return normalized;
});

export const affiliateCodeSchema = z
  .string()
  .transform(normalizeAffiliateCode)
  .refine(isAffiliateCodeShape, "3–24 letters, numbers, dash or underscore");

export const affiliateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    code: affiliateCodeSchema,
    phone: bdPhoneSchema.nullable().optional(),
    email: z.string().trim().email().max(200).nullable().optional(),
    /** An existing coupon whose orders count for this affiliate. */
    discountId: z.string().min(1).nullable().optional(),
    commissionType: z.enum(["percent", "fixed"]),
    /** Percent in basis points (1000 = 10%) or poisha per order. */
    commissionValue: z.number().int().min(0).max(100_000_000),
    attributionDays: z.number().int().min(1).max(365).nullable().optional(),
    status: z.enum(["active", "paused"]).default("active"),
    payoutMethod: z.string().trim().max(60).nullable().optional(),
    payoutDetails: z.string().trim().max(300).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((v) => v.commissionType === "fixed" || v.commissionValue <= 10_000, { message: "A percent commission can't exceed 100%", path: ["commissionValue"] });
export type AffiliateDto = z.infer<typeof affiliateSchema>;

export const payoutSchema = z.object({
  method: z.string().trim().min(1).max(60),
  externalRef: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});
export type PayoutDto = z.infer<typeof payoutSchema>;

export const rejectConversionSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export type RejectConversionDto = z.infer<typeof rejectConversionSchema>;

export const conversionsQuerySchema = z.object({
  affiliateId: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected", "paid"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type ConversionsQueryDto = z.infer<typeof conversionsQuerySchema>;

export const affiliateClickSchema = z.object({ code: z.string().trim().min(1).max(40) });
export type AffiliateClickDto = z.infer<typeof affiliateClickSchema>;
