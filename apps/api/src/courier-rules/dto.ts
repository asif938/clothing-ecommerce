import { z } from "zod";
import { conditionGroupSchema } from "@clothing/shared/automation";

export const courierRuleInputSchema = z.object({
  name: z.string().min(1).max(120),
  priority: z.number().int().min(1).max(10000).default(100),
  conditions: conditionGroupSchema,
  courierProviderInstanceId: z.string().min(1),
  isActive: z.boolean().default(true),
});
export type CourierRuleInput = z.infer<typeof courierRuleInputSchema>;
