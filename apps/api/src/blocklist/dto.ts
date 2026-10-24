import { z } from "zod";

export const createBlocklistEntrySchema = z.object({
  type: z.enum(["phone", "ip", "device", "email", "address_keyword"]),
  value: z.string().min(1).max(200),
  reason: z.string().max(500).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});
export type CreateBlocklistEntryDto = z.infer<typeof createBlocklistEntrySchema>;
