import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, type Conversation, type ConversationChannel, type ConversationStatus, type ProviderInstance } from "@clothing/db";
import { normalizeBdPhone, t } from "@clothing/shared";
import { canReply, detectLanguage, formatTranscript, wantsHuman } from "@clothing/shared/support";
import type { InboundChatMessage, InboxEvent } from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { CacheService } from "../cache/cache.service";
import { StaffNotificationsService } from "../notifications/staff-notifications.service";
import { AiService } from "../ai/ai.service";
import { isUniqueViolation } from "../common/document-number";
import type { AuthenticatedStaff } from "../common/types";
import { ChannelsService } from "./channels.service";

const PREVIEW_LENGTH = 140;
const MESSAGE_PAGE = 100;

export interface ListConversationsFilter {
  status?: ConversationStatus | "active";
  channel?: ConversationChannel;
  assigned?: "me" | "unassigned" | "all";
  q?: string;
  page: number;
  pageSize: number;
}

function preview(body: string, attachments: unknown[]): string {
  const text = body.trim() || (attachments.length ? `[${(attachments[0] as { type?: string }).type ?? "attachment"}]` : "");
  return text.slice(0, PREVIEW_LENGTH);
}

/**
 * Unified support inbox (docs/PROJECT_SPEC.md §8.2 Support, §16 M15):
 * WhatsApp, Messenger, Instagram and live chat land in one `conversations`
 * table. Inbound webhooks are idempotent (provider message id is unique per
 * conversation); replies go out through the conversation's own provider and
 * respect Meta's 24-hour window. A staff reply switches the AI assistant off
 * for that conversation.
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);
  /** Set by AssistantService at startup — avoids a constructor cycle. */
  private botTrigger: ((conversationId: string) => void) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly staffNotifications: StaffNotificationsService,
    private readonly ai: AiService,
    private readonly channels: ChannelsService,
  ) {}

  registerBotTrigger(trigger: (conversationId: string) => void): void {
    this.botTrigger = trigger;
  }

  // ---------------------------------------------------------------------------
  // Inbound
  // ---------------------------------------------------------------------------

  private async assistantHandles(channel: ConversationChannel): Promise<boolean> {
    if (!(await this.settings.getValue<boolean>("support.assistant.enabled"))) return false;
    return (await this.settings.getValue<ConversationChannel[]>("support.assistant.channels")).includes(channel);
  }

  /** Webhook events for one provider instance. Returns how many new messages were stored. */
  async ingest(instance: ProviderInstance | null, channel: ConversationChannel, events: InboxEvent[], context: { customerId?: string | null } = {}): Promise<number> {
    let stored = 0;
    for (const event of events) {
      if (event.kind === "status") {
        await this.prisma.conversationMessage.updateMany({
          where: { externalId: event.externalMessageId, direction: "outbound" },
          data: { deliveryStatus: event.status, ...(event.error ? { error: event.error.slice(0, 500) } : {}) },
        });
        continue;
      }
      if (await this.storeInbound(instance, channel, event, context.customerId ?? null)) stored++;
    }
    return stored;
  }

  private async storeInbound(instance: ProviderInstance | null, channel: ConversationChannel, event: InboundChatMessage, customerId: string | null): Promise<boolean> {
    const phone = event.phone ? normalizeBdPhone(event.phone) : null;
    let conversation = await this.prisma.conversation.findUnique({ where: { channel_contactId: { channel, contactId: event.contactId } } });
    const isNew = !conversation;
    if (!conversation) {
      const customer = customerId ? { id: customerId } : phone ? await this.prisma.customer.findUnique({ where: { phone }, select: { id: true } }) : null;
      try {
        conversation = await this.prisma.conversation.create({
          data: {
            channel,
            providerInstanceId: instance?.id ?? null,
            contactId: event.contactId,
            contactName: event.contactName ?? null,
            contactPhone: phone,
            customerId: customer?.id ?? null,
            botActive: await this.assistantHandles(channel),
          },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        conversation = await this.prisma.conversation.findUniqueOrThrow({ where: { channel_contactId: { channel, contactId: event.contactId } } });
      }
    }

    try {
      await this.prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          direction: "inbound",
          authorType: "customer",
          body: event.text.slice(0, 10_000),
          attachments: event.attachments.length ? (event.attachments as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          externalId: event.externalMessageId,
          deliveryStatus: "received",
          createdAt: event.timestamp,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return false; // webhook retry of a message we already have
      throw error;
    }

    const humanAsked = wantsHuman(event.text);
    const reopened = conversation.status === "resolved";
    // A thread the customer reopens after it was resolved goes back to the assistant (when it handles this channel).
    const botActive = (reopened ? await this.assistantHandles(channel) : conversation.botActive) && !humanAsked;
    conversation = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: event.timestamp,
        lastInboundAt: event.timestamp,
        lastMessagePreview: preview(event.text, event.attachments),
        unreadCount: { increment: 1 },
        ...(event.contactName && !conversation.contactName ? { contactName: event.contactName } : {}),
        ...(phone && !conversation.contactPhone ? { contactPhone: phone } : {}),
        ...(customerId && !conversation.customerId ? { customerId } : {}),
        // A customer writing again reopens a resolved thread; asking for a person always lands in "waiting for agent".
        ...(humanAsked ? { status: "waiting_agent", botActive: false, handoffReason: "Customer asked for a person" } : reopened || conversation.status === "pending" ? { status: "open" } : {}),
        botActive,
        ...(botActive ? { botPendingSince: new Date() } : {}),
      },
    });

    if (humanAsked) await this.notifyHandoff(conversation, "Customer asked for a person");
    else if (isNew && !botActive) await this.notifyNew(conversation);
    if (botActive) this.botTrigger?.(conversation.id);
    return true;
  }

  private async notifyNew(conversation: Conversation): Promise<void> {
    await this.staffNotifications
      .notifyStaffWithPermission({
        type: "support_conversation",
        title: { bn: `নতুন বার্তা (${conversation.channel})`, en: `New message (${conversation.channel})` },
        body: { bn: conversation.lastMessagePreview ?? "", en: conversation.lastMessagePreview ?? "" },
        link: `/support/inbox?c=${conversation.id}`,
        permission: "support.inbox",
      })
      .catch((error: unknown) => this.logger.warn(`Inbox alert failed: ${error instanceof Error ? error.message : "Unknown error"}`));
  }

  async notifyHandoff(conversation: Conversation, reason: string): Promise<void> {
    const payload = {
      type: "support_handoff",
      title: { bn: "গ্রাহক একজন প্রতিনিধি চান", en: "A customer is waiting for an agent" },
      body: { bn: `${conversation.contactName ?? conversation.contactPhone ?? conversation.channel}: ${reason}`, en: `${conversation.contactName ?? conversation.contactPhone ?? conversation.channel}: ${reason}` },
      link: `/support/inbox?c=${conversation.id}`,
    };
    const send = conversation.assignedTo ? this.staffNotifications.notifyStaff(conversation.assignedTo, payload) : this.staffNotifications.notifyStaffWithPermission({ ...payload, permission: "support.inbox" });
    await send.catch((error: unknown) => this.logger.warn(`Handoff alert failed: ${error instanceof Error ? error.message : "Unknown error"}`));
  }

  // ---------------------------------------------------------------------------
  // Outbound
  // ---------------------------------------------------------------------------

  /** Stores and sends one outbound message. Failures are recorded on the message (and rethrown for staff sends). */
  async sendOutbound(conversation: Conversation, body: string, author: { type: "staff" | "bot" | "system"; staffId?: string | null; toolTrace?: unknown }): Promise<{ id: string; deliveryStatus: string; error: string | null }> {
    if (!canReply(conversation.channel, conversation.lastInboundAt, new Date())) {
      throw new BadRequestException({ code: "REPLY_WINDOW_CLOSED", message: "More than 24 hours since the customer's last message — Meta only allows replies inside that window. Contact them another way (call or SMS)." });
    }
    const message = await this.prisma.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        direction: "outbound",
        authorType: author.type,
        staffId: author.staffId ?? null,
        body,
        deliveryStatus: conversation.channel === "live_chat" ? "sent" : "queued",
        toolTrace: author.toolTrace === undefined ? Prisma.DbNull : (author.toolTrace as Prisma.InputJsonValue),
      },
    });
    let deliveryStatus: string = message.deliveryStatus;
    let error: string | null = null;
    if (conversation.channel !== "live_chat") {
      try {
        const adapter = await this.channels.adapterForConversation(conversation);
        const sent = await adapter.send(conversation.contactId, body);
        deliveryStatus = "sent";
        await this.prisma.conversationMessage.update({ where: { id: message.id }, data: { deliveryStatus: "sent", externalId: sent.externalMessageId } });
      } catch (err) {
        deliveryStatus = "failed";
        error = (err instanceof Error ? err.message : "Send failed").slice(0, 500);
        await this.prisma.conversationMessage.update({ where: { id: message.id }, data: { deliveryStatus: "failed", error } });
      }
    }
    await this.prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date(), lastMessagePreview: preview(body, []) } });
    return { id: message.id, deliveryStatus, error };
  }

  async reply(id: string, body: string, actor: AuthenticatedStaff) {
    const conversation = await this.get(id);
    const result = await this.sendOutbound(conversation, body, { type: "staff", staffId: actor.id });
    // A person has taken over: the assistant stops, the thread is theirs, and it now waits on the customer.
    await this.prisma.conversation.update({
      where: { id },
      data: { botActive: false, botPendingSince: null, unreadCount: 0, status: "pending", ...(conversation.assignedTo ? {} : { assignedTo: actor.id }) },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "conversation.reply", entityType: "conversation", entityId: id, after: { messageId: result.id, deliveryStatus: result.deliveryStatus } });
    if (result.error) throw new HttpException({ code: "SEND_FAILED", message: `Saved, but the channel rejected it: ${result.error}`, messageId: result.id }, HttpStatus.BAD_GATEWAY);
    return result;
  }

  async note(id: string, body: string, actor: AuthenticatedStaff) {
    await this.get(id);
    const message = await this.prisma.conversationMessage.create({ data: { conversationId: id, direction: "internal", authorType: "staff", staffId: actor.id, body, deliveryStatus: "sent" } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "conversation.note", entityType: "conversation", entityId: id, after: { messageId: message.id } });
    return message;
  }

  // ---------------------------------------------------------------------------
  // Reads & management
  // ---------------------------------------------------------------------------

  async list(filter: ListConversationsFilter, actor: AuthenticatedStaff) {
    const where: Prisma.ConversationWhereInput = {
      ...(filter.status === "active" ? { status: { in: ["open", "waiting_agent", "pending"] } } : filter.status ? { status: filter.status } : {}),
      ...(filter.channel ? { channel: filter.channel } : {}),
      ...(filter.assigned === "me" ? { assignedTo: actor.id } : filter.assigned === "unassigned" ? { assignedTo: null } : {}),
      ...(filter.q
        ? { OR: [{ contactName: { contains: filter.q, mode: "insensitive" } }, { contactPhone: { contains: filter.q } }, { lastMessagePreview: { contains: filter.q, mode: "insensitive" } }] }
        : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        // Waiting-for-agent first, then most recent activity.
        orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
    ]);
    return { total, page: filter.page, pageSize: filter.pageSize, items };
  }

  async summary(actor: AuthenticatedStaff) {
    const [waiting, unassigned, mine, unread] = await Promise.all([
      this.prisma.conversation.count({ where: { status: "waiting_agent" } }),
      this.prisma.conversation.count({ where: { status: { in: ["open", "waiting_agent"] }, assignedTo: null, botActive: false } }),
      this.prisma.conversation.count({ where: { status: { in: ["open", "waiting_agent", "pending"] }, assignedTo: actor.id } }),
      this.prisma.conversation.count({ where: { status: { in: ["open", "waiting_agent"] }, unreadCount: { gt: 0 } } }),
    ]);
    return { waiting, unassigned, mine, unread };
  }

  async get(id: string): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new NotFoundException("Conversation not found");
    return conversation;
  }

  async detail(id: string) {
    const conversation = await this.get(id);
    const messages = await this.prisma.conversationMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: "desc" }, take: MESSAGE_PAGE });
    if (conversation.unreadCount > 0) await this.prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    return { conversation: { ...conversation, unreadCount: 0 }, messages: messages.reverse(), canReply: canReply(conversation.channel, conversation.lastInboundAt, new Date()) };
  }

  /** Side panel: who this is and what they've ordered. */
  async context(id: string) {
    const conversation = await this.get(id);
    const customer = conversation.customerId
      ? await this.prisma.customer.findUnique({ where: { id: conversation.customerId }, select: { id: true, name: true, phone: true, email: true, ordersCount: true, totalSpent: true, tags: true, createdAt: true } })
      : null;
    const phone = customer?.phone ?? conversation.contactPhone;
    const orderFilters: Prisma.OrderWhereInput[] = [];
    if (customer) orderFilters.push({ customerId: customer.id });
    if (phone) orderFilters.push({ billingContact: { path: ["phone"], equals: phone } });
    if (conversation.orderIds.length) orderFilters.push({ id: { in: conversation.orderIds } });
    const orders = orderFilters.length
      ? await this.prisma.order.findMany({
          where: { OR: orderFilters },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, orderNumber: true, status: true, total: true, createdAt: true, channel: true },
        })
      : [];
    const tickets = await this.prisma.ticket.findMany({ where: { OR: [{ conversationId: id }, ...(customer ? [{ customerId: customer.id }] : [])] }, orderBy: { createdAt: "desc" }, take: 5 });
    return { customer, phone, orders, tickets };
  }

  async assign(id: string, staffId: string | null, actor: AuthenticatedStaff, canManage: boolean) {
    const before = await this.get(id);
    if (staffId && staffId !== actor.id && !canManage) throw new ForbiddenException({ code: "FORBIDDEN", message: "You can only assign conversations to yourself." });
    if (staffId) {
      const staff = await this.prisma.staffUser.findUnique({ where: { id: staffId }, select: { id: true } });
      if (!staff) throw new BadRequestException({ code: "UNKNOWN_STAFF", message: "No such staff member." });
    }
    const after = await this.prisma.conversation.update({ where: { id }, data: { assignedTo: staffId } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "conversation.assign", entityType: "conversation", entityId: id, before: { assignedTo: before.assignedTo }, after: { assignedTo: staffId } });
    if (staffId && staffId !== actor.id) {
      await this.staffNotifications
        .notifyStaff(staffId, { type: "support_assigned", title: { bn: "আপনাকে একটি কথোপকথন দেওয়া হয়েছে", en: "A conversation was assigned to you" }, body: { bn: after.lastMessagePreview ?? "", en: after.lastMessagePreview ?? "" }, link: `/support/inbox?c=${id}` })
        .catch(() => undefined);
    }
    return after;
  }

  async setStatus(id: string, status: ConversationStatus, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const after = await this.prisma.conversation.update({ where: { id }, data: { status, ...(status === "resolved" ? { botActive: false, botPendingSince: null, unreadCount: 0 } : {}) } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "conversation.status", entityType: "conversation", entityId: id, before: { status: before.status }, after: { status } });
    return after;
  }

  async setBot(id: string, active: boolean, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const after = await this.prisma.conversation.update({ where: { id }, data: { botActive: active, ...(active ? { handoffReason: null, status: "open" } : { botPendingSince: null }) } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "conversation.bot", entityType: "conversation", entityId: id, before: { botActive: before.botActive }, after: { botActive: active } });
    return after;
  }

  async linkOrder(id: string, orderId: string, actor: AuthenticatedStaff) {
    const conversation = await this.get(id);
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true, customerId: true } });
    if (!order) throw new BadRequestException({ code: "UNKNOWN_ORDER", message: "No such order." });
    const after = await this.prisma.conversation.update({
      where: { id },
      data: { orderIds: conversation.orderIds.includes(orderId) ? conversation.orderIds : [...conversation.orderIds, orderId], ...(order.customerId && !conversation.customerId ? { customerId: order.customerId } : {}) },
    });
    await this.prisma.conversationMessage.create({ data: { conversationId: id, direction: "internal", authorType: "system", staffId: actor.id, body: `Order ${order.orderNumber} created from this conversation.`, deliveryStatus: "sent" } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "conversation.link_order", entityType: "conversation", entityId: id, after: { orderId } });
    return after;
  }

  /** AI reply suggestions (§8.2 "AI reply suggestions") — returned to the composer, never sent automatically. */
  async suggestions(id: string, actor: AuthenticatedStaff) {
    const conversation = await this.get(id);
    const messages = await this.prisma.conversationMessage.findMany({ where: { conversationId: id, direction: { not: "internal" } }, orderBy: { createdAt: "desc" }, take: 20 });
    messages.reverse();
    const lastCustomer = [...messages].reverse().find((m) => m.authorType === "customer");
    if (!lastCustomer) throw new BadRequestException({ code: "NOTHING_TO_ANSWER", message: "The customer hasn't written anything yet." });
    const ctx = await this.context(id);
    const customerContext = [
      ctx.customer ? `Customer since ${ctx.customer.createdAt.toISOString().slice(0, 10)}, ${ctx.customer.ordersCount} orders` : "Not a registered customer",
      ...ctx.orders.slice(0, 3).map((o) => `Order ${o.orderNumber}: ${o.status}, ৳${Math.round(o.total / 100)}, placed ${o.createdAt.toISOString().slice(0, 10)}`),
    ].join("; ");
    const result = await this.ai.generate({
      feature: "reply_suggestion",
      variables: {
        channel: conversation.channel.replace("_", " "),
        customer_name: conversation.contactName ?? ctx.customer?.name ?? "",
        customer_context: customerContext,
        conversation: formatTranscript(messages),
        language: detectLanguage(lastCustomer.body),
      },
      actor,
      entity: { type: "conversation", id },
    });
    return { suggestions: result.output.suggestions, model: result.model };
  }

  async channelList() {
    const instances = await this.prisma.providerInstance.findMany({ where: { capability: { in: ["whatsapp", "chat_channel"] } }, orderBy: [{ capability: "asc" }, { createdAt: "asc" }] });
    return instances.map((instance) => {
      let adapter: { channel: string; isMock: boolean; appSecret: string | null; verifyToken: string | null };
      try {
        adapter = this.channels.adapterFor(instance);
      } catch {
        adapter = { channel: instance.capability === "whatsapp" ? "whatsapp" : instance.driver, isMock: false, appSecret: null, verifyToken: null };
      }
      return {
        id: instance.id,
        name: instance.name,
        capability: instance.capability,
        driver: instance.driver,
        channel: adapter.channel,
        enabled: instance.enabled,
        isMock: adapter.isMock,
        // Real Meta channels can't receive until an app secret + verify token are set.
        readyToReceive: adapter.isMock || (adapter.appSecret !== null && adapter.verifyToken !== null),
        webhookPath: `/webhooks/inbox/${instance.id}`,
      };
    });
  }

  agents() {
    return this.prisma.staffUser.findMany({ where: { status: "active", deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  }

  // ---------------------------------------------------------------------------
  // Live chat (storefront)
  // ---------------------------------------------------------------------------

  private async takeLiveChatToken(visitorId: string): Promise<void> {
    const limit = await this.settings.getValue<number>("support.liveChat.messagesPerMinute");
    const key = `livechat:rate:${visitorId}`;
    const now = Date.now();
    const entry = this.cache.get<{ count: number; resetAt: number }>(key) ?? { count: 0, resetAt: now + 60_000 };
    if (entry.count >= limit) throw new HttpException({ code: "CHAT_RATE_LIMITED", message: "You're sending messages too quickly — please wait a moment." }, HttpStatus.TOO_MANY_REQUESTS);
    entry.count++;
    this.cache.set(key, entry, { ttlSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) });
  }

  private async assertLiveChatEnabled(): Promise<void> {
    if (!(await this.settings.getValue<boolean>("support.liveChat.enabled"))) throw new BadRequestException({ code: "LIVE_CHAT_DISABLED", message: "Live chat is turned off." });
  }

  /** The visitor's thread (customer-visible messages only), newest `after` cursor onward. */
  async liveChatThread(visitorId: string, after: Date | null, locale: string) {
    await this.assertLiveChatEnabled();
    const conversation = await this.prisma.conversation.findUnique({ where: { channel_contactId: { channel: "live_chat", contactId: visitorId } } });
    const greeting = t(await this.settings.getValue<{ bn?: string; en?: string }>("support.liveChat.greeting"), locale === "en" ? "en" : "bn");
    if (!conversation) return { conversationId: null, status: null, greeting, messages: [] };
    const messages = await this.prisma.conversationMessage.findMany({
      where: { conversationId: conversation.id, direction: { not: "internal" }, ...(after ? { createdAt: { gt: after } } : {}) },
      orderBy: { createdAt: "asc" },
      take: MESSAGE_PAGE,
      select: { id: true, direction: true, authorType: true, body: true, createdAt: true },
    });
    return { conversationId: conversation.id, status: conversation.status, waitingForAgent: conversation.status === "waiting_agent", greeting, messages };
  }

  async liveChatSend(visitorId: string, customerId: string | null, input: { text: string; name?: string | null; phone?: string | null }) {
    await this.assertLiveChatEnabled();
    await this.takeLiveChatToken(visitorId);
    const phone = input.phone ? normalizeBdPhone(input.phone) : null;
    await this.ingest(null, "live_chat", [
      { kind: "message", contactId: visitorId, externalMessageId: `lc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, contactName: input.name ?? null, phone, text: input.text, attachments: [], timestamp: new Date() },
    ], { customerId });
    return { ok: true };
  }

  /** "Talk to a person" button in the widget. */
  async liveChatHandoff(visitorId: string, locale: string) {
    await this.assertLiveChatEnabled();
    const conversation = await this.prisma.conversation.findUnique({ where: { channel_contactId: { channel: "live_chat", contactId: visitorId } } });
    if (!conversation) throw new NotFoundException("Start the chat first.");
    if (conversation.status === "waiting_agent") return { ok: true };
    const updated = await this.prisma.conversation.update({ where: { id: conversation.id }, data: { status: "waiting_agent", botActive: false, botPendingSince: null, handoffReason: "Customer pressed “talk to a person”" } });
    await this.prisma.conversationMessage.create({ data: { conversationId: conversation.id, direction: "outbound", authorType: "system", body: t(await this.settings.getValue<{ bn?: string; en?: string }>("support.assistant.handoffMessage"), locale === "en" ? "en" : "bn"), deliveryStatus: "sent" } });
    await this.notifyHandoff(updated, "Customer asked for a person");
    return { ok: true };
  }
}
