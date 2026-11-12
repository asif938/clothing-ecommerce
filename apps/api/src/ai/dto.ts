import { z } from "zod";
import { AI_FEATURES } from "@clothing/shared/ai";

export const aiFeatureParamSchema = z.enum(AI_FEATURES);

export const updateAiConfigSchema = z.object({
  providerInstanceId: z.string().min(1).nullable().optional(),
  model: z.string().trim().min(1).max(120).nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  effort: z.enum(["low", "medium", "high"]).nullable().optional(),
  maxTokens: z.number().int().min(256).max(64_000).optional(),
  promptTemplate: z.string().trim().min(20).max(8000).optional(),
  enabled: z.boolean().optional(),
  monthlyBudgetCents: z.number().int().min(0).nullable().optional(),
  monthlyTokenBudget: z.number().int().min(0).nullable().optional(),
});
export type UpdateAiConfigDto = z.infer<typeof updateAiConfigSchema>;

export const restoreVersionSchema = z.object({ version: z.number().int().min(1) });
export type RestoreVersionDto = z.infer<typeof restoreVersionSchema>;

export const generateProductDraftSchema = z.object({
  feature: z.enum(AI_FEATURES),
  keywords: z.string().trim().max(300).optional(),
  tone: z.string().trim().max(100).optional(),
  /** alt_text: which gallery entries (default: those with no alt text yet, max 6). */
  productMediaIds: z.array(z.string().min(1)).max(12).optional(),
  /** translation: which way. */
  direction: z.enum(["bn_to_en", "en_to_bn"]).optional(),
});
export type GenerateProductDraftDto = z.infer<typeof generateProductDraftSchema>;

export const updateDraftSchema = z.object({ output: z.unknown() });
export type UpdateDraftDto = z.infer<typeof updateDraftSchema>;

export const usageQuerySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });
export type UsageQueryDto = z.infer<typeof usageQuerySchema>;
