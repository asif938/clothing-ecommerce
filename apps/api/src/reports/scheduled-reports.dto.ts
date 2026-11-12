import { z } from "zod";
import { SCHEDULABLE_REPORT_KEYS } from "./report-catalog";

export const scheduledReportSchema = z.object({
  name: z.string().trim().min(1).max(120),
  reportKey: z.enum(SCHEDULABLE_REPORT_KEYS),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  recipients: z
    .array(z.string().trim().toLowerCase().email())
    .min(1)
    .max(20)
    .transform((list) => [...new Set(list)]),
  locale: z.enum(["bn", "en"]).default("bn"),
  isActive: z.boolean().default(true),
});
export type ScheduledReportDto = z.infer<typeof scheduledReportSchema>;

export const updateScheduledReportSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  reportKey: z.enum(SCHEDULABLE_REPORT_KEYS).optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  recipients: z
    .array(z.string().trim().toLowerCase().email())
    .min(1)
    .max(20)
    .transform((list) => [...new Set(list)])
    .optional(),
  locale: z.enum(["bn", "en"]).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateScheduledReportDto = z.infer<typeof updateScheduledReportSchema>;
