import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { PaymentMethod } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { isUniqueViolation } from "../common/document-number";
import type { AuthenticatedStaff } from "../common/types";
import type { GatewaySettlementDto } from "./dto";

/**
 * Gateway settlements (docs/PROJECT_SPEC.md §8.2 Finance, §10.6
 * `gateway_settlements`, §16 M12). Staff record each payout from
 * SSLCommerz/bKash/Nagad; `expectedGross` is what *our* succeeded payments
 * for that method and period add up to, so a short payout shows up as a
 * variance immediately. Recorded fees replace the bps estimate in the true
 * profit report for periods they cover.
 */
@Injectable()
export class GatewaySettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async expectedGross(method: PaymentMethod, from: Date, to: Date): Promise<number> {
    const agg = await this.prisma.payment.aggregate({ where: { method, status: "succeeded", paidAt: { gte: from, lte: to } }, _sum: { amount: true } });
    return agg._sum.amount ?? 0;
  }

  async list() {
    const rows = await this.prisma.gatewaySettlement.findMany({ orderBy: { periodTo: "desc" }, take: 200 });
    return rows.map((r) => ({ ...r, variance: r.gross - r.expectedGross }));
  }

  async create(dto: GatewaySettlementDto, actor: AuthenticatedStaff) {
    const expectedGross = await this.expectedGross(dto.method, dto.periodFrom, dto.periodTo);
    try {
      const row = await this.prisma.gatewaySettlement.create({
        data: { ...dto, providerInstanceId: dto.providerInstanceId ?? null, settlementRef: dto.settlementRef ?? null, receivedAt: dto.receivedAt ?? null, note: dto.note ?? null, net: dto.gross - dto.fees, expectedGross, createdBy: actor.id },
      });
      await this.audit.record({ actorType: "staff", actorId: actor.id, action: "gateway_settlement.create", entityType: "gateway_settlement", entityId: row.id, after: row });
      return { ...row, variance: row.gross - row.expectedGross };
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException({ code: "SETTLEMENT_EXISTS", message: "A settlement with this reference already exists for this method" });
      throw error;
    }
  }

  async update(id: string, dto: GatewaySettlementDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.gatewaySettlement.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "GATEWAY_SETTLEMENT_NOT_FOUND", message: "Settlement not found" });
    const expectedGross = await this.expectedGross(dto.method, dto.periodFrom, dto.periodTo);
    const row = await this.prisma.gatewaySettlement.update({
      where: { id },
      data: { ...dto, providerInstanceId: dto.providerInstanceId ?? null, settlementRef: dto.settlementRef ?? null, receivedAt: dto.receivedAt ?? null, note: dto.note ?? null, net: dto.gross - dto.fees, expectedGross },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "gateway_settlement.update", entityType: "gateway_settlement", entityId: id, before, after: row });
    return { ...row, variance: row.gross - row.expectedGross };
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.prisma.gatewaySettlement.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ code: "GATEWAY_SETTLEMENT_NOT_FOUND", message: "Settlement not found" });
    await this.prisma.gatewaySettlement.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "gateway_settlement.delete", entityType: "gateway_settlement", entityId: id, before });
  }

  /** Fees per method from settlements whose whole period lies inside [from, to]. */
  async recordedFees(from: Date, to: Date): Promise<Partial<Record<PaymentMethod, number>>> {
    const rows = await this.prisma.gatewaySettlement.groupBy({ by: ["method"], where: { periodFrom: { gte: from }, periodTo: { lte: to } }, _sum: { fees: true } });
    const fees: Partial<Record<PaymentMethod, number>> = {};
    for (const row of rows) fees[row.method] = row._sum.fees ?? 0;
    return fees;
  }
}
