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

export const createDirectUploadTicketSchema = z.object({
  mimeType: z.string().min(1),
  originalName: z.string().min(1),
  folderId: z.string().nullable().optional(),
});
export type CreateDirectUploadTicketDto = z.infer<typeof createDirectUploadTicketSchema>;

// The ticket response echoes `storageDriver`/`providerInstanceId` so finalize
// resolves the exact same driver the ticket was issued for, even if the
// active-provider setting or usage-fallback decision changes in between.
export const finalizeDirectUploadSchema = z.object({
  storageDriver: z.string().min(1),
  providerInstanceId: z.string().nullable(),
  storageKey: z.string().min(1),
  externalId: z.string().nullable(),
  folderId: z.string().nullable().optional(),
  originalName: z.string().min(1),
  mimeType: z.string().min(1),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  bytes: z.number().int().nullable().optional(),
  version: z.number().int().nullable().optional(),
});
export type FinalizeDirectUploadDto = z.infer<typeof finalizeDirectUploadSchema>;

export const createMediaMigrationJobSchema = z.object({
  toProvider: z.string().min(1),
  dryRun: z.boolean().default(false),
});
export type CreateMediaMigrationJobDto = z.infer<typeof createMediaMigrationJobSchema>;
