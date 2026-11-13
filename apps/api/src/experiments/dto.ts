import { z } from "zod";
import { EXPERIMENT_GOALS, EXPERIMENT_KINDS, EXPERIMENT_STATUSES, experimentVariantSchema } from "@clothing/shared/personalization";

export const createExperimentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  hypothesis: z.string().trim().max(1000).nullable().optional(),
  kind: z.enum(EXPERIMENT_KINDS),
  goal: z.enum(EXPERIMENT_GOALS).default("purchase"),
  trafficPercent: z.number().int().min(1).max(100).default(100),
  variants: z.array(experimentVariantSchema).min(2).max(5),
  /** Kind-specific; validated by the service (it needs the database). */
  target: z.unknown().optional(),
});
export type CreateExperimentDto = z.infer<typeof createExperimentSchema>;

export const updateExperimentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  hypothesis: z.string().trim().max(1000).nullable().optional(),
  goal: z.enum(EXPERIMENT_GOALS).optional(),
  trafficPercent: z.number().int().min(1).max(100).optional(),
  variants: z.array(experimentVariantSchema).min(2).max(5).optional(),
  target: z.unknown().optional(),
});
export type UpdateExperimentDto = z.infer<typeof updateExperimentSchema>;

export const completeExperimentSchema = z.object({
  winnerKey: z.string().trim().min(1).nullable(),
  /** Block: copy the winner's props into the page draft. Announcement: write the winner's text onto the bar. Offer: disable the other variants' discounts. */
  apply: z.boolean().default(false),
});
export type CompleteExperimentDto = z.infer<typeof completeExperimentSchema>;

export const listExperimentsQuerySchema = z.object({ status: z.enum(EXPERIMENT_STATUSES).optional() });
export type ListExperimentsQueryDto = z.infer<typeof listExperimentsQuerySchema>;

export const exposuresSchema = z.object({ experimentIds: z.array(z.string().min(1).max(64)).min(1).max(20) });
export type ExposuresDto = z.infer<typeof exposuresSchema>;

export const clickSchema = z.object({ experimentId: z.string().min(1).max(64) });
export type ClickDto = z.infer<typeof clickSchema>;
