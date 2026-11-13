import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma, StoreCreditReason } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { isUniqueViolation } from "../common/document-number";

export interface StoreCreditEntry {
  reason: StoreCreditReason;
  /** With `reason`, makes an automatic credit idempotent; null for manual adjustments. */
  reference: string | null;
  orderId?: string | null;
  note?: string | null;
  createdBy?: string | null;
}

/**
 * The store credit wallet ledger (docs/PROJECT_SPEC.md §5.8, §6.12 "ledger-based;
 * balance = sum of transactions"). `customers.store_credit_balance` is only
 * ever changed here, in the same transaction as the row that explains it.
 * Dependency-free (Prisma only) so order lifecycle, refunds, returns and
 * checkout can all use it without module cycles.
 */
@Injectable()
export class StoreCreditLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Credits the wallet inside the caller's transaction. Returns false when
   * this (reason, reference) was already credited — checked up front because
   * a unique violation would abort the caller's whole transaction.
   */
  async creditInTx(tx: Prisma.TransactionClient, customerId: string, amount: number, entry: StoreCreditEntry): Promise<boolean> {
    if (amount <= 0) return false;
    if (entry.reference !== null) {
      const existing = await tx.storeCreditTransaction.findUnique({ where: { reason_reference: { reason: entry.reason, reference: entry.reference } }, select: { id: true } });
      if (existing) return false;
    }
    const updated = await tx.customer.update({ where: { id: customerId }, data: { storeCreditBalance: { increment: amount } }, select: { storeCreditBalance: true } });
    await tx.storeCreditTransaction.create({
      data: { customerId, amount, reason: entry.reason, reference: entry.reference, orderId: entry.orderId ?? null, balanceAfter: updated.storeCreditBalance, note: entry.note ?? null, createdBy: entry.createdBy ?? null },
    });
    return true;
  }

  /** Standalone credit in its own transaction; a concurrent duplicate is reported as false, not an error. */
  async credit(customerId: string, amount: number, entry: StoreCreditEntry): Promise<boolean> {
    try {
      return await this.prisma.$transaction((tx) => this.creditInTx(tx, customerId, amount, entry));
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  /** Spends from the wallet inside the caller's transaction; throws when the balance no longer covers it (a concurrent spend won). */
  async debitInTx(tx: Prisma.TransactionClient, customerId: string, amount: number, entry: StoreCreditEntry): Promise<void> {
    if (amount <= 0) return;
    const updated = await tx.customer.updateMany({ where: { id: customerId, storeCreditBalance: { gte: amount } }, data: { storeCreditBalance: { decrement: amount } } });
    if (updated.count === 0) throw new BadRequestException({ code: "STORE_CREDIT_INSUFFICIENT", message: "Your store credit balance has changed. Please review your order." });
    const after = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, select: { storeCreditBalance: true } });
    await tx.storeCreditTransaction.create({
      data: { customerId, amount: -amount, reason: entry.reason, reference: entry.reference, orderId: entry.orderId ?? null, balanceAfter: after.storeCreditBalance, note: entry.note ?? null, createdBy: entry.createdBy ?? null },
    });
  }

  async balance(customerId: string): Promise<number> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { storeCreditBalance: true } });
    return customer?.storeCreditBalance ?? 0;
  }

  async ledger(customerId: string, page = 1, pageSize = 50) {
    const where = { customerId };
    const [items, total] = await Promise.all([
      this.prisma.storeCreditTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.storeCreditTransaction.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
