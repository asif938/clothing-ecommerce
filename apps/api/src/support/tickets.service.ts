import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, type Ticket, type TicketStatus } from "@clothing/db";
import { normalizeBdPhone } from "@clothing/shared";
import { slaDueAt, slaState, type SlaMinutes } from "@clothing/shared/support";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { StaffNotificationsService } from "../notifications/staff-notifications.service";
import { createWithDocumentNumber } from "../common/document-number";
import type { AuthenticatedStaff } from "../common/types";
import { InboxService } from "./inbox.service";
import type { CreateTicketDto, ListTicketsQueryDto, TicketMessageDto, UpdateTicketDto } from "./dto";

const ENTITY = "ticket";

/**
 * Tickets with SLA (docs/PROJECT_SPEC.md §5.10, §16 M15). Each ticket gets
 * a first-response and a resolution deadline from its priority (settings,
 * calendar minutes); a sweep marks breaches once and alerts the assignee
 * (or everyone with `support.tickets`). A customer-visible reply on a ticket
 * linked to a conversation is sent through that conversation.
 */
@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly staffNotifications: StaffNotificationsService,
    private readonly inbox: InboxService,
  ) {}

  private async slaMinutes(): Promise<{ response: SlaMinutes; resolution: SlaMinutes }> {
    const [response, resolution] = await Promise.all([this.settings.getValue<SlaMinutes>("support.sla.firstResponseMinutes"), this.settings.getValue<SlaMinutes>("support.sla.resolutionMinutes")]);
    return { response, resolution };
  }

  private decorate(ticket: Ticket, minutes: { response: SlaMinutes; resolution: SlaMinutes }, now = new Date()) {
    return {
      ...ticket,
      firstResponseSla: slaState(ticket.firstResponseDueAt, ticket.firstResponseAt, now, minutes.response[ticket.priority]),
      resolutionSla: slaState(ticket.resolutionDueAt, ticket.resolvedAt, now, minutes.resolution[ticket.priority]),
    };
  }

  async list(query: ListTicketsQueryDto, actor: AuthenticatedStaff) {
    const now = new Date();
    const where: Prisma.TicketWhereInput = {
      ...(query.status === "active" ? { status: { in: ["open", "pending"] } } : query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigned === "me" ? { assignedTo: actor.id } : query.assigned === "unassigned" ? { assignedTo: null } : {}),
      ...(query.breached
        ? { status: { in: ["open", "pending"] }, OR: [{ resolutionDueAt: { lt: now } }, { firstResponseAt: null, firstResponseDueAt: { lt: now } }] }
        : {}),
      ...(query.q ? { OR: [{ number: { contains: query.q, mode: "insensitive" } }, { subject: { contains: query.q, mode: "insensitive" } }, { contactPhone: { contains: query.q } }] } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
    };
    const minutes = await this.slaMinutes();
    const [total, items] = await Promise.all([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({ where, orderBy: [{ resolutionDueAt: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items: items.map((t) => this.decorate(t, minutes, now)) };
  }

  private async find(id: string): Promise<Ticket> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return ticket;
  }

  async get(id: string) {
    const ticket = await this.find(id);
    const messages = await this.prisma.ticketMessage.findMany({ where: { ticketId: id }, orderBy: { createdAt: "asc" } });
    const order = ticket.orderId ? await this.prisma.order.findUnique({ where: { id: ticket.orderId }, select: { id: true, orderNumber: true, status: true, total: true } }) : null;
    return { ticket: this.decorate(ticket, await this.slaMinutes()), messages, order };
  }

  async create(dto: CreateTicketDto, actor: AuthenticatedStaff) {
    const minutes = await this.slaMinutes();
    let contactName = dto.contactName ?? null;
    let contactPhone = dto.contactPhone ? normalizeBdPhone(dto.contactPhone) : null;
    let customerId = dto.customerId ?? null;
    if (dto.conversationId) {
      const conversation = await this.inbox.get(dto.conversationId);
      contactName ??= conversation.contactName;
      contactPhone ??= conversation.contactPhone;
      customerId ??= conversation.customerId;
    }
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: dto.orderId }, select: { customerId: true, billingContact: true } });
      if (!order) throw new BadRequestException({ code: "UNKNOWN_ORDER", message: "No such order." });
      const billing = order.billingContact as { name?: string; phone?: string } | null;
      customerId ??= order.customerId;
      contactName ??= billing?.name ?? null;
      contactPhone ??= billing?.phone ?? null;
    }
    const now = new Date();
    const ticket = await createWithDocumentNumber(
      "TCK",
      async (head) => (await this.prisma.ticket.findFirst({ where: { number: { startsWith: head } }, orderBy: { number: "desc" }, select: { number: true } }))?.number ?? null,
      (number) =>
        this.prisma.ticket.create({
          data: {
            number,
            subject: dto.subject,
            type: dto.type,
            priority: dto.priority,
            customerId,
            orderId: dto.orderId ?? null,
            conversationId: dto.conversationId ?? null,
            contactName,
            contactPhone,
            assignedTo: dto.assignedTo ?? actor.id,
            firstResponseDueAt: slaDueAt(now, dto.priority, minutes.response),
            resolutionDueAt: slaDueAt(now, dto.priority, minutes.resolution),
            createdBy: actor.id,
            ...(dto.description ? { messages: { create: { authorType: "staff", staffId: actor.id, body: dto.description, internal: true } } } : {}),
          },
        }),
    );
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "ticket.create", entityType: ENTITY, entityId: ticket.id, after: ticket });
    return this.decorate(ticket, minutes);
  }

  async update(id: string, dto: UpdateTicketDto, actor: AuthenticatedStaff) {
    const before = await this.find(id);
    const minutes = await this.slaMinutes();
    const data: Prisma.TicketUpdateInput = {};
    if (dto.subject !== undefined) data.subject = dto.subject;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.assignedTo !== undefined) data.assignedTo = dto.assignedTo;
    if (dto.priority !== undefined && dto.priority !== before.priority) {
      // Re-prioritising moves the deadlines (measured from creation), and clears a breach the new deadline no longer has.
      data.priority = dto.priority;
      const firstDue = slaDueAt(before.createdAt, dto.priority, minutes.response);
      const resolutionDue = slaDueAt(before.createdAt, dto.priority, minutes.resolution);
      data.firstResponseDueAt = firstDue;
      data.resolutionDueAt = resolutionDue;
      if (before.firstResponseBreachedAt && firstDue > new Date()) data.firstResponseBreachedAt = null;
      if (before.resolutionBreachedAt && resolutionDue > new Date()) data.resolutionBreachedAt = null;
    }
    if (dto.status !== undefined && dto.status !== before.status) {
      data.status = dto.status;
      if (dto.status === "resolved" || dto.status === "closed") data.resolvedAt = before.resolvedAt ?? new Date();
      else data.resolvedAt = null;
    }
    const after = await this.prisma.ticket.update({ where: { id }, data });
    if (dto.status !== undefined && dto.status !== before.status) {
      await this.prisma.ticketMessage.create({ data: { ticketId: id, authorType: "system", staffId: actor.id, body: `Status: ${before.status} → ${dto.status}`, internal: true } });
    }
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "ticket.update", entityType: ENTITY, entityId: id, before, after });
    if (dto.assignedTo && dto.assignedTo !== before.assignedTo && dto.assignedTo !== actor.id) {
      await this.staffNotifications
        .notifyStaff(dto.assignedTo, { type: "support_ticket", title: { bn: `টিকিট ${after.number} আপনাকে দেওয়া হয়েছে`, en: `Ticket ${after.number} assigned to you` }, body: { bn: after.subject, en: after.subject }, link: `/support/tickets/${id}` })
        .catch(() => undefined);
    }
    return this.decorate(after, minutes);
  }

  async addMessage(id: string, dto: TicketMessageDto, actor: AuthenticatedStaff) {
    const ticket = await this.find(id);
    let delivered: string | null = null;
    if (!dto.internal && dto.sendToConversation && ticket.conversationId) {
      const conversation = await this.inbox.get(ticket.conversationId);
      const result = await this.inbox.sendOutbound(conversation, dto.body, { type: "staff", staffId: actor.id });
      delivered = result.deliveryStatus;
    }
    const message = await this.prisma.ticketMessage.create({ data: { ticketId: id, authorType: "staff", staffId: actor.id, body: dto.body, internal: dto.internal } });
    const data: Prisma.TicketUpdateInput = {};
    // The first customer-facing answer meets the first-response SLA; a pending ticket waits on the customer.
    if (!dto.internal && !ticket.firstResponseAt) data.firstResponseAt = new Date();
    if (!dto.internal && ticket.status === "open") data.status = "pending";
    if (Object.keys(data).length > 0) await this.prisma.ticket.update({ where: { id }, data });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: dto.internal ? "ticket.note" : "ticket.reply", entityType: ENTITY, entityId: id, after: { messageId: message.id, delivered } });
    return { message, delivered };
  }

  /** Marks newly breached deadlines once and alerts. */
  async slaSweep(now = new Date()): Promise<number> {
    const active: TicketStatus[] = ["open", "pending"];
    const firstBreaches = await this.prisma.ticket.findMany({ where: { status: { in: active }, firstResponseAt: null, firstResponseDueAt: { lt: now }, firstResponseBreachedAt: null }, take: 100 });
    const resolutionBreaches = await this.prisma.ticket.findMany({ where: { status: { in: active }, resolutionDueAt: { lt: now }, resolutionBreachedAt: null }, take: 100 });
    for (const ticket of firstBreaches) {
      const claimed = await this.prisma.ticket.updateMany({ where: { id: ticket.id, firstResponseBreachedAt: null }, data: { firstResponseBreachedAt: now } });
      if (claimed.count) await this.alertBreach(ticket, "first response");
    }
    for (const ticket of resolutionBreaches) {
      const claimed = await this.prisma.ticket.updateMany({ where: { id: ticket.id, resolutionBreachedAt: null }, data: { resolutionBreachedAt: now } });
      if (claimed.count) await this.alertBreach(ticket, "resolution");
    }
    return firstBreaches.length + resolutionBreaches.length;
  }

  private async alertBreach(ticket: Ticket, which: "first response" | "resolution"): Promise<void> {
    const payload = {
      type: "support_sla",
      title: { bn: `SLA পেরিয়েছে: ${ticket.number}`, en: `SLA missed: ${ticket.number}` },
      body: { bn: `${which === "first response" ? "প্রথম উত্তর" : "সমাধান"} — ${ticket.subject}`, en: `${which} — ${ticket.subject}` },
      link: `/support/tickets/${ticket.id}`,
    };
    const send = ticket.assignedTo ? this.staffNotifications.notifyStaff(ticket.assignedTo, payload) : this.staffNotifications.notifyStaffWithPermission({ ...payload, permission: "support.tickets" });
    await send.catch((error: unknown) => this.logger.warn(`SLA alert failed: ${error instanceof Error ? error.message : "Unknown error"}`));
  }

  /** Small open-ticket counts for the inbox header. */
  async counts(actor: AuthenticatedStaff) {
    const now = new Date();
    const [open, mine, breached] = await Promise.all([
      this.prisma.ticket.count({ where: { status: { in: ["open", "pending"] } } }),
      this.prisma.ticket.count({ where: { status: { in: ["open", "pending"] }, assignedTo: actor.id } }),
      this.prisma.ticket.count({ where: { status: { in: ["open", "pending"] }, OR: [{ resolutionDueAt: { lt: now } }, { firstResponseAt: null, firstResponseDueAt: { lt: now } }] } }),
    ]);
    return { open, mine, breached };
  }
}
