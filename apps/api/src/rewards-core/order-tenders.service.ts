import { Injectable } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import { StoreCreditLedgerService } from "./store-credit-ledger.service";
import { GiftCardLedgerService } from "./gift-card-ledger.service";

export interface OrderTenderSnapshot {
  id: string;
  customerId: string | null;
  giftCardId: string | null;
  giftCardUsed: number;
  storeCreditUsed: number;
}

/**
 * Gift card and store credit tenders on an order (§16 M16). They're money the
 * shop already holds, so when an order is cancelled or expires unpaid they go
 * straight back to the card/wallet — no refund record for staff to process.
 */
@Injectable()
export class OrderTendersService {
  constructor(
    private readonly storeCredit: StoreCreditLedgerService,
    private readonly giftCards: GiftCardLedgerService,
  ) {}

  /** Spends both tenders at placement, inside the order-creation transaction (a concurrent spend rolls the order back). */
  async spendInTx(tx: Prisma.TransactionClient, order: OrderTenderSnapshot): Promise<void> {
    if (order.giftCardUsed > 0 && order.giftCardId) {
      await this.giftCards.debitInTx(tx, order.giftCardId, order.giftCardUsed, { reason: "redeem", reference: order.id, orderId: order.id });
      await tx.payment.create({ data: { orderId: order.id, method: "gift_card", purpose: "full", amount: order.giftCardUsed, status: "succeeded", externalRef: order.giftCardId, paidAt: new Date() } });
    }
    if (order.storeCreditUsed > 0 && order.customerId) {
      await this.storeCredit.debitInTx(tx, order.customerId, order.storeCreditUsed, { reason: "order_payment", reference: order.id, orderId: order.id });
      await tx.payment.create({ data: { orderId: order.id, method: "store_credit", purpose: "full", amount: order.storeCreditUsed, status: "succeeded", paidAt: new Date() } });
    }
  }

  /**
   * Returns both tenders to their owner inside the caller's transaction and
   * marks their payment rows cancelled. Idempotent. Returns the poisha
   * restored so the caller can take it off `paidTotal` and only refund the
   * rest (cash/online money) through the refunds queue.
   */
  async restoreInTx(tx: Prisma.TransactionClient, order: OrderTenderSnapshot, note: string): Promise<number> {
    let restored = 0;
    if (order.giftCardUsed > 0 && order.giftCardId) {
      if (await this.giftCards.creditInTx(tx, order.giftCardId, order.giftCardUsed, { reason: "reversal", reference: order.id, orderId: order.id, note })) restored += order.giftCardUsed;
    }
    if (order.storeCreditUsed > 0 && order.customerId) {
      if (await this.storeCredit.creditInTx(tx, order.customerId, order.storeCreditUsed, { reason: "order_reversal", reference: order.id, orderId: order.id, note })) restored += order.storeCreditUsed;
    }
    if (restored > 0) {
      await tx.payment.updateMany({ where: { orderId: order.id, method: { in: ["gift_card", "store_credit"] }, status: "succeeded" }, data: { status: "cancelled" } });
    }
    return restored;
  }
}
