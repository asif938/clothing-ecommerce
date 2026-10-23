import { z } from "zod";

export const spacerSchema = z.object({ height: z.enum(["sm", "md", "lg", "xl"]).default("md") });
export type SpacerProps = z.infer<typeof spacerSchema>;
