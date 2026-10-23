import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared/i18n";

const blockVisibilitySchema = z.object({ devices: z.array(z.enum(["mobile", "tablet", "desktop"])).optional(), locales: z.array(z.string()).optional() }).optional();
const blockScheduleSchema = z.object({ startsAt: z.string().nullable().optional(), endsAt: z.string().nullable().optional() }).optional();

export const blockInstanceSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  props: z.unknown(),
  visibility: blockVisibilitySchema,
  schedule: blockScheduleSchema,
});
export type BlockInstanceDto = z.infer<typeof blockInstanceSchema>;

export const createPageSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  seoTitle: localizedTextSchema.optional(),
  seoDescription: localizedTextSchema.optional(),
});
export type CreatePageDto = z.infer<typeof createPageSchema>;

export const updatePageSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  seoTitle: localizedTextSchema.optional(),
  seoDescription: localizedTextSchema.optional(),
  ogImageMediaId: z.string().nullable().optional(),
  noindex: z.boolean().optional(),
});
export type UpdatePageDto = z.infer<typeof updatePageSchema>;

export const updatePageBlocksSchema = z.object({ blocks: z.array(blockInstanceSchema) });
export type UpdatePageBlocksDto = z.infer<typeof updatePageBlocksSchema>;

export const schedulePageSchema = z.object({ publishAt: z.coerce.date() });
export type SchedulePageDto = z.infer<typeof schedulePageSchema>;

export const restoreVersionNoteSchema = z.object({ note: z.string().optional() });

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

export interface MenuItemDto {
  id: string;
  label: { bn?: string; en?: string };
  type: "category" | "collection" | "product" | "page" | "url";
  targetId?: string;
  url?: string;
  children?: MenuItemDto[];
}

const menuItemSchema: z.ZodType<MenuItemDto> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    label: localizedTextSchema,
    type: z.enum(["category", "collection", "product", "page", "url"]),
    targetId: z.string().optional(),
    url: z.string().optional(),
    children: z.array(menuItemSchema).optional(),
  }),
);

export const createMenuSchema = z.object({ key: z.string().min(1), name: z.string().min(1), items: z.array(menuItemSchema).default([]) });
export type CreateMenuDto = z.infer<typeof createMenuSchema>;

export const updateMenuSchema = z.object({ name: z.string().min(1).optional(), items: z.array(menuItemSchema).optional() });
export type UpdateMenuDto = z.infer<typeof updateMenuSchema>;

// ---------------------------------------------------------------------------
// Announcement bars
// ---------------------------------------------------------------------------

export const createAnnouncementSchema = z.object({
  message: localizedTextSchema,
  linkUrl: z.string().nullable().optional(),
  linkText: localizedTextSchema.optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
  position: z.number().int().optional(),
});
export type CreateAnnouncementDto = z.infer<typeof createAnnouncementSchema>;
export const updateAnnouncementSchema = createAnnouncementSchema.partial();
export type UpdateAnnouncementDto = z.infer<typeof updateAnnouncementSchema>;

// ---------------------------------------------------------------------------
// Popups
// ---------------------------------------------------------------------------

export const createPopupSchema = z.object({
  name: z.string().min(1),
  title: localizedTextSchema,
  body: localizedTextSchema,
  imageMediaId: z.string().nullable().optional(),
  ctaText: localizedTextSchema.optional(),
  ctaUrl: z.string().nullable().optional(),
  trigger: z.enum(["immediate", "delay", "exit_intent"]).optional(),
  delaySeconds: z.number().int().min(0).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type CreatePopupDto = z.infer<typeof createPopupSchema>;
export const updatePopupSchema = createPopupSchema.partial();
export type UpdatePopupDto = z.infer<typeof updatePopupSchema>;

// ---------------------------------------------------------------------------
// Redirects
// ---------------------------------------------------------------------------

export const createRedirectSchema = z.object({
  fromPath: z.string().min(1),
  toPath: z.string().min(1),
  statusCode: z.union([z.literal(301), z.literal(302)]).optional(),
  isActive: z.boolean().optional(),
});
export type CreateRedirectDto = z.infer<typeof createRedirectSchema>;
export const updateRedirectSchema = createRedirectSchema.partial();
export type UpdateRedirectDto = z.infer<typeof updateRedirectSchema>;
