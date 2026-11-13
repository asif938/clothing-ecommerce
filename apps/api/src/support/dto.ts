import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";
import { CONVERSATION_CHANNELS, CONVERSATION_STATUSES, TICKET_PRIORITIES, TICKET_STATUSES, TICKET_TYPES } from "@clothing/shared/support";

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(30);

export const listConversationsQuerySchema = z.object({
  status: z.enum([...CONVERSATION_STATUSES, "active"]).optional(),
  channel: z.enum(CONVERSATION_CHANNELS).optional(),
  assigned: z.enum(["me", "unassigned", "all"]).default("all"),
  q: z.string().trim().max(100).optional(),
  page,
  pageSize,
});
export type ListConversationsQueryDto = z.infer<typeof listConversationsQuerySchema>;

export const messageBodySchema = z.object({ body: z.string().trim().min(1).max(4000) });
export type MessageBodyDto = z.infer<typeof messageBodySchema>;

export const assignSchema = z.object({ staffId: z.string().min(1).nullable() });
export type AssignDto = z.infer<typeof assignSchema>;

export const conversationStatusSchema = z.object({ status: z.enum(CONVERSATION_STATUSES) });
export type ConversationStatusDto = z.infer<typeof conversationStatusSchema>;

export const botSchema = z.object({ active: z.boolean() });
export type BotDto = z.infer<typeof botSchema>;

export const linkOrderSchema = z.object({ orderId: z.string().min(1) });
export type LinkOrderDto = z.infer<typeof linkOrderSchema>;

/** Admin test helper for mock channels: posts a fake inbound message. */
export const simulateInboundSchema = z.object({
  instanceId: z.string().min(1),
  contactId: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(2000),
  name: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(20).optional(),
});
export type SimulateInboundDto = z.infer<typeof simulateInboundSchema>;

export const listTicketsQuerySchema = z.object({
  status: z.enum([...TICKET_STATUSES, "active"]).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assigned: z.enum(["me", "unassigned", "all"]).default("all"),
  breached: z.coerce.boolean().optional(),
  q: z.string().trim().max(100).optional(),
  orderId: z.string().optional(),
  customerId: z.string().optional(),
  page,
  pageSize,
});
export type ListTicketsQueryDto = z.infer<typeof listTicketsQuerySchema>;

export const createTicketSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  type: z.enum(TICKET_TYPES).default("general"),
  priority: z.enum(TICKET_PRIORITIES).default("normal"),
  customerId: z.string().min(1).optional(),
  orderId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  contactName: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(20).optional(),
  assignedTo: z.string().min(1).nullable().optional(),
});
export type CreateTicketDto = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  type: z.enum(TICKET_TYPES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  assignedTo: z.string().min(1).nullable().optional(),
});
export type UpdateTicketDto = z.infer<typeof updateTicketSchema>;

export const ticketMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  internal: z.boolean().default(false),
  /** Send a customer-visible reply through the linked conversation too. */
  sendToConversation: z.boolean().default(true),
});
export type TicketMessageDto = z.infer<typeof ticketMessageSchema>;

export const cannedReplySchema = z.object({
  title: z.string().trim().min(1).max(120),
  shortcut: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{2,30}$/, "2–30 letters, digits, - or _"),
  body: localizedTextSchema,
  category: z.string().trim().max(60).nullable().optional(),
});
export type CannedReplyDto = z.infer<typeof cannedReplySchema>;

export const renderCannedSchema = z.object({ conversationId: z.string().min(1).nullable().default(null), locale: z.enum(["bn", "en"]).default("bn") });
export type RenderCannedDto = z.infer<typeof renderCannedSchema>;

export const startCallSchema = z.object({
  phone: z.string().trim().min(5).max(20),
  orderId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
});
export type StartCallDto = z.infer<typeof startCallSchema>;

export const myPhoneSchema = z.object({ phone: z.string().trim().max(20).nullable() });
export type MyPhoneDto = z.infer<typeof myPhoneSchema>;

export const callOutcomeSchema = z.object({
  status: z.enum(["answered", "completed", "no_answer", "busy", "failed"]),
  durationSeconds: z.number().int().min(0).max(86_400).nullable().default(null),
});
export type CallOutcomeDto = z.infer<typeof callOutcomeSchema>;

export const listCallsQuerySchema = z.object({ mine: z.coerce.boolean().optional(), orderId: z.string().optional(), page, pageSize });
export type ListCallsQueryDto = z.infer<typeof listCallsQuerySchema>;

export const liveChatQuerySchema = z.object({ after: z.coerce.date().optional(), locale: z.enum(["bn", "en"]).default("bn") });
export type LiveChatQueryDto = z.infer<typeof liveChatQuerySchema>;

export const liveChatSendSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  name: z.string().trim().max(100).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
});
export type LiveChatSendDto = z.infer<typeof liveChatSendSchema>;

export const liveChatHandoffSchema = z.object({ locale: z.enum(["bn", "en"]).default("bn") });
export type LiveChatHandoffDto = z.infer<typeof liveChatHandoffSchema>;
