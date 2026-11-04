import { z } from "zod";

export const reportRangeQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  format: z.enum(["json", "csv"]).default("json"),
});
export type ReportRangeQueryDto = z.infer<typeof reportRangeQuerySchema>;
