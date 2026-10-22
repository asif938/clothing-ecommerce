import { z } from "zod";
import { PROVIDER_CAPABILITIES } from "@clothing/shared/providers";

export const createProviderInstanceSchema = z.object({
  capability: z.enum(PROVIDER_CAPABILITIES),
  driver: z.string().min(1),
  name: z.string().min(1).max(100),
  enabled: z.boolean().default(false),
  mode: z.enum(["sandbox", "live"]).default("sandbox"),
  isDefault: z.boolean().default(false),
  priority: z.number().int().default(0),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type CreateProviderInstanceDto = z.infer<typeof createProviderInstanceSchema>;

export const updateProviderInstanceSchema = createProviderInstanceSchema.partial().omit({ capability: true, driver: true });
export type UpdateProviderInstanceDto = z.infer<typeof updateProviderInstanceSchema>;
