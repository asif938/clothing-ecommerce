import { z } from "zod";
import { updateSchemaFrom } from "../common/zod-update";

export const createSearchSynonymSchema = z.object({
  term: z.string().min(1),
  synonyms: z.array(z.string().min(1)).default([]),
});
export type CreateSearchSynonymDto = z.infer<typeof createSearchSynonymSchema>;

export const updateSearchSynonymSchema = updateSchemaFrom(createSearchSynonymSchema);
export type UpdateSearchSynonymDto = z.infer<typeof updateSearchSynonymSchema>;

export const searchQuerySchema = z.object({
  q: z.string().min(1),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export type SearchQueryDto = z.infer<typeof searchQuerySchema>;
