import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared/i18n";
import { blockInstanceSchema } from "../cms/dto";

export const createBlogPostSchema = z.object({
  title: localizedTextSchema,
  slug: z.string().min(1),
  excerpt: localizedTextSchema.optional(),
  coverMediaId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  seoTitle: localizedTextSchema.optional(),
  seoDescription: localizedTextSchema.optional(),
});
export type CreateBlogPostDto = z.infer<typeof createBlogPostSchema>;

export const updateBlogPostSchema = createBlogPostSchema.omit({ slug: true }).partial().extend({ slug: z.string().min(1).optional() });
export type UpdateBlogPostDto = z.infer<typeof updateBlogPostSchema>;

export const updateBlogPostBlocksSchema = z.object({ blocks: z.array(blockInstanceSchema) });
export type UpdateBlogPostBlocksDto = z.infer<typeof updateBlogPostBlocksSchema>;

export const listBlogPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(9),
  tag: z.string().optional(),
});
export type ListBlogPostsQueryDto = z.infer<typeof listBlogPostsQuerySchema>;
