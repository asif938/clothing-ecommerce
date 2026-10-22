import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

export const createMediaFolderSchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().nullable().optional(),
});
export type CreateMediaFolderDto = z.infer<typeof createMediaFolderSchema>;

export const updateMediaFolderSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  parentId: z.string().nullable().optional(),
});
export type UpdateMediaFolderDto = z.infer<typeof updateMediaFolderSchema>;

export const updateMediaSchema = z.object({
  folderId: z.string().nullable().optional(),
  altText: localizedTextSchema.optional(),
  focalX: z.number().min(0).max(1).optional(),
  focalY: z.number().min(0).max(1).optional(),
});
export type UpdateMediaDto = z.infer<typeof updateMediaSchema>;
