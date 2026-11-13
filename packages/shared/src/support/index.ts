import type { AiToolDefinition } from "../providers/types.ts";
import { renderTemplate } from "../notifications/template-render.ts";

/**
 * Support (docs/PROJECT_SPEC.md §5.10 `conversations`/`tickets`, §8.2
 * Support, §16 M15). Pure rules shared by the API and admin.
 */

export const CONVERSATION_CHANNELS = ["live_chat", "whatsapp", "messenger", "instagram"] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

export const CONVERSATION_STATUSES = ["open", "waiting_agent", "pending", "resolved"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const TICKET_TYPES = ["general", "order_issue", "delivery", "return_exchange", "payment", "product", "complaint"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = ["open", "pending", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type SlaMinutes = Record<TicketPriority, number>;

/** Deadline from a start time and the priority's minutes. Calendar minutes, not business hours (see docs/DECISIONS.md). */
export function slaDueAt(from: Date, priority: TicketPriority, minutes: SlaMinutes): Date {
  return new Date(from.getTime() + Math.max(1, minutes[priority]) * 60_000);
}

export type SlaState = "met" | "breached" | "due_soon" | "on_track";

/** `due_soon` = within the last 20% of the window (at least 15 minutes). A met deadline stays "met" even if the ticket stays open. */
export function slaState(due: Date | null, doneAt: Date | null, now: Date, windowMinutes: number): SlaState | null {
  if (!due) return null;
  if (doneAt) return doneAt <= due ? "met" : "breached";
  if (now > due) return "breached";
  const soon = Math.max(15, windowMinutes * 0.2) * 60_000;
  return due.getTime() - now.getTime() <= soon ? "due_soon" : "on_track";
}

/** Meta platforms only allow free-form business replies within 24 h of the customer's last message. Live chat has no window. */
export const REPLY_WINDOW_HOURS = 24;

export function canReply(channel: ConversationChannel, lastInboundAt: Date | null, now: Date): boolean {
  if (channel === "live_chat") return true;
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() <= REPLY_WINDOW_HOURS * 3_600_000;
}

/**
 * Deterministic "I want a person" detection (Bangla, English, Banglish) —
 * checked before any AI so a customer asking for a human is never stuck
 * with the bot, even when AI is off or over budget.
 */
const HUMAN_PATTERNS = [
  /\b(talk|speak|chat)\s+(to|with)\s+(a\s+)?(human|person|agent|someone|representative)\b/i,
  /\b(real|live)\s+(person|human|agent)\b/i,
  /\bcustomer\s+(care|service)\b/i,
  /\b(manush|manus)\b/i,
  /মানুষের সাথে|মানুষ চাই|এজেন্ট|কাস্টমার কেয়ার|প্রতিনিধি/,
];

export function wantsHuman(text: string): boolean {
  return HUMAN_PATTERNS.some((pattern) => pattern.test(text));
}

/** Canned replies use the same `{variable}` syntax as message templates. */
export function renderCannedReply(body: string, variables: Record<string, string | null | undefined>): string {
  return renderTemplate(body, variables);
}

/** Oldest-first transcript for prompts, newest `max` messages, each trimmed. */
export function formatTranscript(messages: { authorType: string; body: string }[], max = 20): string {
  const label: Record<string, string> = { customer: "Customer", staff: "Agent", bot: "Assistant", system: "System" };
  return messages
    .slice(-max)
    .map((m) => `${label[m.authorType] ?? m.authorType}: ${m.body.replace(/\s+/g, " ").trim().slice(0, 600)}`)
    .join("\n");
}

/** "Bangla" when the text has Bengali letters, else "English" — tells the reply-suggestion prompt which language to answer in. */
export function detectLanguage(text: string): "Bangla" | "English" {
  return /[ঀ-৿]/.test(text) ? "Bangla" : "English";
}

/** The chat assistant's tools (§10.4 "tool calls to our API, with strict guardrails"). Inputs are validated again by the API before running. */
export const ASSISTANT_TOOLS: AiToolDefinition[] = [
  {
    name: "search_products",
    description: "Search the shop's catalog. Returns up to 5 active products with title, price range in taka, whether any size is in stock, and the product link. Use it for any question about what we sell or prices.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Product words, e.g. 'black panjabi' or 'শাড়ি'." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_product",
    description: "Full details of one product: price, colours and sizes with stock for each, fabric, care, and whether a size chart exists. Use the slug from search_products.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "Product slug from search_products." } },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "size_advice",
    description: "Recommend a size for a product from the customer's measurements using the product's size chart. Ask the customer for height and weight (or chest/waist) first.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        height_cm: { type: "number" },
        weight_kg: { type: "number" },
        chest_cm: { type: "number" },
        waist_cm: { type: "number" },
        fit: { type: "string", enum: ["snug", "regular", "loose"] },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "order_status",
    description: "Status, items, total and delivery tracking of the customer's order. Needs the order number; the phone number is taken from the chat when known, otherwise ask the customer for the phone number used on the order.",
    inputSchema: {
      type: "object",
      properties: {
        order_number: { type: "string" },
        phone: { type: "string", description: "Phone number on the order, only if the chat doesn't already know it." },
      },
      required: ["order_number"],
      additionalProperties: false,
    },
  },
  {
    name: "handoff_to_human",
    description: "Hand the conversation to a staff member. Use when the customer asks for a person, is upset, wants a refund/return/cancellation/payment fix, or you cannot help. After calling it, tell the customer a team member will reply soon.",
    inputSchema: {
      type: "object",
      properties: { reason: { type: "string", description: "One short sentence for the staff member." } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

export const ASSISTANT_MAX_TOOL_ROUNDS = 4;
