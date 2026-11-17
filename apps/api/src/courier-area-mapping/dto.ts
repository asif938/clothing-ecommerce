import { z } from "zod";
import { updateSchemaFrom } from "../common/zod-update";

export const createCourierAreaMappingSchema = z.object({
  courierProviderInstanceId: z.string().min(1),
  divisionId: z.string().min(1),
  districtId: z.string().min(1),
  areaId: z.string().nullable().default(null),
  courierAreaCode: z.string().min(1),
  courierAreaName: z.string().nullable().default(null),
});
export type CreateCourierAreaMappingDto = z.infer<typeof createCourierAreaMappingSchema>;
export const updateCourierAreaMappingSchema = updateSchemaFrom(createCourierAreaMappingSchema);
export type UpdateCourierAreaMappingDto = z.infer<typeof updateCourierAreaMappingSchema>;
