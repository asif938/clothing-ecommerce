import { z } from "zod";

export const createNotifyMeSchema = z
  .object({
    variantId: z.string().min(1),
    contactPhone: z.string().optional(),
    contactEmail: z.string().email().optional(),
    channel: z.enum(["sms", "email"]),
  })
  .refine((dto) => (dto.channel === "sms" ? !!dto.contactPhone : !!dto.contactEmail), {
    message: "contactPhone is required for sms, contactEmail is required for email",
  });
export type CreateNotifyMeDto = z.infer<typeof createNotifyMeSchema>;
