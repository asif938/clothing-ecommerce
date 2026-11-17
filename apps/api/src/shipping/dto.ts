import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";
import { updateSchemaFrom } from "../common/zod-update";

export const createZoneSchema = z.object({
  name: z.string().min(1).max(120),
  priority: z.number().int().default(0),
  matchDivisionIds: z.array(z.string()).default([]),
  matchDistrictIds: z.array(z.string()).default([]),
  matchAreaIds: z.array(z.string()).default([]),
  matchDhakaCity: z.boolean().default(false),
  isCatchAll: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type CreateZoneDto = z.infer<typeof createZoneSchema>;
export const updateZoneSchema = updateSchemaFrom(createZoneSchema);
export type UpdateZoneDto = z.infer<typeof updateZoneSchema>;

export const createRateSchema = z.object({
  name: localizedTextSchema,
  baseFee: z.number().int().min(0),
  includedWeightGrams: z.number().int().min(0).default(1000),
  extraFeePerStep: z.number().int().min(0).default(0),
  weightStepGrams: z.number().int().min(1).default(1000),
  freeOverAmount: z.number().int().min(0).nullable().default(null),
  minOrder: z.number().int().min(0).nullable().default(null),
  maxOrder: z.number().int().min(0).nullable().default(null),
  estimatedDaysMin: z.number().int().min(0).default(1),
  estimatedDaysMax: z.number().int().min(0).default(3),
  isActive: z.boolean().default(true),
  position: z.number().int().default(0),
});
export type CreateRateDto = z.infer<typeof createRateSchema>;
export const updateRateSchema = updateSchemaFrom(createRateSchema);
export type UpdateRateDto = z.infer<typeof updateRateSchema>;

export const shippingQuoteQuerySchema = z.object({
  divisionId: z.string().min(1),
  districtId: z.string().min(1),
  areaId: z.string().min(1),
  weightGrams: z.coerce.number().int().min(0).default(0),
  subtotal: z.coerce.number().int().min(0).default(0),
});
export type ShippingQuoteQuery = z.infer<typeof shippingQuoteQuerySchema>;
