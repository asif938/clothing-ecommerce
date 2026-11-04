import { z } from "zod";

export const askQuestionSchema = z.object({
  productId: z.string().min(1),
  question: z.string().min(1).max(1000),
});
export type AskQuestionDto = z.infer<typeof askQuestionSchema>;

export const answerQuestionSchema = z.object({
  answer: z.string().min(1).max(2000),
});
export type AnswerQuestionDto = z.infer<typeof answerQuestionSchema>;

export const listQuestionsQuerySchema = z.object({
  productId: z.string().optional(),
  status: z.enum(["pending", "answered", "hidden"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListQuestionsQueryDto = z.infer<typeof listQuestionsQuerySchema>;
