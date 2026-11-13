import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StockReservationService } from "./stock-reservation.service";
import { OrderTendersService } from "../rewards-core/order-tenders.service";

/**
 * §6.7: "`pending_payment` orders hold a reservation with `expires_at`
 * (payment timeout). A job releases expired reservations every minute."
 * §16 M5 acceptance: "Expired unpaid orders release stock."
 */
@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockReservationService,
    private readonly tenders: OrderTendersService,
  ) {}

  async runSweep(): Promise<{ expired: number }> {
    const expiredOrders = await this.prisma.order.findMany({
      where: { status: "pending_payment", paymentTimeoutAt: { lte: new Date() } },
      include: { items: { select: { variantId: true, locationId: true, quantity: true } } },
    });

    for (const order of expiredOrders) {
      await this.prisma.$transaction(async (tx) => {
        const linesByLocation = new Map<string, { variantId: string; quantity: number }[]>();
        for (const item of order.items) {
          linesByLocation.set(item.locationId, [...(linesByLocation.get(item.locationId) ?? []), { variantId: item.variantId, quantity: item.quantity }]);
        }
        for (const [locationId, lines] of linesByLocation) {
          await this.stock.release(tx, locationId, lines);
        }
        // §16 M16 — a gift card / store credit spent on an order that was never paid goes back to its owner.
        const restored = await this.tenders.restoreInTx(tx, order, "Order expired unpaid");
        await tx.order.update({ where: { id: order.id }, data: { status: "expired", reservationReleasedAt: new Date(), ...(restored > 0 ? { paidTotal: Math.max(0, order.paidTotal - restored) } : {}) } });
        await tx.orderEvent.create({ data: { orderId: order.id, type: "status_change", data: { from: "pending_payment", to: "expired", reason: "payment_timeout" } } });
      });
      this.logger.log(`Order ${order.orderNumber} expired — stock reservation released`);
    }

    return { expired: expiredOrders.length };
  }
}
