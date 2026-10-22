import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

export const updateAreaSchema = z.object({
  name: localizedTextSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAreaDto = z.infer<typeof updateAreaSchema>;
