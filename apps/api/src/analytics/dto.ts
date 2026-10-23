import { z } from "zod";

export const trackEventSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
  anonymousId: z.string().optional(),
  path: z.string().optional(),
});
export type TrackEventDto = z.infer<typeof trackEventSchema>;
