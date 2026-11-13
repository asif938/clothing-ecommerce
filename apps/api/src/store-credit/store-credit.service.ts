import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { StoreCreditLedgerService } from "../rewards-core/store-credit-ledger.service";
import type { AuthenticatedStaff } from "../common/types";
import type { AdjustStoreCreditDto } from "./dto";

const DAY_MS = 86_400_000;

/** Store credit wallet screens (§8.2 Customers "credit ledger", §16 M16 "store credit wallet UI"). The ledger itself is `StoreCreditLedgerService`. */
@Injectable()
export class StoreCreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly ledger: StoreCreditLedgerService,
  ) {}

  async wallet(customerId: string, page = 1, pageSize = 50) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { storeCreditBalance: true } });
    if (!customer) throw new NotFoundException({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
    return {
      enabled: await this.settings.getValue<boolean>("storeCredit.enabled"),
      balance: customer.storeCreditBalance,
      ledger: await this.ledger.ledger(customerId, page, pageSize),
    };
  }

  async adjust(customerId: string, dto: AdjustStoreCreditDto, actor: AuthenticatedStaff) {
    const before = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { storeCreditBalance: true } });
    if (!before) throw new NotFoundException({ code: "CUSTOMER_NOT_FOUND", message: "Customer not found" });
    const entry = { reason: "adjust" as const, reference: null, note: dto.note, createdBy: actor.id };
    await this.prisma.$transaction(async (tx) => {
      if (dto.amount > 0) await this.ledger.creditInTx(tx, customerId, dto.amount, entry);
      else await this.ledger.debitInTx(tx, customerId, -dto.amount, entry);
    });
    const after = await this.ledger.balance(customerId);
    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "store_credit.adjust",
      entityType: "customer",
      entityId: customerId,
      before: { storeCreditBalance: before.storeCreditBalance },
      after: { storeCreditBalance: after, amount: dto.amount, note: dto.note },
    });
    return this.wallet(customerId);
  }

  /** Program numbers for the admin Store credit screen: what the shop owes (liability) and recent movement. */
  async stats() {
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [outstanding, holders, issued, spent, recent] = await Promise.all([
      this.prisma.customer.aggregate({ _sum: { storeCreditBalance: true } }),
      this.prisma.customer.count({ where: { storeCreditBalance: { gt: 0 } } }),
      this.prisma.storeCreditTransaction.aggregate({ where: { amount: { gt: 0 }, reason: { not: "order_reversal" }, createdAt: { gte: since } }, _sum: { amount: true } }),
      this.prisma.storeCreditTransaction.aggregate({ where: { reason: "order_payment", createdAt: { gte: since } }, _sum: { amount: true } }),
      this.prisma.storeCreditTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { customer: { select: { id: true, name: true, phone: true } } } }),
    ]);
    return {
      enabled: await this.settings.getValue<boolean>("storeCredit.enabled"),
      outstanding: outstanding._sum.storeCreditBalance ?? 0,
      holders,
      issuedLast30Days: issued._sum.amount ?? 0,
      spentLast30Days: Math.abs(spent._sum.amount ?? 0),
      recent,
    };
  }
}
