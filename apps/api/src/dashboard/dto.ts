import { z } from "zod";

export const dashboardQuerySchema = z.object({
  range: z.enum(["today", "7d", "30d", "custom"]).default("7d"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type DashboardQueryDto = z.infer<typeof dashboardQuerySchema>;

export const saveLayoutSchema = z.object({
  scope: z.enum(["staff", "role", "default"]).default("staff"),
  roleId: z.string().min(1).optional(),
  widgets: z.array(z.string().min(1).max(60)).max(30),
});
export type SaveLayoutDto = z.infer<typeof saveLayoutSchema>;

export const layoutScopeQuerySchema = z.object({
  scope: z.enum(["staff", "role", "default"]).default("staff"),
  roleId: z.string().min(1).optional(),
});
export type LayoutScopeQueryDto = z.infer<typeof layoutScopeQuerySchema>;
