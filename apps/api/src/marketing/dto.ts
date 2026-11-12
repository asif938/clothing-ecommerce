import { z } from "zod";

const channel = z.enum(["sms", "whatsapp", "email", "push"]);
const body = z.string().trim().min(1).max(2000);
const subject = z.string().trim().max(200).nullable().optional();

// --- journeys ----------------------------------------------------------------

export const journeyStepSchema = z.object({
  /** Hours after the trigger (first step) or after the previous step. */
  delayHours: z.number().int().min(0).max(24 * 365),
  /** Tried in order; the first one the customer can be reached on (and consented to, when required) is used. */
  channels: z.array(channel).min(1).max(4),
  subjectBn: subject,
  subjectEn: subject,
  bodyBn: body,
  bodyEn: body,
  /** A code-type discount to mint a single-use personal code from ({coupon_code}). */
  couponDiscountId: z.string().min(1).nullable().optional(),
});
export type JourneyStep = z.infer<typeof journeyStepSchema>;

export const journeyConfigSchema = z
  .object({
    /** Win-back: days since the last order before a customer counts as lapsed. */
    winBackDays: z.number().int().min(7).max(730).optional(),
    /** Win-back: ignore customers lapsed longer than this (they're unlikely to respond). */
    maxInactiveDays: z.number().int().min(30).max(3650).optional(),
    /** Birthday: Dhaka hour (0–23) from which the day's birthday messages go out. */
    sendHour: z.number().int().min(0).max(23).optional(),
  })
  .default({});
export type JourneyConfig = z.infer<typeof journeyConfigSchema>;

export const journeySchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["welcome", "post_purchase", "win_back", "birthday"]),
  respectConsent: z.boolean().default(true),
  config: journeyConfigSchema,
  steps: z.array(journeyStepSchema).min(1).max(10),
});
export type JourneyDto = z.infer<typeof journeySchema>;

export const journeyActiveSchema = z.object({ isActive: z.boolean() });
export type JourneyActiveDto = z.infer<typeof journeyActiveSchema>;

// --- broadcasts --------------------------------------------------------------

export const broadcastSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    channel,
    /** null = every customer who consented to this channel. */
    segmentId: z.string().min(1).nullable().optional(),
    subjectBn: subject,
    subjectEn: subject,
    bodyBn: body,
    bodyEn: body,
    discountId: z.string().min(1).nullable().optional(),
    codePrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2,10}$/, "2–10 letters or digits")
      .nullable()
      .optional(),
  })
  .refine((d) => d.channel !== "email" || (d.subjectBn && d.subjectEn), { message: "Email broadcasts need a subject in both languages", path: ["subjectBn"] });
export type BroadcastDto = z.infer<typeof broadcastSchema>;

export const scheduleBroadcastSchema = z.object({ scheduledAt: z.coerce.date().nullable().optional() });
export type ScheduleBroadcastDto = z.infer<typeof scheduleBroadcastSchema>;

export const testSendSchema = z.object({ to: z.string().trim().min(3).max(200), locale: z.enum(["bn", "en"]).default("bn") });
export type TestSendDto = z.infer<typeof testSendSchema>;

// --- audience sync -------------------------------------------------------------

export const audienceSyncSchema = z.object({
  segmentId: z.string().min(1),
  providerInstanceId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  autoSync: z.boolean().default(false),
});
export type AudienceSyncDto = z.infer<typeof audienceSyncSchema>;

export const audienceSyncUpdateSchema = z.object({ autoSync: z.boolean() });
export type AudienceSyncUpdateDto = z.infer<typeof audienceSyncUpdateSchema>;

// --- ad spend ------------------------------------------------------------------

const MAX_FILE_BASE64 = 14_000_000;

export const adSpendInspectSchema = z.object({ fileName: z.string().trim().min(1).max(200), contentBase64: z.string().min(1).max(MAX_FILE_BASE64) });
export type AdSpendInspectDto = z.infer<typeof adSpendInspectSchema>;

export const adSpendImportSchema = adSpendInspectSchema.extend({
  /** Used for every row unless `mapping.platform` names a column. */
  platform: z.enum(["meta", "google", "tiktok", "other"]),
  mapping: z.object({
    date: z.string().trim().min(1),
    campaignName: z.string().trim().min(1),
    spend: z.string().trim().min(1),
    campaignId: z.string().trim().min(1).nullable().optional(),
    impressions: z.string().trim().min(1).nullable().optional(),
    clicks: z.string().trim().min(1).nullable().optional(),
  }),
  /** Taka per one unit of the file's currency, e.g. "122.50" for a USD ad account; omit when the file is already in BDT. */
  exchangeRate: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullable()
    .optional(),
  dateFormat: z.enum(["auto", "dmy", "mdy"]).default("auto"),
});
export type AdSpendImportDto = z.infer<typeof adSpendImportSchema>;

export const dateRangeSchema = z.object({ from: z.coerce.date(), to: z.coerce.date(), platform: z.enum(["meta", "google", "tiktok", "other"]).optional() });
export type DateRangeDto = z.infer<typeof dateRangeSchema>;
