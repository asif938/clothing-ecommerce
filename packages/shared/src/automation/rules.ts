import { z } from "zod";
import { conditionGroupSchema, type ConditionGroup } from "./conditions.ts";

/** Triggers an automation rule can listen to (docs/PROJECT_SPEC.md §5.10 / §16 M11). */
export const AUTOMATION_TRIGGERS = [
  { key: "order.placed", label: { bn: "অর্ডার প্লেস হলে", en: "Order placed" } },
  { key: "order.confirmed", label: { bn: "অর্ডার কনফার্ম হলে", en: "Order confirmed" } },
  { key: "order.on_hold", label: { bn: "অর্ডার হোল্ডে গেলে", en: "Order put on hold" } },
  { key: "order.cancelled", label: { bn: "অর্ডার বাতিল হলে", en: "Order cancelled" } },
  { key: "order.shipped", label: { bn: "অর্ডার শিপ হলে", en: "Order shipped" } },
  { key: "order.delivered", label: { bn: "অর্ডার ডেলিভার হলে", en: "Order delivered" } },
  { key: "order.rejected_at_door", label: { bn: "দরজায় প্রত্যাখ্যাত হলে", en: "Order rejected at door" } },
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number]["key"];
export const AUTOMATION_TRIGGER_KEYS = AUTOMATION_TRIGGERS.map((t) => t.key) as [AutomationTrigger, ...AutomationTrigger[]];

/** Order status → the trigger its arrival fires (statuses with no trigger simply don't fire one). */
export const STATUS_TO_TRIGGER: Record<string, AutomationTrigger | undefined> = {
  confirmed: "order.confirmed",
  on_hold: "order.on_hold",
  cancelled: "order.cancelled",
  shipped: "order.shipped",
  delivered: "order.delivered",
  rejected_at_door: "order.rejected_at_door",
};

export const AUTOMATION_ACTION_TYPES = ["add_tag", "remove_tag", "set_status", "assign_queue", "assign_staff", "notify_staff", "send_notification", "call_webhook", "add_note"] as const;

export const automationActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_tag"), tag: z.string().min(1).max(40), target: z.enum(["order", "customer"]).default("order") }),
  z.object({ type: z.literal("remove_tag"), tag: z.string().min(1).max(40), target: z.enum(["order", "customer"]).default("order") }),
  z.object({ type: z.literal("set_status"), status: z.enum(["confirmed", "on_hold", "cancelled"]), reason: z.string().max(200).optional() }),
  z.object({ type: z.literal("assign_queue") }),
  z.object({ type: z.literal("assign_staff"), staffId: z.string().min(1) }),
  z.object({
    type: z.literal("notify_staff"),
    permission: z.string().min(1).default("orders.manage"),
    title: z.object({ bn: z.string().min(1).max(120), en: z.string().min(1).max(120) }),
    body: z.object({ bn: z.string().min(1).max(300), en: z.string().min(1).max(300) }),
  }),
  z.object({ type: z.literal("send_notification"), event: z.string().min(1) }),
  z.object({ type: z.literal("call_webhook"), url: z.url() }),
  z.object({ type: z.literal("add_note"), note: z.string().min(1).max(500) }),
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;

export const automationRuleInputSchema = z.object({
  name: z.string().min(1).max(120),
  trigger: z.enum(AUTOMATION_TRIGGER_KEYS),
  conditions: conditionGroupSchema,
  actions: z.array(automationActionSchema).min(1).max(10),
  stopProcessing: z.boolean().default(false),
  priority: z.number().int().min(1).max(10000).default(100),
  isActive: z.boolean().default(true),
});
export type AutomationRuleInput = z.infer<typeof automationRuleInputSchema>;

export interface AutomationTemplate {
  key: string;
  name: { bn: string; en: string };
  description: { bn: string; en: string };
  trigger: AutomationTrigger;
  conditions: ConditionGroup;
  actions: AutomationAction[];
  stopProcessing?: boolean;
}

/** Starter rules the owner can add with one click and then tweak — spec §8.2 "templates". */
export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: "high_value_notify_manager",
    name: { bn: "বড় অর্ডারে ম্যানেজারকে জানান", en: "High-value order → notify manager" },
    description: { bn: "১৫,০০০ টাকার বেশি অর্ডারে ম্যানেজারকে নোটিফিকেশন", en: "Notifies managers when an order is ৳15,000 or more" },
    trigger: "order.placed",
    conditions: { match: "all", rules: [{ field: "order.total", op: "gte", value: 1_500_000 }] },
    actions: [
      { type: "add_tag", tag: "high-value", target: "order" },
      { type: "notify_staff", permission: "orders.queue.manage", title: { bn: "বড় অর্ডার", en: "High-value order" }, body: { bn: "একটি বড় মূল্যের অর্ডার এসেছে, দেখুন।", en: "A high-value order just came in — take a look." } },
    ],
  },
  {
    key: "repeat_rejecter_risky",
    name: { bn: "৩য় দরজায় প্রত্যাখ্যানে ঝুঁকিপূর্ণ ট্যাগ", en: "3rd doorstep rejection → tag Risky" },
    description: { bn: "দরজায় ৩ বা বেশিবার প্রত্যাখ্যান করলে গ্রাহককে 'risky' ট্যাগ দেওয়া হয় (পেমেন্ট রুলে অগ্রিম চাইতে এই ট্যাগ ব্যবহার করুন)", en: "Tags the customer 'risky' after 3+ doorstep rejections (use the tag in a payment rule to demand advance)" },
    trigger: "order.rejected_at_door",
    conditions: { match: "all", rules: [{ field: "customer.rejectedAtDoorCount", op: "gte", value: 3 }] },
    actions: [{ type: "add_tag", tag: "risky", target: "customer" }],
  },
  {
    key: "delivered_thank_you",
    name: { bn: "ডেলিভারির পর ধন্যবাদ বার্তা", en: "Order delivered → thank-you message" },
    description: { bn: "ডেলিভারি হলে গ্রাহককে 'delivered' বার্তা পাঠান", en: "Sends the 'delivered' message when an order is delivered" },
    trigger: "order.delivered",
    conditions: { match: "all", rules: [] },
    actions: [{ type: "send_notification", event: "order_delivered" }],
  },
  {
    key: "auto_confirm_prepaid",
    name: { bn: "অগ্রিম পেমেন্ট করা অর্ডার অটো-কনফার্ম", en: "Auto-confirm paid, low-risk orders" },
    description: { bn: "পুরো টাকা পরিশোধিত ও লো-রিস্ক অর্ডার নিজে থেকে কনফার্ম হবে", en: "Confirms fully paid, low-risk orders automatically" },
    trigger: "order.placed",
    conditions: {
      match: "all",
      rules: [
        { field: "order.paymentStatus", op: "eq", value: "paid" },
        { field: "order.riskLevel", op: "eq", value: "low" },
      ],
    },
    actions: [{ type: "set_status", status: "confirmed" }],
  },
  {
    key: "high_risk_hold",
    name: { bn: "হাই-রিস্ক অর্ডার হোল্ড", en: "High-risk order → hold for review" },
    description: { bn: "হাই-রিস্ক অর্ডার হোল্ডে রেখে টিমকে জানান", en: "Holds high-risk orders and alerts the team" },
    trigger: "order.placed",
    conditions: { match: "all", rules: [{ field: "order.riskLevel", op: "eq", value: "high" }] },
    actions: [
      { type: "set_status", status: "on_hold", reason: "High risk — review needed" },
      { type: "notify_staff", permission: "orders.manage", title: { bn: "হাই-রিস্ক অর্ডার", en: "High-risk order" }, body: { bn: "একটি হাই-রিস্ক অর্ডার হোল্ডে রাখা হয়েছে।", en: "A high-risk order was put on hold." } },
    ],
  },
  {
    key: "first_order_tag",
    name: { bn: "প্রথম অর্ডারে ট্যাগ", en: "First order → tag" },
    description: { bn: "নতুন গ্রাহকের প্রথম অর্ডারে 'first-order' ট্যাগ", en: "Tags a new customer's first order" },
    trigger: "order.placed",
    conditions: { match: "all", rules: [{ field: "customer.isFirstOrder", op: "eq", value: true }] },
    actions: [{ type: "add_tag", tag: "first-order", target: "order" }],
  },
];
