import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

export const imageTextSchema = z.object({
  imageUrl: z.string().nullable().optional(),
  imageAlt: localizedTextSchema.optional(),
  heading: localizedTextSchema.optional(),
  body: localizedTextSchema,
  imagePosition: z.enum(["left", "right"]).default("left"),
  ctaText: localizedTextSchema.optional(),
  ctaUrl: z.string().optional(),
});
export type ImageTextProps = z.infer<typeof imageTextSchema>;
