import type { LocalizedText } from "../i18n/localized-text.ts";

/**
 * The three channels a customer-facing notification can go out on
 * (docs/PROJECT_SPEC.md §10.3, §6.11). Mirrors the Prisma `NotificationChannel`
 * enum exactly (packages/db/prisma/schema.prisma) — kept as a plain string
 * union here rather than importing it, the same "manually mirrored, not
 * imported" pattern `ShipmentStatusValue` already uses in
 * `providers/types.ts`, since `@clothing/shared` must stay free of a
 * `@clothing/db` dependency (the dependency runs the other way).
 */
export const NOTIFICATION_CHANNELS = ["sms", "email", "whatsapp"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface NotificationEventDefinition {
  /** Mirrors the Prisma `NotificationEvent` enum — see the comment above. */
  key: string;
  label: LocalizedText;
  help: LocalizedText;
  /** Documented variables available to this event's templates (§6.11) — shown in the template editor, substituted by `renderTemplate`. */
  variables: string[];
  /** Which channels are enabled, and in what fallback order, until an admin saves a `NotificationChannelRule` row overriding it (§6.11: "admin chooses per event which channels are active and the order of preference"). */
  defaultChannelOrder: NotificationChannel[];
}

const COMMON_VARS = ["brand_name", "support_phone"];
const ORDER_VARS = [...COMMON_VARS, "customer_name", "order_number"];

export const NOTIFICATION_EVENTS: NotificationEventDefinition[] = [
  {
    key: "otp_verification",
    label: { bn: "OTP যাচাইকরণ", en: "OTP verification" },
    help: { bn: "লগইন/চেকআউটের সময় পাঠানো ভেরিফিকেশন কোড", en: "Verification code sent on login/checkout" },
    variables: [...COMMON_VARS, "otp"],
    defaultChannelOrder: ["sms"],
  },
  {
    key: "order_placed",
    label: { bn: "অর্ডার প্লেস হয়েছে", en: "Order placed" },
    help: { bn: "অর্ডার তৈরি হওয়ার সাথে সাথে পাঠানো হয়", en: "Sent as soon as an order is created" },
    variables: [...ORDER_VARS, "order_total", "cod_amount"],
    defaultChannelOrder: ["whatsapp", "sms"],
  },
  {
    key: "order_confirmed",
    label: { bn: "অর্ডার কনফার্ম হয়েছে", en: "Order confirmed" },
    help: { bn: "স্টাফ/অটো-কনফার্ম অর্ডার কনফার্ম করার পর পাঠানো হয়", en: "Sent once staff or an auto-confirm rule confirms the order" },
    variables: [...ORDER_VARS, "order_total"],
    defaultChannelOrder: ["whatsapp", "sms"],
  },
  {
    key: "order_shipped",
    label: { bn: "অর্ডার শিপ হয়েছে", en: "Order shipped" },
    help: { bn: "কুরিয়ার বুকিংয়ের পর পাঠানো হয়", en: "Sent once the courier booking is made" },
    variables: [...ORDER_VARS, "tracking_code", "tracking_link", "courier_name"],
    defaultChannelOrder: ["whatsapp", "sms"],
  },
  {
    key: "order_out_for_delivery",
    label: { bn: "ডেলিভারির জন্য বের হয়েছে", en: "Out for delivery" },
    help: { bn: "কুরিয়ার পার্সেল ডেলিভারির জন্য বের হলে পাঠানো হয়", en: "Sent when the courier marks the parcel out for delivery" },
    variables: [...ORDER_VARS, "tracking_code", "tracking_link", "courier_name"],
    defaultChannelOrder: ["sms"],
  },
  {
    key: "order_delivered",
    label: { bn: "অর্ডার ডেলিভার হয়েছে", en: "Order delivered" },
    help: { bn: "পার্সেল সফলভাবে ডেলিভার হলে পাঠানো হয়", en: "Sent once the parcel is successfully delivered" },
    variables: ORDER_VARS,
    defaultChannelOrder: ["whatsapp", "sms", "email"],
  },
  {
    key: "order_partially_delivered",
    label: { bn: "আংশিক ডেলিভার হয়েছে", en: "Partially delivered" },
    help: { bn: "কিছু আইটেম ডেলিভার, কিছু ফেরত হলে পাঠানো হয়", en: "Sent when some items were delivered and some returned" },
    variables: [...ORDER_VARS, "cod_amount"],
    defaultChannelOrder: ["sms"],
  },
  {
    key: "order_rejected_at_door",
    label: { bn: "দরজায় প্রত্যাখ্যান", en: "Rejected at the door" },
    help: { bn: "গ্রাহক দরজায় পার্সেল প্রত্যাখ্যান করলে পাঠানো হয়", en: "Sent when the customer refused the parcel at delivery" },
    variables: ORDER_VARS,
    defaultChannelOrder: ["sms"],
  },
  {
    key: "order_cancelled",
    label: { bn: "অর্ডার বাতিল হয়েছে", en: "Order cancelled" },
    help: { bn: "অর্ডার বাতিল হলে পাঠানো হয়", en: "Sent when an order is cancelled" },
    variables: ORDER_VARS,
    defaultChannelOrder: ["sms"],
  },
];

export function getNotificationEventDefinition(key: string): NotificationEventDefinition | undefined {
  return NOTIFICATION_EVENTS.find((e) => e.key === key);
}
