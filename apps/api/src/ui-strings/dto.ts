import { z } from "zod";

export const updateUiStringSchema = z.object({
  bn: z.string().min(1),
  en: z.string().min(1),
});
export type UpdateUiStringDto = z.infer<typeof updateUiStringSchema>;
