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

export const addItemSchema = z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(100) });
export type AddItemDto = z.infer<typeof addItemSchema>;

export const updateItemSchema = z.object({ quantity: z.number().int().min(0).max(100) });
export type UpdateItemDto = z.infer<typeof updateItemSchema>;

export const setCodesSchema = z.object({ codes: z.array(z.string().min(1).max(40)).max(10) });
export type SetCodesDto = z.infer<typeof setCodesSchema>;

export const setCartAddressSchema = z.object({
  divisionId: z.string().min(1),
  districtId: z.string().min(1),
  areaId: z.string().min(1),
  addressLine: z.string().max(500).optional(),
  landmark: z.string().max(200).optional(),
  contactName: z.string().max(120).optional(),
  contactPhone: bdPhoneSchema.optional(),
  contactEmail: z.string().email().optional(),
});
export type SetCartAddressDto = z.infer<typeof setCartAddressSchema>;

export const selectShippingRateSchema = z.object({ rateId: z.string().min(1) });
export type SelectShippingRateDto = z.infer<typeof selectShippingRateSchema>;

export const setGiftWrapSchema = z.object({ giftWrap: z.boolean() });
export type SetGiftWrapDto = z.infer<typeof setGiftWrapSchema>;

export const setCustomerNoteSchema = z.object({ note: z.string().max(1000).nullable() });
export const setRedeemPointsSchema = z.object({ points: z.number().int().min(0).max(10_000_000) });
export type SetRedeemPointsDto = z.infer<typeof setRedeemPointsSchema>;

export type SetCustomerNoteDto = z.infer<typeof setCustomerNoteSchema>;

/** §16 M16 — null removes the gift card. */
export const setGiftCardSchema = z.object({ code: z.string().trim().min(4).max(40).nullable() });
export type SetGiftCardDto = z.infer<typeof setGiftCardSchema>;

export const setUseStoreCreditSchema = z.object({ use: z.boolean() });
export type SetUseStoreCreditDto = z.infer<typeof setUseStoreCreditSchema>;

export const setReferralCodeSchema = z.object({ code: z.string().trim().min(4).max(20).nullable() });
export type SetReferralCodeDto = z.infer<typeof setReferralCodeSchema>;

export const setAffiliateSchema = z.object({ code: z.string().trim().min(1).max(40) });
export type SetAffiliateDto = z.infer<typeof setAffiliateSchema>;
