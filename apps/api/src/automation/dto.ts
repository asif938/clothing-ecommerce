import { z } from "zod";
import { automationActionSchema, conditionGroupSchema, AUTOMATION_TRIGGER_KEYS } from "@clothing/shared/automation";

export const testRuleSchema = z.object({
  trigger: z.enum(AUTOMATION_TRIGGER_KEYS),
  conditions: conditionGroupSchema,
  actions: z.array(automationActionSchema).default([]),
  orderId: z.string().min(1).optional(),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number()]))])).optional(),
});
export type TestRuleDto = z.infer<typeof testRuleSchema>;

export const setActiveSchema = z.object({ isActive: z.boolean() });
export type SetActiveDto = z.infer<typeof setActiveSchema>;

export const listRunsQuerySchema = z.object({
  ruleId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListRunsQueryDto = z.infer<typeof listRunsQuerySchema>;
