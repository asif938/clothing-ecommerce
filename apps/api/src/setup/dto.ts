import { z } from "zod";

export const createSuperAdminSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8),
});
export type CreateSuperAdminDto = z.infer<typeof createSuperAdminSchema>;

export const confirmSuperAdminTotpSchema = z.object({
  staffUserId: z.string().min(1),
  code: z.string().min(6).max(6),
});
export type ConfirmSuperAdminTotpDto = z.infer<typeof confirmSuperAdminTotpSchema>;
