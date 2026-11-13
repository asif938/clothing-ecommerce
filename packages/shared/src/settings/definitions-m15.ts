import { z } from "zod";
import { localizedTextSchema } from "../i18n/localized-text.ts";
import { defineSetting } from "./registry.ts";

/** Milestone 15 (§16 M15) settings — support inbox, live chat, chat assistant, ticket SLA. */

const channelEnum = z.enum(["live_chat", "whatsapp", "messenger", "instagram"]);
const slaMinutesSchema = z.object({
  low: z.number().int().min(5),
  normal: z.number().int().min(5),
  high: z.number().int().min(5),
  urgent: z.number().int().min(5),
});

export const SUPPORT_LIVE_CHAT_ENABLED = defineSetting({
  key: "support.liveChat.enabled",
  group: "support",
  type: z.boolean(),
  default: false,
  label: { bn: "ওয়েবসাইটে লাইভ চ্যাট চালু", en: "Live chat on the storefront" },
  help: { bn: "ক্রেতারা সাইট থেকেই বার্তা পাঠাতে পারবেন; বার্তা সাপোর্ট ইনবক্সে আসে", en: "Shoppers message you from the site; messages land in the support inbox" },
  secret: false,
  public: true,
  permission: "settings.support.write",
  ui: { widget: "toggle" },
});

export const SUPPORT_LIVE_CHAT_GREETING = defineSetting({
  key: "support.liveChat.greeting",
  group: "support",
  type: localizedTextSchema,
  default: { bn: "আসসালামু আলাইকুম! কীভাবে সাহায্য করতে পারি?", en: "Hi! How can we help you today?" },
  label: { bn: "লাইভ চ্যাটের শুভেচ্ছা বার্তা", en: "Live chat greeting" },
  secret: false,
  public: true,
  permission: "settings.support.write",
  ui: { widget: "localizedText" },
});

export const SUPPORT_LIVE_CHAT_PER_MINUTE = defineSetting({
  key: "support.liveChat.messagesPerMinute",
  group: "support",
  type: z.number().int().min(1).max(120),
  default: 10,
  label: { bn: "প্রতি ভিজিটর মিনিটে সর্বোচ্চ বার্তা", en: "Messages per visitor per minute" },
  secret: false,
  public: false,
  permission: "settings.support.write",
  ui: { widget: "text" },
});

export const SUPPORT_ASSISTANT_ENABLED = defineSetting({
  key: "support.assistant.enabled",
  group: "support",
  type: z.boolean(),
  default: false,
  label: { bn: "AI চ্যাট সহকারী চালু", en: "AI chat assistant enabled" },
  help: {
    bn: "নতুন বার্তার উত্তর AI দেয় যতক্ষণ না কর্মী উত্তর দেন বা গ্রাহক মানুষ চান; AI সেটিংস ও বাজেট প্রযোজ্য",
    en: "AI answers new messages until a staff member replies or the customer asks for a person; AI settings and budgets apply",
  },
  secret: false,
  public: false,
  permission: "settings.support.write",
  ui: { widget: "toggle" },
});

export const SUPPORT_ASSISTANT_CHANNELS = defineSetting({
  key: "support.assistant.channels",
  group: "support",
  type: z.array(channelEnum),
  default: ["live_chat"],
  label: { bn: "যেসব চ্যানেলে AI সহকারী উত্তর দেবে", en: "Channels the assistant answers on" },
  secret: false,
  public: false,
  permission: "settings.support.write",
  ui: { widget: "json" },
});

export const SUPPORT_HANDOFF_MESSAGE = defineSetting({
  key: "support.assistant.handoffMessage",
  group: "support",
  type: localizedTextSchema,
  default: { bn: "আমাদের একজন প্রতিনিধি শিগগিরই আপনাকে উত্তর দেবেন। ধন্যবাদ!", en: "A member of our team will reply to you shortly. Thank you!" },
  label: { bn: "মানুষের কাছে পাঠানোর সময় বার্তা", en: "Message when handing over to a person" },
  secret: false,
  public: false,
  permission: "settings.support.write",
  ui: { widget: "localizedText" },
});

export const SUPPORT_HOURS = defineSetting({
  key: "support.hours",
  group: "support",
  type: localizedTextSchema,
  default: { bn: "প্রতিদিন সকাল ১০টা – রাত ১০টা", en: "Every day, 10 am – 10 pm" },
  label: { bn: "সাপোর্টের সময়", en: "Support hours" },
  help: { bn: "AI সহকারী গ্রাহককে জানায়", en: "The assistant tells customers this" },
  secret: false,
  public: true,
  permission: "settings.support.write",
  ui: { widget: "localizedText" },
});

export const SUPPORT_FIRST_RESPONSE_MINUTES = defineSetting({
  key: "support.sla.firstResponseMinutes",
  group: "support",
  type: slaMinutesSchema,
  default: { low: 1440, normal: 480, high: 120, urgent: 30 },
  label: { bn: "টিকিটে প্রথম উত্তরের সময়সীমা (মিনিট, অগ্রাধিকার অনুযায়ী)", en: "Ticket first-response target (minutes, by priority)" },
  secret: false,
  public: false,
  permission: "settings.support.write",
  ui: { widget: "json" },
});

export const SUPPORT_RESOLUTION_MINUTES = defineSetting({
  key: "support.sla.resolutionMinutes",
  group: "support",
  type: slaMinutesSchema,
  default: { low: 4320, normal: 1440, high: 480, urgent: 120 },
  label: { bn: "টিকিট সমাধানের সময়সীমা (মিনিট, অগ্রাধিকার অনুযায়ী)", en: "Ticket resolution target (minutes, by priority)" },
  secret: false,
  public: false,
  permission: "settings.support.write",
  ui: { widget: "json" },
});
