import { describe, expect, it, vi } from "vitest";
import { StoreCreditLedgerService } from "./store-credit-ledger.service";
import { GiftCardLedgerService } from "./gift-card-ledger.service";
import { OrderTendersService } from "./order-tenders.service";

const config = { get: vi.fn(() => "test-encryption-key") };

function storeCreditTx(options: { existing?: boolean; debitCount?: number; balanceAfter?: number } = {}) {
  return {
    storeCreditTransaction: { findUnique: vi.fn(() => Promise.resolve(options.existing ? { id: "t1" } : null)), create: vi.fn(() => Promise.resolve({})) },
    customer: {
      update: vi.fn(() => Promise.resolve({ storeCreditBalance: options.balanceAfter ?? 15_000 })),
      updateMany: vi.fn(() => Promise.resolve({ count: options.debitCount ?? 1 })),
      findUniqueOrThrow: vi.fn(() => Promise.resolve({ storeCreditBalance: options.balanceAfter ?? 5_000 })),
    },
  };
}

describe("StoreCreditLedgerService", () => {
  it("credits the wallet and records the balance after", async () => {
    const tx = storeCreditTx({ balanceAfter: 15_000 });
    const ledger = new StoreCreditLedgerService({} as never);
    expect(await ledger.creditInTx(tx as never, "c1", 10_000, { reason: "refund", reference: "r1", orderId: "o1" })).toBe(true);
    expect(tx.customer.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { storeCreditBalance: { increment: 10_000 } }, select: { storeCreditBalance: true } });
    expect(tx.storeCreditTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ customerId: "c1", amount: 10_000, reason: "refund", reference: "r1", balanceAfter: 15_000 }) });
  });

  it("is idempotent per (reason, reference) — a second credit does nothing", async () => {
    const tx = storeCreditTx({ existing: true });
    const ledger = new StoreCreditLedgerService({} as never);
    expect(await ledger.creditInTx(tx as never, "c1", 10_000, { reason: "refund", reference: "r1" })).toBe(false);
    expect(tx.customer.update).not.toHaveBeenCalled();
  });

  it("debits with a balance guard and refuses when a concurrent spend emptied it", async () => {
    const ok = storeCreditTx({ balanceAfter: 5_000 });
    const ledger = new StoreCreditLedgerService({} as never);
    await ledger.debitInTx(ok as never, "c1", 10_000, { reason: "order_payment", reference: "o1", orderId: "o1" });
    expect(ok.customer.updateMany).toHaveBeenCalledWith({ where: { id: "c1", storeCreditBalance: { gte: 10_000 } }, data: { storeCreditBalance: { decrement: 10_000 } } });
    expect(ok.storeCreditTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: -10_000, balanceAfter: 5_000 }) });

    const empty = storeCreditTx({ debitCount: 0 });
    await expect(ledger.debitInTx(empty as never, "c1", 10_000, { reason: "order_payment", reference: "o1" })).rejects.toMatchObject({ response: { code: "STORE_CREDIT_INSUFFICIENT" } });
  });
});

describe("GiftCardLedgerService", () => {
  it("hashes codes with the app key, deterministically, and never stores the code", () => {
    const ledger = new GiftCardLedgerService({} as never, config as never);
    const { code, codeHash, last4 } = ledger.newCode();
    expect(code).toHaveLength(16);
    expect(last4).toBe(code.slice(-4));
    expect(codeHash).toBe(ledger.hashCode(code));
    expect(codeHash).not.toContain(code);
    const other = new GiftCardLedgerService({} as never, { get: () => "another-key" } as never);
    expect(other.hashCode(code)).not.toBe(codeHash);
  });

  it("finds a card by what the shopper typed and reports why it can't be used", async () => {
    const card = { id: "g1", status: "active", balance: 50_000, expiresAt: new Date("2020-01-01") };
    const prisma = { giftCard: { findUnique: vi.fn(() => Promise.resolve(card)) } };
    const ledger = new GiftCardLedgerService(prisma as never, config as never);
    const { code } = ledger.newCode();
    const found = await ledger.findByCode(` ${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12).toLowerCase()} `);
    expect(prisma.giftCard.findUnique).toHaveBeenCalledWith({ where: { codeHash: ledger.hashCode(code) } });
    expect(found?.unusable).toBe("EXPIRED");
  });

  it("skips the database for strings that can't be codes", async () => {
    const prisma = { giftCard: { findUnique: vi.fn() } };
    const ledger = new GiftCardLedgerService(prisma as never, config as never);
    expect(await ledger.findByCode("SUMMER10")).toBeNull();
    expect(prisma.giftCard.findUnique).not.toHaveBeenCalled();
  });

  it("marks a card redeemed when a debit empties it, and active again when credited back", async () => {
    const tx = {
      giftCard: {
        updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
        findUniqueOrThrow: vi.fn(() => Promise.resolve({ balance: 0 })),
        update: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(args.data.balance ? { balance: 30_000, status: "redeemed" } : {})),
      },
      giftCardTransaction: { create: vi.fn(() => Promise.resolve({})), findUnique: vi.fn(() => Promise.resolve(null)) },
    };
    const ledger = new GiftCardLedgerService({} as never, config as never);
    await ledger.debitInTx(tx as never, "g1", 30_000, { reason: "redeem", reference: "o1", orderId: "o1" });
    expect(tx.giftCard.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "g1", status: "active", balance: { gte: 30_000 } }) }));
    expect(tx.giftCard.update).toHaveBeenCalledWith({ where: { id: "g1" }, data: { status: "redeemed" } });

    tx.giftCard.update.mockClear();
    expect(await ledger.creditInTx(tx as never, "g1", 30_000, { reason: "reversal", reference: "o1", orderId: "o1" })).toBe(true);
    expect(tx.giftCard.update).toHaveBeenCalledWith({ where: { id: "g1" }, data: { status: "active" } });
  });

  it("refuses a debit the card no longer covers", async () => {
    const tx = { giftCard: { updateMany: vi.fn(() => Promise.resolve({ count: 0 })) } };
    const ledger = new GiftCardLedgerService({} as never, config as never);
    await expect(ledger.debitInTx(tx as never, "g1", 30_000, { reason: "redeem", reference: "o1" })).rejects.toMatchObject({ response: { code: "GIFT_CARD_INSUFFICIENT" } });
  });
});

describe("OrderTendersService", () => {
  function make(credited = true) {
    const storeCredit = { debitInTx: vi.fn(() => Promise.resolve()), creditInTx: vi.fn(() => Promise.resolve(credited)) };
    const giftCards = { debitInTx: vi.fn(() => Promise.resolve()), creditInTx: vi.fn(() => Promise.resolve(credited)) };
    const tx = { payment: { create: vi.fn(() => Promise.resolve({})), updateMany: vi.fn(() => Promise.resolve({ count: 2 })) } };
    return { service: new OrderTendersService(storeCredit as never, giftCards as never), storeCredit, giftCards, tx };
  }
  const order = { id: "o1", customerId: "c1", giftCardId: "g1", giftCardUsed: 20_000, storeCreditUsed: 5_000 };

  it("spends both tenders and records each as a succeeded payment", async () => {
    const { service, storeCredit, giftCards, tx } = make();
    await service.spendInTx(tx as never, order);
    expect(giftCards.debitInTx).toHaveBeenCalledWith(tx, "g1", 20_000, expect.objectContaining({ reason: "redeem", reference: "o1" }));
    expect(storeCredit.debitInTx).toHaveBeenCalledWith(tx, "c1", 5_000, expect.objectContaining({ reason: "order_payment", reference: "o1" }));
    expect(tx.payment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ method: "gift_card", amount: 20_000, status: "succeeded" }) });
    expect(tx.payment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ method: "store_credit", amount: 5_000, status: "succeeded" }) });
  });

  it("does nothing for an order paid without credit", async () => {
    const { service, tx } = make();
    await service.spendInTx(tx as never, { ...order, giftCardUsed: 0, storeCreditUsed: 0 });
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it("restores both tenders, cancels their payment rows and reports the amount", async () => {
    const { service, tx } = make();
    expect(await service.restoreInTx(tx as never, order, "cancelled")).toBe(25_000);
    expect(tx.payment.updateMany).toHaveBeenCalledWith({ where: { orderId: "o1", method: { in: ["gift_card", "store_credit"] }, status: "succeeded" }, data: { status: "cancelled" } });
  });

  it("restores nothing twice", async () => {
    const { service, tx } = make(false);
    expect(await service.restoreInTx(tx as never, order, "cancelled")).toBe(0);
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });
});
