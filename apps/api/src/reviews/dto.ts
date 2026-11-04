import { z } from "zod";

export const listReviewsQuerySchema = z.object({
  productId: z.string().optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListReviewsQueryDto = z.infer<typeof listReviewsQuerySchema>;

export const moderateReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  adminReply: z.string().max(2000).nullable().optional(),
});
export type ModerateReviewDto = z.infer<typeof moderateReviewSchema>;

export const submitReviewSchema = z.object({
  orderItemId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(160).optional(),
  body: z.string().min(1).max(4000),
  fitFeedback: z.enum(["small", "true_to_size", "large"]).nullable().optional(),
  mediaUrls: z.array(z.string().url()).max(6).default([]),
});
export type SubmitReviewDto = z.infer<typeof submitReviewSchema>;

export const listApprovedReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type ListApprovedReviewsQueryDto = z.infer<typeof listApprovedReviewsQuerySchema>;
