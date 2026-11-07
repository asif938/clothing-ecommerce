import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

export const lookbookHotspotSchema = z.object({
  id: z.string().min(1),
  xPercent: z.number().min(0).max(100),
  yPercent: z.number().min(0).max(100),
  productId: z.string().min(1),
});
export type LookbookHotspot = z.infer<typeof lookbookHotspotSchema>;

export const lookbookSchema = z.object({
  heading: localizedTextSchema.optional(),
  imageUrl: z.string().nullable().default(null),
  imageAlt: localizedTextSchema.optional(),
  hotspots: z.array(lookbookHotspotSchema).default([]),
});
export type LookbookProps = z.infer<typeof lookbookSchema>;
