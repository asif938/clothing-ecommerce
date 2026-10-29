import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { OrdersLifecycleService } from "./orders-lifecycle.service";

const CANCELLABLE_STATUSES = new Set(["pending_payment", "pending"]);

// M6: shipment tracking code/link/status for the storefront's tracking page and account order detail.
const SHIPMENTS_INCLUDE = { shipments: { orderBy: { createdAt: "desc" as const } } };

/** Customer-facing order endpoints (docs/PROJECT_SPEC.md §11.2 "orders: track by phone+number, mine, detail, invoice, cancel"). Staff order management (edit, confirm, ship, …) is `apps/api/src/orders` (M6). */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly lifecycle: OrdersLifecycleService,
  ) {}

  async trackByPhoneAndNumber(phone: string, orderNumber: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber }, include: { items: true, events: { orderBy: { createdAt: "asc" } }, ...SHIPMENTS_INCLUDE } });
    const billingPhone = (order?.billingContact as { phone?: string } | null)?.phone;
    if (!order || billingPhone !== phone) throw new NotFoundException("Order not found");
    return order;
  }

  async mine(customerId: string) {
    return await this.prisma.order.findMany({ where: { customerId }, include: { items: true, ...SHIPMENTS_INCLUDE }, orderBy: { createdAt: "desc" } });
  }

  async detail(customerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true, events: { orderBy: { createdAt: "asc" } }, ...SHIPMENTS_INCLUDE } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.customerId !== customerId) throw new ForbiddenException({ code: "FORBIDDEN", message: "Not your order" });
    return order;
  }

  async cancelMine(customerId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.customerId !== customerId) throw new ForbiddenException({ code: "FORBIDDEN", message: "Not your order" });
    await this.cancel(order.id, order.status, customerId);
    return await this.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  }

  async cancelByTracking(phone: string, orderNumber: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber } });
    const billingPhone = (order?.billingContact as { phone?: string } | null)?.phone;
    if (!order || billingPhone !== phone) throw new NotFoundException("Order not found");
    await this.cancel(order.id, order.status, order.customerId);
    return await this.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  }

  /** §6.8 "→ cancelled: ... customer (only while pending, setting) ..." — the rest of cancellation's side effects (release stock, refund record, coupon release) live in `OrdersLifecycleService.transition()`, shared with the staff-initiated path. */
  private async cancel(orderId: string, status: string, customerId: string | null) {
    const allowed = await this.settings.getValue<boolean>("checkout.allowCustomerCancelWhilePending");
    if (!allowed) throw new BadRequestException({ code: "CANCEL_NOT_ALLOWED", message: "Orders can't be self-cancelled once placed — please contact support." });
    if (!CANCELLABLE_STATUSES.has(status)) {
      throw new BadRequestException({ code: "INVALID_TRANSITION", message: "This order can no longer be cancelled." });
    }
    await this.lifecycle.transition({ orderId, to: "cancelled", actor: customerId ? { type: "customer", id: customerId } : { type: "system" }, reason: "Cancelled by customer" });
  }
}
