import { z } from "zod";

export const createStaffUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(10),
  locale: z.enum(["bn", "en"]).default("bn"),
  roleIds: z.array(z.string()).default([]),
});
export type CreateStaffUserDto = z.infer<typeof createStaffUserSchema>;

export const updateStaffUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  locale: z.enum(["bn", "en"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  roleIds: z.array(z.string()).optional(),
});
export type UpdateStaffUserDto = z.infer<typeof updateStaffUserSchema>;
