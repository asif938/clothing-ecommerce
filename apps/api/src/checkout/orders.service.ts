import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { StockReservationService } from "./stock-reservation.service";

const CANCELLABLE_STATUSES = new Set(["pending_payment", "pending"]);

/** Customer-facing order endpoints (docs/PROJECT_SPEC.md §11.2 "orders: track by phone+number, mine, detail, invoice, cancel"). Staff order management (edit, confirm, ship, …) is M6's job. */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly stock: StockReservationService,
  ) {}

  async trackByPhoneAndNumber(phone: string, orderNumber: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber }, include: { items: true, events: { orderBy: { createdAt: "asc" } } } });
    const billingPhone = (order?.billingContact as { phone?: string } | null)?.phone;
    if (!order || billingPhone !== phone) throw new NotFoundException("Order not found");
    return order;
  }

  async mine(customerId: string) {
    return await this.prisma.order.findMany({ where: { customerId }, include: { items: true }, orderBy: { createdAt: "desc" } });
  }

  async detail(customerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true, events: { orderBy: { createdAt: "asc" } } } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.customerId !== customerId) throw new ForbiddenException({ code: "FORBIDDEN", message: "Not your order" });
    return order;
  }

  async cancelMine(customerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.customerId !== customerId) throw new ForbiddenException({ code: "FORBIDDEN", message: "Not your order" });
    return await this.cancel(order);
  }

  async cancelByTracking(phone: string, orderNumber: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber }, include: { items: true } });
    const billingPhone = (order?.billingContact as { phone?: string } | null)?.phone;
    if (!order || billingPhone !== phone) throw new NotFoundException("Order not found");
    return await this.cancel(order);
  }

  /** §6.8 "→ cancelled: ... customer (only while pending, setting) ... release stock." */
  private async cancel(order: { id: string; status: string; items: { variantId: string; locationId: string; quantity: number }[] }) {
    const allowed = await this.settings.getValue<boolean>("checkout.allowCustomerCancelWhilePending");
    if (!allowed) throw new BadRequestException({ code: "CANCEL_NOT_ALLOWED", message: "Orders can't be self-cancelled once placed — please contact support." });
    if (!CANCELLABLE_STATUSES.has(order.status)) {
      throw new BadRequestException({ code: "INVALID_TRANSITION", message: "This order can no longer be cancelled." });
    }

    return await this.prisma.$transaction(async (tx) => {
      const byLocation = new Map<string, { variantId: string; quantity: number }[]>();
      for (const item of order.items) byLocation.set(item.locationId, [...(byLocation.get(item.locationId) ?? []), { variantId: item.variantId, quantity: item.quantity }]);
      for (const [locationId, lines] of byLocation) await this.stock.release(tx, locationId, lines);

      const updated = await tx.order.update({ where: { id: order.id }, data: { status: "cancelled", cancelledReason: "Cancelled by customer", reservationReleasedAt: new Date() } });
      await tx.orderEvent.create({ data: { orderId: order.id, type: "status_change", data: { from: order.status, to: "cancelled", actor: "customer" } } });
      return updated;
    });
  }
}
