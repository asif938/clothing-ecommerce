import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

export const heroSchema = z.object({
  heading: localizedTextSchema,
  subheading: localizedTextSchema.optional(),
  ctaText: localizedTextSchema.optional(),
  ctaUrl: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  imageAlt: localizedTextSchema.optional(),
  align: z.enum(["left", "center", "right"]).default("left"),
});
export type HeroProps = z.infer<typeof heroSchema>;
