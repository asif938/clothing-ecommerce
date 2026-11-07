import { z } from "zod";

export const fitPreferenceSchema = z.enum(["snug", "regular", "loose"]);

export const upsertMeasurementsSchema = z.object({
  unit: z.enum(["cm", "inch"]).default("cm"),
  heightCm: z.number().positive().nullable().optional(),
  weightKg: z.number().positive().nullable().optional(),
  chestCm: z.number().positive().nullable().optional(),
  waistCm: z.number().positive().nullable().optional(),
  hipCm: z.number().positive().nullable().optional(),
  inseamCm: z.number().positive().nullable().optional(),
  preferredFit: fitPreferenceSchema.default("regular"),
});
export type UpsertMeasurementsDto = z.infer<typeof upsertMeasurementsSchema>;

export const recommendSizeSchema = z.object({
  fitPreference: fitPreferenceSchema.optional(),
  measurements: z
    .object({
      heightCm: z.number().positive().optional(),
      weightKg: z.number().positive().optional(),
      chestCm: z.number().positive().optional(),
      waistCm: z.number().positive().optional(),
      hipCm: z.number().positive().optional(),
      inseamCm: z.number().positive().optional(),
    })
    .optional(),
});
export type RecommendSizeDto = z.infer<typeof recommendSizeSchema>;
