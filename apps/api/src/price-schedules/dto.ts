import { z } from "zod";

export const priceScheduleTargetTypeSchema = z.enum(["variant", "product", "collection", "category", "tag"]);

export const createPriceScheduleSchema = z
  .object({
    targetType: priceScheduleTargetTypeSchema,
    targetId: z.string().min(1),
    newPrice: z.number().int().min(0).nullable().optional(),
    percentChange: z.number().nullable().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().nullable().optional(),
    revertOnEnd: z.boolean().optional(),
  })
  .refine((dto) => dto.newPrice !== undefined && dto.newPrice !== null || dto.percentChange !== undefined && dto.percentChange !== null, {
    message: "Either newPrice or percentChange is required",
  });
export type CreatePriceScheduleDto = z.infer<typeof createPriceScheduleSchema>;
