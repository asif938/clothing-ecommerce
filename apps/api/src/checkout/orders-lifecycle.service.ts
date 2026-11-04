import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { OrderStatus, PaymentPurpose, Prisma } from "@clothing/db";
import { formatTakaFromPoisha } from "@clothing/shared/notifications";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { StockReservationService } from "./stock-reservation.service";
import { NotificationsService } from "../notifications/notifications.service";
import { TrackingService } from "../tracking/tracking.service";

export type TransitionActor = { type: "staff"; id: string } | { type: "customer"; id: string } | { type: "system" };

export interface TransitionInput {
  orderId: string;
  to: OrderStatus;
  actor: TransitionActor;
  reason?: string;
}

/**
 * §6.8's allowed-transition table. Anything not listed here is rejected
 * with `INVALID_TRANSITION` — "only allowed transitions are accepted." Not
 * modeled: `pending_payment → pending` (payment success — `onPaymentSucceeded`
 * below) and `pending_payment → expired` (`OrderExpiryService`), both of
 * which have their own dedicated side effects already.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["on_hold", "cancelled"],
  pending: ["confirmed", "on_hold", "cancelled"],
  confirmed: ["processing", "on_hold", "cancelled"],
  on_hold: ["pending", "confirmed", "processing", "cancelled"],
  processing: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "partially_delivered", "rejected_at_door", "returned_to_sender"],
  out_for_delivery: ["delivered", "partially_delivered", "rejected_at_door", "returned_to_sender"],
  rejected_at_door: ["returned_to_warehouse"],
  returned_to_sender: ["returned_to_warehouse"],
  partially_delivered: ["completed"],
  delivered: ["completed"],
  returned_to_warehouse: [],
  completed: [],
  cancelled: [],
  expired: [],
};

const CANCELLING_RELEASES_STOCK = new Set<OrderStatus>(["pending_payment", "pending", "confirmed", "on_hold", "processing", "packed"]);

/**
 * Which status transitions notify the customer (§6.11), and under which
 * event key (`@clothing/shared/notifications`'s `NOTIFICATION_EVENTS`
 * catalog). Deliberately not every status: `processing`/`packed` are
 * internal warehouse states with no customer-facing message in the spec's
 * own example set, `on_hold`/`expired`/`returned_to_sender`/
 * `returned_to_warehouse`/`completed` are not reached by anything that
 * calls `transition()` with a customer-notification need yet — adding one
 * later is a one-line addition here, not a new code path.
 */
const ORDER_STATUS_TO_NOTIFICATION_EVENT: Partial<Record<OrderStatus, string>> = {
  confirmed: "order_confirmed",
  shipped: "order_shipped",
  out_for_delivery: "order_out_for_delivery",
  delivered: "order_delivered",
  partially_delivered: "order_partially_delivered",
  rejected_at_door: "order_rejected_at_door",
  cancelled: "order_cancelled",
};

/**
 * The full §6.8 order state machine. `transition()` is the one place every
 * status change (staff action, courier webhook/poll, QC, automatic sweep)
 * goes through: it validates the move against `ALLOWED_TRANSITIONS`, writes
 * the `order_events` timeline row (append-only, per §6.8 "every transition
 * writes an order_events row"), and an audit log entry for staff/system
 * actors. Side effects that need extra context the state machine doesn't
 * have (which shipment, which items passed QC, the actual delivery fee
 * collected) are the *caller's* job — `ShipmentsService`, `PackingService`,
 * `ReturnsService` — done right alongside the `transition()` call, in the
 * same transaction when `tx` is passed in. The one side effect generic
 * enough to live here is cancellation's (§6.8: "release stock, refund any
 * paid amount, coupon usage released"), since cancellation can be
 * triggered from many unrelated places (staff, customer self-cancel,
 * future automation) and shouldn't need reimplementing at each one.
 */
@Injectable()
export class OrdersLifecycleService {
  private readonly logger = new Logger(OrdersLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly stock: StockReservationService,
    private readonly notifications: NotificationsService,
    private readonly tracking: TrackingService,
  ) {}

  async transition(input: TransitionInput, tx?: Prisma.TransactionClient): Promise<void> {
    if (tx) return this.apply(tx, input);
    await this.prisma.$transaction((innerTx) => this.apply(innerTx, input));
  }

  private async apply(tx: Prisma.TransactionClient, input: TransitionInput): Promise<void> {
    const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId }, include: { items: true, payments: true, customer: true } });
    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(input.to)) {
      throw new BadRequestException({ code: "INVALID_TRANSITION", message: `Cannot move an order from "${order.status}" to "${input.to}".` });
    }
    if (input.to === "on_hold" && !input.reason) {
      throw new BadRequestException({ code: "REASON_REQUIRED", message: "A reason is required to put an order on hold." });
    }
    if (input.to === "cancelled" && input.actor.type === "staff" && !input.reason) {
      throw new BadRequestException({ code: "REASON_REQUIRED", message: "A reason is required to cancel an order." });
    }

    const data: Prisma.OrderUpdateInput = { status: input.to };
    if (input.to === "confirmed") {
      data.confirmedAt = new Date();
      if (input.actor.type === "staff") data.confirmedBy = input.actor.id;
    }
    if (input.to === "cancelled") {
      data.cancelledReason = input.reason ?? null;
      if (CANCELLING_RELEASES_STOCK.has(order.status) && !order.reservationReleasedAt) {
        const byLocation = new Map<string, { variantId: string; quantity: number }[]>();
        for (const item of order.items) byLocation.set(item.locationId, [...(byLocation.get(item.locationId) ?? []), { variantId: item.variantId, quantity: item.quantity }]);
        for (const [locationId, lines] of byLocation) await this.stock.release(tx, locationId, lines);
        data.reservationReleasedAt = new Date();
      }

      if (order.paidTotal > 0) {
        const lastSucceeded = order.payments.filter((p) => p.status === "succeeded").at(-1) ?? null;
        await tx.refund.create({
          data: {
            orderId: order.id,
            paymentId: lastSucceeded?.id ?? null,
            amount: order.paidTotal,
            method: "original",
            status: "pending",
            reason: `Order cancelled: ${input.reason ?? "no reason given"}`,
          },
        });
        await tx.orderEvent.create({ data: { orderId: order.id, type: "refund", data: { reason: "cancelled", amount: order.paidTotal } } });
      }

      const releaseCouponUsage = await this.settings.getValue<boolean>("orders.releaseCouponUsageOnCancel");
      if (releaseCouponUsage) await tx.discountUsage.deleteMany({ where: { orderId: order.id } });
    }
    if (input.to === "delivered" || input.to === "partially_delivered") {
      if (!order.deliveredAt) data.deliveredAt = new Date();
    }

    await tx.order.update({ where: { id: order.id }, data });
    await tx.orderEvent.create({
      data: { orderId: order.id, type: "status_change", data: { from: order.status, to: input.to, reason: input.reason ?? null }, actor: actorJson(input.actor) },
    });

    if (input.actor.type !== "customer") {
      await this.audit.record({
        actorType: input.actor.type,
        actorId: input.actor.type === "staff" ? input.actor.id : undefined,
        action: "order.status_change",
        entityType: "order",
        entityId: order.id,
        before: { status: order.status },
        after: { status: input.to, reason: input.reason ?? null },
      });
    }
    this.logger.log(`Order ${order.orderNumber} ${order.status} → ${input.to}`);

    const notificationEvent = ORDER_STATUS_TO_NOTIFICATION_EVENT[input.to];
    if (notificationEvent) {
      await this.enqueueStatusNotification(tx, order, notificationEvent);
    }

    if (input.to === "confirmed" && order.trackingEventId) {
      const purchaseEventTiming = await this.settings.getValue<"placement" | "confirmation">("tracking.purchaseEventTiming");
      if (purchaseEventTiming === "confirmation") {
        const billingContact = (order.billingContact as { phone?: string; email?: string } | null) ?? null;
        await this.tracking.recordPurchase({
          eventId: order.trackingEventId,
          orderId: order.id,
          total: order.total,
          currency: order.currency,
          items: order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitPrice: i.unitPrice })),
          userData: { phone: order.customer?.phone ?? billingContact?.phone ?? null, email: order.customer?.email ?? billingContact?.email ?? null },
        });
      }
    }
  }

  private async enqueueStatusNotification(
    tx: Prisma.TransactionClient,
    order: Prisma.OrderGetPayload<{ include: { customer: true } }>,
    event: string,
  ): Promise<void> {
    const billingContact = (order.billingContact as { name?: string; phone?: string; email?: string } | null) ?? null;
    const phone = order.customer?.phone ?? billingContact?.phone ?? null;
    const email = order.customer?.email ?? billingContact?.email ?? null;
    const locale = order.customer?.locale ?? "bn";

    const variables: Record<string, string | number | null> = {
      ...(await this.notifications.commonVariables()),
      customer_name: order.customer?.name ?? billingContact?.name ?? "",
      order_number: order.orderNumber,
      order_total: formatTakaFromPoisha(order.total),
      cod_amount: formatTakaFromPoisha(order.codAmount),
    };

    if (event === "order_shipped" || event === "order_out_for_delivery") {
      const shipment = await tx.shipment.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } });
      variables.tracking_code = shipment?.trackingCode ?? "";
      variables.tracking_link = shipment?.trackingUrl ?? "";
      variables.courier_name = shipment?.courierDriver ?? "";
    }

    await this.notifications.enqueue(tx, {
      event,
      recipientType: order.customerId ? "customer" : "guest",
      recipientId: order.customerId,
      locale,
      contacts: { sms: phone, whatsapp: phone, email },
      variables,
      related: { type: "order", id: order.id },
    });
  }

  /** §6.8 "pending_payment → pending on payment success, or → on_hold instead when high-risk" — unchanged from M5 (this is not a generic `transition()` move since it originates from a payment event, not a staff/courier action). */
  async onPaymentSucceeded(orderId: string, purpose: PaymentPurpose, amount: number): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "pending_payment") return; // already processed — idempotent no-op

    const holdHighRisk = await this.settings.getValue<boolean>("risk.holdHighRisk");
    const nextStatus = order.riskLevel === "high" && holdHighRisk ? "on_hold" : "pending";

    const advancePaid = purpose === "advance" ? order.advancePaid + amount : order.advancePaid;
    const paidTotal = order.paidTotal + amount;
    const codAmount = purpose === "advance" ? Math.max(0, order.total - advancePaid) : order.codAmount;
    const paymentStatus = purpose === "full" || paidTotal >= order.total ? "paid" : "partially_paid";

    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { status: nextStatus, advancePaid, paidTotal, codAmount, paymentStatus, paymentTimeoutAt: null },
      }),
      this.prisma.orderEvent.create({ data: { orderId, type: "payment", data: { purpose, amount, result: "succeeded" } } }),
      this.prisma.orderEvent.create({ data: { orderId, type: "status_change", data: { from: "pending_payment", to: nextStatus } } }),
    ]);
    this.logger.log(`Order ${order.orderNumber} → ${nextStatus} after ${purpose} payment of ${amount}`);
  }

  /** §7.5: "Failure/cancel → back to checkout with message and a retry button; order remains pending_payment until timeout." No status change — just a record. */
  async onPaymentFailed(orderId: string): Promise<void> {
    await this.prisma.orderEvent.create({ data: { orderId, type: "payment", data: { result: "failed" } } });
  }
}

function actorJson(actor: TransitionActor): Prisma.InputJsonValue {
  return actor.type === "system" ? { type: "system" } : { type: actor.type, id: actor.id };
}
