import { z } from "zod";
import { normalizeBdPhone } from "@clothing/shared";

const bdPhoneSchema = z.string().transform((v, ctx) => {
  const normalized = normalizeBdPhone(v);
  if (!normalized) {
    ctx.addIssue({ code: "custom", message: "Not a valid Bangladesh mobile number" });
    return z.NEVER;
  }
  return normalized;
});

export const sendOtpSchema = z.object({
  phone: bdPhoneSchema,
  purpose: z.enum(["login", "checkout", "change_phone"]).default("login"),
});
export type SendOtpDto = z.infer<typeof sendOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: bdPhoneSchema,
  purpose: z.enum(["login", "checkout", "change_phone"]).default("login"),
  code: z.string().min(4).max(6),
});
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;

export const googleLoginSchema = z.object({
  idToken: z.string().min(1),
});
export type GoogleLoginDto = z.infer<typeof googleLoginSchema>;
