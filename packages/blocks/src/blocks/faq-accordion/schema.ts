import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

const faqItemSchema = z.object({ question: localizedTextSchema, answer: localizedTextSchema });

export const faqAccordionSchema = z.object({ heading: localizedTextSchema.optional(), items: z.array(faqItemSchema).default([]) });
export type FaqAccordionProps = z.infer<typeof faqAccordionSchema>;
