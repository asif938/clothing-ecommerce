import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { OrdersLifecycleService } from "../checkout/orders-lifecycle.service";
import { applyOrderFieldAccess, fieldAccessFor } from "../common/field-masking";
import { SettingsService } from "../settings/settings.service";
import type { AddCallOutcomeDto, AddManualPaymentDto, AddNoteDto, AssignOrderDto, BulkActionDto, ListOrdersQueryDto, SetTagsDto, TransitionOrderDto } from "./dto";

const DETAIL_INCLUDE = {
  items: true,
  events: { orderBy: { createdAt: "asc" } as const },
  payments: { orderBy: { createdAt: "asc" } as const },
  refunds: { orderBy: { createdAt: "asc" } as const },
  shipments: { include: { events: { orderBy: { occurredAt: "asc" as const } } }, orderBy: { createdAt: "desc" as const } },
  returns: { orderBy: { createdAt: "desc" as const } },
  discounts: true,
} satisfies Prisma.OrderInclude;

/** §8.2 "Orders" module — list/detail/notes/call-outcomes/assign/tags/status actions/bulk/manual payments. Manual order creation is `ManualOrderService`; edit-before-ship is `OrderEditService`; both live alongside this. */
@Injectable()
export class OrdersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lifecycle: OrdersLifecycleService,
    private readonly settings: SettingsService,
  ) {}

  /** Field-level permissions (§16 M11): resolves what this staff member may see of an order. */
  private async accessFor(staff: AuthenticatedStaff | undefined) {
    return fieldAccessFor(staff, await this.settings.getValue<boolean>("security.fieldMasking.enabled"));
  }

  async list(query: ListOrdersQueryDto, staff?: AuthenticatedStaff) {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus as never } : {}),
      ...(query.riskLevel ? { riskLevel: query.riskLevel as never } : {}),
      ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.duplicatesOnly ? { possibleDuplicateOrderIds: { isEmpty: false } } : {}),
      ...(query.dateFrom || query.dateTo ? { createdAt: { gte: query.dateFrom, lte: query.dateTo } } : {}),
      ...(query.search
        ? { OR: [{ orderNumber: { contains: query.search, mode: "insensitive" } }, { billingContact: { path: ["phone"], string_contains: query.search } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize, include: { items: { select: { id: true } } } }),
      this.prisma.order.count({ where }),
    ]);
    const access = await this.accessFor(staff);
    return { data: data.map((o) => applyOrderFieldAccess(o, access)), meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async detail(id: string, staff?: AuthenticatedStaff) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!order) throw new NotFoundException("Order not found");
    return applyOrderFieldAccess(order, await this.accessFor(staff));
  }

  /** §6.6 duplicate detection, surfaced for staff to review side by side. */
  async duplicates(id: string) {
    const order = await this.ensureExists(id);
    if (order.possibleDuplicateOrderIds.length === 0) return [];
    return await this.prisma.order.findMany({
      where: { id: { in: order.possibleDuplicateOrderIds } },
      select: { id: true, orderNumber: true, status: true, total: true, createdAt: true },
    });
  }

  async addNote(id: string, dto: AddNoteDto, actor: AuthenticatedStaff) {
    await this.ensureExists(id);
    await this.prisma.orderEvent.create({ data: { orderId: id, type: "note", data: { note: dto.note }, actor: { type: "staff", id: actor.id } } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "order.note", entityType: "order", entityId: id });
  }

  async addCallOutcome(id: string, dto: AddCallOutcomeDto, actor: AuthenticatedStaff) {
    await this.ensureExists(id);
    await this.prisma.orderEvent.create({
      data: { orderId: id, type: "call_attempt", data: { outcome: dto.outcome, note: dto.note }, actor: { type: "staff", id: actor.id } },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "order.call_attempt", entityType: "order", entityId: id, after: { outcome: dto.outcome } });

    // "confirmed" is the one outcome that's also a real state-machine move (§8.2 call-centre tools).
    if (dto.outcome === "confirmed") {
      const order = await this.prisma.order.findUnique({ where: { id } });
      if (order?.status === "pending") await this.lifecycle.transition({ orderId: id, to: "confirmed", actor: { type: "staff", id: actor.id } });
    }
  }

  async assign(id: string, dto: AssignOrderDto, actor: AuthenticatedStaff) {
    const before = await this.ensureExists(id);
    const updated = await this.prisma.order.update({ where: { id }, data: { assignedTo: dto.staffId } });
    await this.prisma.orderEvent.create({ data: { orderId: id, type: "assigned", data: { to: dto.staffId }, actor: { type: "staff", id: actor.id } } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "order.assign", entityType: "order", entityId: id, before: { assignedTo: before.assignedTo }, after: { assignedTo: dto.staffId } });
    return updated;
  }

  async setTags(id: string, dto: SetTagsDto, actor: AuthenticatedStaff) {
    const before = await this.ensureExists(id);
    const updated = await this.prisma.order.update({ where: { id }, data: { tags: dto.tags } });
    await this.prisma.orderEvent.create({ data: { orderId: id, type: "tag", data: { tags: dto.tags }, actor: { type: "staff", id: actor.id } } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "order.tags", entityType: "order", entityId: id, before: { tags: before.tags }, after: { tags: dto.tags } });
    return updated;
  }

  async transition(id: string, dto: TransitionOrderDto, actor: AuthenticatedStaff) {
    await this.ensureExists(id);
    await this.lifecycle.transition({ orderId: id, to: dto.to, actor: { type: "staff", id: actor.id }, reason: dto.reason ?? undefined });
    return await this.detail(id, actor);
  }

  /** §8.2 "payments (add manual payment, record trx id)" — a payment the gateway never saw (cash handed over, bKash sent to a personal number, …), recorded directly as `succeeded`. */
  async addManualPayment(id: string, dto: AddManualPaymentDto, actor: AuthenticatedStaff) {
    const order = await this.ensureExists(id);
    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: { orderId: id, method: dto.method, purpose: dto.purpose, amount: dto.amount, status: "succeeded", externalRef: dto.externalRef, paidAt: new Date() },
      });
      const paidTotal = order.paidTotal + dto.amount;
      await tx.order.update({ where: { id }, data: { paidTotal, paymentStatus: paidTotal >= order.total ? "paid" : "partially_paid" } });
      await tx.orderEvent.create({ data: { orderId: id, type: "payment", data: { manual: true, method: dto.method, amount: dto.amount, result: "succeeded" }, actor: { type: "staff", id: actor.id } } });
      return created;
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "order.manual_payment", entityType: "order", entityId: id, after: payment });
    return payment;
  }

  async bulk(dto: BulkActionDto, actor: AuthenticatedStaff) {
    const results: { orderId: string; ok: boolean; error?: string }[] = [];
    for (const orderId of dto.orderIds) {
      try {
        if (dto.action === "confirm") await this.lifecycle.transition({ orderId, to: "confirmed", actor: { type: "staff", id: actor.id } });
        else if (dto.action === "cancel") await this.lifecycle.transition({ orderId, to: "cancelled", actor: { type: "staff", id: actor.id }, reason: dto.reason ?? "Bulk cancellation" });
        else if (dto.action === "tag" && dto.tag) await this.prisma.order.update({ where: { id: orderId }, data: { tags: { push: dto.tag } } });
        else if (dto.action === "assign") await this.prisma.order.update({ where: { id: orderId }, data: { assignedTo: dto.staffId } });
        results.push({ orderId, ok: true });
      } catch (error) {
        results.push({ orderId, ok: false, error: error instanceof Error ? error.message : "Unknown error" });
      }
    }
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: `order.bulk_${dto.action}`, entityType: "order", entityId: dto.orderIds.join(","), after: { count: dto.orderIds.length } });
    return { results };
  }

  private async ensureExists(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }
}
