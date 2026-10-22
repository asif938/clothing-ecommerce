import { z } from "zod";

export const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  permissions: z.array(z.string()).default([]),
});
export type CreateRoleDto = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  permissions: z.array(z.string()).optional(),
});
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;
