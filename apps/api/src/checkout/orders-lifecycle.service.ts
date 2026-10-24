import { Injectable, Logger } from "@nestjs/common";
import type { PaymentPurpose } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

/**
 * The slice of order-status transitions (docs/PROJECT_SPEC.md §6.8) that
 * M5 actually drives: `pending_payment` → `pending` on successful payment,
 * or → `on_hold` instead when the order is high-risk and
 * `risk.holdHighRisk` is on. The rest of the state machine (confirmed,
 * processing, packed, shipped, …) is M6's job.
 */
@Injectable()
export class OrdersLifecycleService {
  private readonly logger = new Logger(OrdersLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

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
