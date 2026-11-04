import { z } from "zod";

export const dashboardQuerySchema = z.object({
  range: z.enum(["today", "7d", "30d", "custom"]).default("7d"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type DashboardQueryDto = z.infer<typeof dashboardQuerySchema>;
