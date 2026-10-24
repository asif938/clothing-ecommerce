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

export const upsertAddressSchema = z.object({
  label: z.string().max(40).nullable().optional(),
  recipientName: z.string().min(1).max(120),
  phone: bdPhoneSchema,
  altPhone: bdPhoneSchema.nullable().optional(),
  divisionId: z.string().min(1),
  districtId: z.string().min(1),
  areaId: z.string().min(1),
  addressLine: z.string().min(1).max(500),
  landmark: z.string().max(200).nullable().optional(),
  isDefault: z.boolean().default(false),
});
export type UpsertAddressDto = z.infer<typeof upsertAddressSchema>;
