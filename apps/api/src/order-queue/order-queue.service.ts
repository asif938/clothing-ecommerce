import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { OrderStatus, Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { applyOrderFieldAccess, fieldAccessFor } from "../common/field-masking";
import { pickAssignee, type QueueStrategy } from "./pick-assignee";

/** Statuses that count as "open work" on someone's queue (§8.2: call-centre confirmation through warehouse hand-off). */
const OPEN_STATUSES: OrderStatus[] = ["pending", "confirmed", "on_hold", "processing"];
/** The call-centre's working set: not yet confirmed or waiting on a decision. */
const MY_QUEUE_STATUSES: OrderStatus[] = ["pending", "on_hold", "confirmed"];

export const KANBAN_COLUMNS: OrderStatus[] = ["pending", "on_hold", "confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered"];
const KANBAN_CARDS_PER_COLUMN = 30;

const CARD_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  total: true,
  codAmount: true,
  paymentStatus: true,
  riskLevel: true,
  assignedTo: true,
  tags: true,
  createdAt: true,
  billingContact: true,
  shippingAddress: true,
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

/** §16 M11 — order queue auto-assignment, "my queue", and the Kanban board. */
@Injectable()
export class OrderQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async queueCandidates() {
    const staff = await this.prisma.staffUser.findMany({
      where: { status: "active", deletedAt: null, takesOrderQueue: true },
      select: { id: true, lastQueueAssignedAt: true },
    });
    if (staff.length === 0) return [];
    const open = await this.prisma.order.groupBy({ by: ["assignedTo"], where: { assignedTo: { in: staff.map((s) => s.id) }, status: { in: OPEN_STATUSES } }, _count: { _all: true } });
    const openById = new Map(open.map((o) => [o.assignedTo, o._count._all]));
    return staff.map((s) => ({ id: s.id, openCount: openById.get(s.id) ?? 0, lastAssignedAt: s.lastQueueAssignedAt }));
  }

  /** Assigns an unassigned order to the next executive. Returns the staff id, or null when nobody is in the queue or the order is already taken. */
  async autoAssign(orderId: string, source: "placement" | "automation" | "manual", actor?: AuthenticatedStaff): Promise<string | null> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true, assignedTo: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.assignedTo) return null;

    const strategy = await this.settings.getValue<QueueStrategy>("orders.queue.strategy");
    const staffId = pickAssignee(await this.queueCandidates(), strategy);
    if (!staffId) return null;

    // Guarded update: if a concurrent assignment won the race, assign nothing.
    const claimed = await this.prisma.order.updateMany({ where: { id: orderId, assignedTo: null }, data: { assignedTo: staffId } });
    if (claimed.count === 0) return null;
    await this.prisma.staffUser.update({ where: { id: staffId }, data: { lastQueueAssignedAt: new Date() } });
    await this.prisma.orderEvent.create({
      data: { orderId, type: "assigned", data: { to: staffId, auto: true, source, strategy }, actor: actor ? { type: "staff", id: actor.id } : { type: "system" } },
    });
    await this.audit.record({ actorType: actor ? "staff" : "system", actorId: actor?.id, action: "order.auto_assign", entityType: "order", entityId: orderId, after: { assignedTo: staffId, source, strategy } });
    return staffId;
  }

  async myQueue(staff: AuthenticatedStaff) {
    const enforced = await this.settings.getValue<boolean>("security.fieldMasking.enabled");
    const access = fieldAccessFor(staff, enforced);
    const orders = await this.prisma.order.findMany({ where: { assignedTo: staff.id, status: { in: MY_QUEUE_STATUSES } }, orderBy: { createdAt: "asc" }, take: 200, select: CARD_SELECT });
    return orders.map((o) => applyOrderFieldAccess(o, access));
  }

  async kanban(staff: AuthenticatedStaff, assignedTo?: string) {
    const enforced = await this.settings.getValue<boolean>("security.fieldMasking.enabled");
    const access = fieldAccessFor(staff, enforced);
    const where = (status: OrderStatus): Prisma.OrderWhereInput => ({ status, ...(assignedTo ? { assignedTo } : {}) });
    const columns = await Promise.all(
      KANBAN_COLUMNS.map(async (status) => {
        const [count, orders] = await Promise.all([
          this.prisma.order.count({ where: where(status) }),
          this.prisma.order.findMany({ where: where(status), orderBy: { createdAt: status === "delivered" ? "desc" : "asc" }, take: KANBAN_CARDS_PER_COLUMN, select: CARD_SELECT }),
        ]);
        return { status, count, cards: orders.map((o) => applyOrderFieldAccess(o, access)) };
      }),
    );
    return { columns, cardsPerColumn: KANBAN_CARDS_PER_COLUMN };
  }

  async staffList() {
    const staff = await this.prisma.staffUser.findMany({
      where: { status: "active", deletedAt: null },
      select: { id: true, name: true, email: true, takesOrderQueue: true, lastQueueAssignedAt: true },
      orderBy: { name: "asc" },
    });
    const open = await this.prisma.order.groupBy({ by: ["assignedTo"], where: { assignedTo: { in: staff.map((s) => s.id) }, status: { in: OPEN_STATUSES } }, _count: { _all: true } });
    const openById = new Map(open.map((o) => [o.assignedTo, o._count._all]));
    return staff.map((s) => ({ ...s, openCount: openById.get(s.id) ?? 0 }));
  }

  async setParticipation(staffId: string, takesOrderQueue: boolean, actor: AuthenticatedStaff) {
    const target = await this.prisma.staffUser.findFirst({ where: { id: staffId, deletedAt: null } });
    if (!target) throw new NotFoundException("Staff member not found");
    if (target.status !== "active") throw new BadRequestException({ code: "STAFF_DISABLED", message: "A disabled staff member can't take orders." });
    const updated = await this.prisma.staffUser.update({ where: { id: staffId }, data: { takesOrderQueue }, select: { id: true, name: true, takesOrderQueue: true } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "order_queue.participation", entityType: "staff", entityId: staffId, before: { takesOrderQueue: target.takesOrderQueue }, after: { takesOrderQueue } });
    return updated;
  }
}
