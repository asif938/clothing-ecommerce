import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { ApprovalsService } from "../approvals/approvals.service";
import { SettingsService } from "../settings/settings.service";
import type { CompleteRefundDto, RejectRefundDto } from "./dto";

export interface RefundApprovalPending {
  approvalRequired: true;
  approvalRequestId: string;
}

/** §8.2 Finance: "refunds queue (pending manual refunds with trx id entry)". Every `Refund` row is created elsewhere (cancellation, doorstep rejection, returns) always as `pending` — this is just where a human closes it out. */
@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalsService,
    private readonly settings: SettingsService,
  ) {}

  async list(status?: string) {
    return await this.prisma.refund.findMany({
      where: status ? { status: status as never } : undefined,
      include: { order: { select: { orderNumber: true, total: true, paidTotal: true, refundedTotal: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async complete(id: string, dto: CompleteRefundDto, actor: AuthenticatedStaff, opts: { approved?: boolean } = {}) {
    const refund = await this.prisma.refund.findUnique({ where: { id }, include: { order: true } });
    if (!refund) throw new NotFoundException("Refund not found");
    if (refund.status !== "pending" && refund.status !== "processing") throw new BadRequestException({ code: "INVALID_STATE", message: "This refund is already closed." });

    // Approval workflow (M11): refunds above the configured amount need a second approver.
    if (!opts.approved && !actor.permissions.has("approvals.bypass")) {
      const threshold = await this.settings.getValue<number>("approvals.refund.thresholdAmount");
      if (threshold > 0 && refund.amount > threshold) {
        const request = await this.approvals.request(
          { type: "refund_complete", entityType: "refund", entityId: id, summary: `Refund of ${refund.amount / 100} BDT for order ${refund.order.orderNumber}`, payload: { refundId: id, dto } },
          actor,
        );
        return { approvalRequired: true, approvalRequestId: request.id } satisfies RefundApprovalPending;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.refund.update({ where: { id }, data: { status: "completed", approvedBy: actor.id, externalRef: dto.externalRef } });
      const refundedTotal = refund.order.refundedTotal + refund.amount;
      await tx.order.update({
        where: { id: refund.orderId },
        data: { refundedTotal, paymentStatus: refundedTotal >= refund.order.paidTotal ? "refunded" : "partially_refunded" },
      });
      await tx.orderEvent.create({ data: { orderId: refund.orderId, type: "refund", data: { refundId: id, status: "completed", amount: refund.amount } } });
      return result;
    });

    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "refund.complete", entityType: "refund", entityId: id, after: updated });
    return updated;
  }

  async reject(id: string, dto: RejectRefundDto, actor: AuthenticatedStaff) {
    const refund = await this.prisma.refund.findUnique({ where: { id } });
    if (!refund) throw new NotFoundException("Refund not found");
    if (refund.status !== "pending" && refund.status !== "processing") throw new BadRequestException({ code: "INVALID_STATE", message: "This refund is already closed." });

    const updated = await this.prisma.refund.update({ where: { id }, data: { status: "rejected", reason: dto.reason } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "refund.reject", entityType: "refund", entityId: id, after: updated });
    return updated;
  }
}
