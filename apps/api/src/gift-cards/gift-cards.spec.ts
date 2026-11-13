import { describe, expect, it, vi } from "vitest";
import { GiftCardPurchaseService } from "./gift-card-purchase.service";
import { GiftCardsService } from "./gift-cards.service";

const SETTINGS: Record<string, unknown> = {
  "giftCards.enabled": true,
  "giftCards.purchaseEnabled": true,
  "giftCards.presets": [50_000, 100_000],
  "giftCards.allowCustom": false,
  "giftCards.minAmount": 20_000,
  "giftCards.maxAmount": 2_000_000,
  "giftCards.expiryMonths": 12,
  "payment.timeoutMinutes": 30,
};
const settings = { getValue: vi.fn((key: string) => Promise.resolve(SETTINGS[key])) };
const config = { get: vi.fn(() => "https://shop.test") };
const actor = { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };

const purchaseDto = {
  amount: 50_000,
  paymentMethod: "mock" as const,
  purchaserName: "Rahim",
  purchaserPhone: "+8801711111111",
  recipientName: "Karim",
  recipientPhone: "+8801722222222",
  locale: "bn" as const,
};

function makePurchase(card: Record<string, unknown> | null = null, verify: { status: string; amount?: number } = { status: "succeeded" }) {
  const tx = {
    giftCard: { updateMany: vi.fn(() => Promise.resolve({ count: 1 })), findUniqueOrThrow: vi.fn(() => Promise.resolve({ id: "g1", balance: 50_000 })) },
    giftCardTransaction: { create: vi.fn(() => Promise.resolve({})) },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    giftCard: {
      create: vi.fn(() => Promise.resolve({ id: "card-abcdefgh" })),
      update: vi.fn(() => Promise.resolve({})),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      findFirst: vi.fn(() => Promise.resolve(card)),
    },
  };
  const payments = {
    availableMethods: vi.fn(() => Promise.resolve(["cod", "mock"])),
    initiateStandalone: vi.fn(() => Promise.resolve({ externalRef: "ext-1", redirectUrl: "https://pay.test/x", providerInstanceId: null })),
    verifyStandalone: vi.fn(() => Promise.resolve(verify)),
  };
  const giftCards = {
    defaultExpiry: vi.fn(() => Promise.resolve(new Date("2027-11-16T00:00:00Z"))),
    withFreshCode: vi.fn((fn: (fresh: { code: string; codeHash: string; last4: string }) => Promise<unknown>) => fn({ code: "ABCDEFGHJKMNPQRS", codeHash: "hash", last4: "PQRS" })),
    enqueueDelivery: vi.fn(() => Promise.resolve()),
  };
  const service = new GiftCardPurchaseService(prisma as never, settings as never, payments as never, giftCards as never, config as never);
  return { service, prisma, payments, giftCards, tx };
}

describe("GiftCardPurchaseService.purchase", () => {
  it("creates a pending card with no usable code and starts an online payment", async () => {
    const { service, prisma, payments } = makePurchase();
    const result = await service.purchase(purchaseDto, null);
    expect(prisma.giftCard.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "pending", balance: 0, initialAmount: 50_000, source: "purchase", last4: "----" }) });
    expect(payments.initiateStandalone).toHaveBeenCalledWith("mock", 50_000, "GC-ABCDEFGH", expect.objectContaining({ success: expect.stringContaining("/bn/gift-cards/result?token=") }), expect.anything());
    expect(prisma.giftCard.update).toHaveBeenCalledWith({ where: { id: "card-abcdefgh" }, data: { paymentExternalRef: "ext-1", providerInstanceId: null } });
    expect(result.redirectUrl).toBe("https://pay.test/x");
  });

  it("rejects amounts that aren't a preset when custom amounts are off", async () => {
    const { service } = makePurchase();
    await expect(service.purchase({ ...purchaseDto, amount: 70_000 }, null)).rejects.toMatchObject({ response: { code: "GIFT_CARD_AMOUNT_NOT_A_PRESET" } });
  });

  it("cancels the card when the gateway can't start", async () => {
    const { service, prisma, payments } = makePurchase();
    payments.initiateStandalone.mockRejectedValueOnce(new Error("gateway down"));
    await expect(service.purchase(purchaseDto, null)).rejects.toThrow("gateway down");
    expect(prisma.giftCard.update).toHaveBeenCalledWith({ where: { id: "card-abcdefgh" }, data: { status: "cancelled", note: "Payment could not be started" } });
  });
});

describe("GiftCardPurchaseService.settle", () => {
  it("ignores references that aren't gift card purchases", async () => {
    const { service } = makePurchase(null);
    expect(await service.settle("mock", "ext-x")).toBe(false);
  });

  it("issues the code, opens the balance and sends it once paid", async () => {
    const { service, tx, giftCards } = makePurchase({ id: "g1", status: "pending", paidAt: null, initialAmount: 50_000, providerInstanceId: null });
    expect(await service.settle("mock", "ext-1")).toBe(true);
    expect(tx.giftCard.updateMany).toHaveBeenCalledWith({
      where: { id: "g1", status: { in: ["pending", "cancelled"] }, paidAt: null },
      data: expect.objectContaining({ status: "active", balance: 50_000, codeHash: "hash", last4: "PQRS" }),
    });
    expect(tx.giftCardTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ giftCardId: "g1", amount: 50_000, reason: "issue", reference: "g1" }) });
    expect(giftCards.enqueueDelivery).toHaveBeenCalledWith(tx, expect.objectContaining({ id: "g1" }), "ABCDEFGHJKMNPQRS");
  });

  it("is a no-op for a card that's already active (duplicate callback)", async () => {
    const { service, payments } = makePurchase({ id: "g1", status: "active", paidAt: new Date(), initialAmount: 50_000 });
    expect(await service.settle("mock", "ext-1")).toBe(true);
    expect(payments.verifyStandalone).not.toHaveBeenCalled();
  });

  it("still issues a card whose payment landed after it timed out", async () => {
    const { service, tx } = makePurchase({ id: "g1", status: "cancelled", paidAt: null, initialAmount: 50_000, providerInstanceId: null });
    await service.settle("mock", "ext-1");
    expect(tx.giftCard.updateMany).toHaveBeenCalled();
  });

  it("cancels a pending purchase whose payment failed", async () => {
    const { service, prisma, tx } = makePurchase({ id: "g1", status: "pending", paidAt: null, initialAmount: 50_000 }, { status: "failed" });
    await service.settle("mock", "ext-1");
    expect(prisma.giftCard.updateMany).toHaveBeenCalledWith({ where: { id: "g1", status: "pending" }, data: { status: "cancelled", note: "Payment failed" } });
    expect(tx.giftCard.updateMany).not.toHaveBeenCalled();
  });
});

describe("GiftCardsService", () => {
  function make(card: Record<string, unknown>) {
    const tx = {
      giftCard: { create: vi.fn(() => Promise.resolve({ id: "g1", ...card })), update: vi.fn(() => Promise.resolve({})), findUniqueOrThrow: vi.fn(() => Promise.resolve({ balance: 0, status: "active" })), updateMany: vi.fn(() => Promise.resolve({ count: 1 })) },
      giftCardTransaction: { create: vi.fn(() => Promise.resolve({})) },
    };
    const prisma = {
      $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      giftCard: { findUnique: vi.fn(() => Promise.resolve({ id: "g1", ...card, transactions: [] })), findMany: vi.fn(() => Promise.resolve([{ id: "g1" }])) },
    };
    const notifications = { commonVariables: vi.fn(() => Promise.resolve({ brand_name: "Demo" })), enqueue: vi.fn(() => Promise.resolve()) };
    const ledger = { newCode: vi.fn(() => ({ code: "ABCDEFGHJKMNPQRS", codeHash: "hash", last4: "PQRS" })), creditInTx: vi.fn(() => Promise.resolve(true)) };
    const audit = { record: vi.fn(() => Promise.resolve()) };
    const service = new GiftCardsService(prisma as never, settings as never, audit as never, notifications as never, ledger as never, {} as never, config as never);
    return { service, prisma, tx, notifications, audit };
  }

  it("issues a card, sends the code to the recipient and returns it formatted once", async () => {
    const { service, tx, notifications, audit } = make({ status: "active", balance: 100_000, recipientPhone: "+8801722222222", locale: "bn", source: "admin", expiresAt: null, initialAmount: 100_000 });
    const result = await service.issue({ amount: 100_000, recipientPhone: "+8801722222222", locale: "bn", send: true }, actor);
    expect(result.code).toBe("ABCD-EFGH-JKMN-PQRS");
    expect(tx.giftCard.create).toHaveBeenCalledWith({ data: expect.objectContaining({ codeHash: "hash", last4: "PQRS", balance: 100_000, status: "active", source: "admin" }) });
    expect(notifications.enqueue).toHaveBeenCalledWith(tx, expect.objectContaining({ event: "gift_card_received", variables: expect.objectContaining({ gift_card_code: "ABCD-EFGH-JKMN-PQRS" }) }));
    // The audit trail never contains the code.
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain("ABCDEFGHJKMNPQRS");
  });

  it("expires cards past their date and zeroes their balance in the ledger", async () => {
    const { service, tx } = make({});
    tx.giftCard.findUniqueOrThrow.mockResolvedValueOnce({ balance: 12_000, status: "active" });
    expect(await service.expirySweep()).toEqual({ expired: 1 });
    expect(tx.giftCard.update).toHaveBeenCalledWith({ where: { id: "g1" }, data: { status: "expired", balance: 0 } });
    expect(tx.giftCardTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: -12_000, reason: "expire", balanceAfter: 0 }) });
  });
});
