import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

const bannerItemSchema = z.object({
  imageUrl: z.string().nullable().optional(),
  text: localizedTextSchema.optional(),
  linkUrl: z.string().optional(),
});

export const bannerStripSchema = z.object({ items: z.array(bannerItemSchema).max(4).default([]) });
export type BannerStripProps = z.infer<typeof bannerStripSchema>;
