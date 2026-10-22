import { z } from "zod";

export const updateSettingSchema = z.object({ value: z.unknown() });
export type UpdateSettingDto = z.infer<typeof updateSettingSchema>;
