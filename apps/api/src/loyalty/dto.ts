import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

export const tierSchema = z.object({
  name: localizedTextSchema,
  minSpent: z.number().int().min(0),
  earnMultiplierPercent: z.number().int().min(0).max(1000).default(100),
  perks: localizedTextSchema.nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  position: z.number().int().min(0).default(0),
});
export type TierDto = z.infer<typeof tierSchema>;

export const adjustPointsSchema = z.object({
  points: z
    .number()
    .int()
    .refine((v) => v !== 0, "Points can't be zero")
    .refine((v) => Math.abs(v) <= 1_000_000, "Too many points"),
  note: z.string().trim().min(3).max(300),
});
export type AdjustPointsDto = z.infer<typeof adjustPointsSchema>;

export const ledgerQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1) });
export type LedgerQueryDto = z.infer<typeof ledgerQuerySchema>;

export const redeemPointsSchema = z.object({ points: z.number().int().min(0).max(10_000_000) });
export type RedeemPointsDto = z.infer<typeof redeemPointsSchema>;

/** Storefront profile (§16 M13) — birthday drives the birthday journey/bonus; consent flags gate marketing sends. */
export const storeProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  locale: z.enum(["bn", "en"]).optional(),
  marketingConsentSms: z.boolean().optional(),
  marketingConsentEmail: z.boolean().optional(),
  marketingConsentWhatsapp: z.boolean().optional(),
});
export type StoreProfileDto = z.infer<typeof storeProfileSchema>;
