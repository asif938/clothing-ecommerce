import { z } from "zod";

export const adjustStoreCreditSchema = z.object({
  /** Poisha; positive credits the wallet, negative takes from it. */
  amount: z
    .number()
    .int()
    .refine((v) => v !== 0, "Amount can't be zero")
    .refine((v) => Math.abs(v) <= 100_000_000, "Amount too large"),
  note: z.string().trim().min(3).max(300),
});
export type AdjustStoreCreditDto = z.infer<typeof adjustStoreCreditSchema>;

export const walletQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1) });
export type WalletQueryDto = z.infer<typeof walletQuerySchema>;

export const setUseStoreCreditSchema = z.object({ use: z.boolean() });
export type SetUseStoreCreditDto = z.infer<typeof setUseStoreCreditSchema>;
