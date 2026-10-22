import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const loginTotpSchema = z.object({
  loginToken: z.string().min(1),
  code: z.string().min(6).max(6),
});
export type LoginTotpDto = z.infer<typeof loginTotpSchema>;

export const totpConfirmSchema = z.object({
  code: z.string().min(6).max(6),
});
export type TotpConfirmDto = z.infer<typeof totpConfirmSchema>;
