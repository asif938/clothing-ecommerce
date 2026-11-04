import { z } from "zod";

export const listTrackingLogsQuerySchema = z.object({
  eventId: z.string().optional(),
  eventName: z.string().optional(),
  status: z.enum(["queued", "sent", "failed"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListTrackingLogsQueryDto = z.infer<typeof listTrackingLogsQuerySchema>;
