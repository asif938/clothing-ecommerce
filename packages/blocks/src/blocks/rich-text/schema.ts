import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

/** Plain text, one paragraph per line — a full WYSIWYG rich-text editor is a deliberate scope line for Milestone 3, see docs/DECISIONS.md. */
export const richTextSchema = z.object({
  content: localizedTextSchema,
  align: z.enum(["left", "center"]).default("left"),
});
export type RichTextProps = z.infer<typeof richTextSchema>;
