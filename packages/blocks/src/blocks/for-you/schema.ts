import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

/** §9.1 phase-2 block "personalized 'for you'" (§16 M14). */
export const forYouSchema = z.object({
  heading: localizedTextSchema.optional(),
  /** Shown instead of `heading` when the visitor has no history yet (the list is best sellers then). */
  fallbackHeading: localizedTextSchema.optional(),
  limit: z.number().int().min(2).max(24).default(8),
});
export type ForYouProps = z.infer<typeof forYouSchema>;
