import { z } from "zod";

export const listCustomersQuerySchema = z.object({
  search: z.string().optional(),
  minSpent: z.coerce.number().int().min(0).optional(),
  minOrders: z.coerce.number().int().min(0).optional(),
  tag: z.string().optional(),
  status: z.enum(["active", "blocked"]).optional(),
  minRiskScore: z.coerce.number().int().min(0).optional(),
  segmentId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListCustomersQueryDto = z.infer<typeof listCustomersQuerySchema>;

export const updateCustomerSchema = z.object({
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["active", "blocked"]).optional(),
});
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;

export const blockCustomerSchema = z.object({
  reason: z.string().max(500).nullable().optional(),
});
export type BlockCustomerDto = z.infer<typeof blockCustomerSchema>;

export const mergeCustomersSchema = z.object({
  keepCustomerId: z.string().min(1),
  mergeCustomerId: z.string().min(1),
});
export type MergeCustomersDto = z.infer<typeof mergeCustomersSchema>;

const segmentRuleConditionSchema = z.object({
  field: z.enum(["totalSpent", "ordersCount", "deliveredCount", "rejectedAtDoorCount", "riskScore", "tag", "status", "inactiveDays", "districtId"]),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "in"]),
  value: z.unknown(),
});

export const segmentRulesSchema = z.object({
  match: z.enum(["all", "any"]),
  conditions: z.array(segmentRuleConditionSchema).default([]),
});

export const createSegmentSchema = z.object({
  name: z.record(z.string(), z.string()),
  rules: segmentRulesSchema,
  isDynamic: z.boolean().default(true),
});
export type CreateSegmentDto = z.infer<typeof createSegmentSchema>;
export const updateSegmentSchema = createSegmentSchema.partial();
export type UpdateSegmentDto = z.infer<typeof updateSegmentSchema>;

export const previewSegmentSchema = segmentRulesSchema;
export type PreviewSegmentDto = z.infer<typeof previewSegmentSchema>;
