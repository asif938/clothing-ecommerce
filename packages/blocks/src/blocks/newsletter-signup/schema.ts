import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

export const newsletterSignupSchema = z.object({
  heading: localizedTextSchema.optional(),
  body: localizedTextSchema.optional(),
});
export type NewsletterSignupProps = z.infer<typeof newsletterSignupSchema>;
