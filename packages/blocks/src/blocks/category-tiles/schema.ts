import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

export const categoryTilesSchema = z.object({
  heading: localizedTextSchema.optional(),
  categoryIds: z.array(z.string()).default([]),
});
export type CategoryTilesProps = z.infer<typeof categoryTilesSchema>;
