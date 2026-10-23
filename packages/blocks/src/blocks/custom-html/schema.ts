import { z } from "zod";

/** Super Admin only (`superAdminOnly` on the block definition), sanitized server-side on save (docs/PROJECT_SPEC.md §9.1/§12) — see apps/api's PagesService. */
export const customHtmlSchema = z.object({ html: z.string().default("") });
export type CustomHtmlProps = z.infer<typeof customHtmlSchema>;
