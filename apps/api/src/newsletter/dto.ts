import { z } from "zod";

export const subscribeNewsletterSchema = z.object({
  email: z.string().email(),
  locale: z.string().optional(),
});
export type SubscribeNewsletterDto = z.infer<typeof subscribeNewsletterSchema>;
