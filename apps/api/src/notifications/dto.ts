import { z } from "zod";
import { NOTIFICATION_CHANNELS } from "@clothing/shared/notifications";

const channelSchema = z.enum(NOTIFICATION_CHANNELS);

export const updateMessageTemplateSchema = z.object({
  isActive: z.boolean().optional(),
  subjectBn: z.string().nullable().optional(),
  subjectEn: z.string().nullable().optional(),
  bodyBn: z.string().min(1).optional(),
  bodyEn: z.string().min(1).optional(),
});
export type UpdateMessageTemplateDto = z.infer<typeof updateMessageTemplateSchema>;

export const previewTemplateSchema = z.object({
  event: z.string().min(1),
  channel: channelSchema,
  locale: z.enum(["bn", "en"]).default("bn"),
});
export type PreviewTemplateDto = z.infer<typeof previewTemplateSchema>;

export const testSendSchema = z.object({
  event: z.string().min(1),
  channel: channelSchema,
  locale: z.enum(["bn", "en"]).default("bn"),
  to: z.string().min(3),
});
export type TestSendDto = z.infer<typeof testSendSchema>;

export const updateChannelRuleSchema = z.object({
  channels: z.array(channelSchema),
});
export type UpdateChannelRuleDto = z.infer<typeof updateChannelRuleSchema>;

export const listNotificationLogsQuerySchema = z.object({
  event: z.string().optional(),
  channel: channelSchema.optional(),
  status: z.enum(["queued", "retrying", "sent", "failed"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListNotificationLogsQueryDto = z.infer<typeof listNotificationLogsQuerySchema>;
