import { describe, expect, it, vi } from "vitest";
import { LoyaltyService } from "./loyalty.service";

const SETTINGS: Record<string, unknown> = {
  "loyalty.enabled": true,
  "loyalty.spendPerPoint": 10_000,
  "loyalty.pointValue": 100,
  "loyalty.minRedeemPoints": 50,
  "loyalty.maxRedeemPercent": 20,
  "loyalty.pendingDays": 7,
  "loyalty.expiryMonths": 12,
  "loyalty.bonus.reviewPhoto": 20,
  "loyalty.bonus.birthday": 50,
};

const actor = { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };

function make(overrides: Record<string, unknown> = {}) {
  const tx = {
    customer: { updateMany: vi.fn(() => Promise.resolve({ count: 1 })), update: vi.fn(() => Promise.resolve({})), findUniqueOrThrow: vi.fn(() => Promise.resolve({ pointsBalance: 100 })) },
    loyaltyTransaction: {
      findMany: vi.fn(() =>
        Promise.resolve([
          { id: "late", remaining: 80, expiresAt: new Date("2027-09-01") },
          { id: "soon", remaining: 30, expiresAt: new Date("2027-01-01") },
        ]),
      ),
      update: vi.fn(() => Promise.resolve({})),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      create: vi.fn(() => Promise.resolve({})),
      findUnique: vi.fn(() => Promise.resolve({ remaining: 25 })),
    },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    $queryRaw: vi.fn((): Promise<unknown[]> => Promise.resolve([])),
    customer: { findUnique: vi.fn(() => Promise.resolve({ tier: { earnMultiplierPercent: 150 }, totalSpent: 0, tierId: null })), findUniqueOrThrow: vi.fn(() => Promise.resolve({ pointsBalance: 0 })), update: vi.fn(() => Promise.resolve({})) },
    order: {
      findUnique: vi.fn(() =>
        Promise.resolve({ status: "delivered", pointsDiscount: 0, items: [{ lineTotal: 300_000, discountAllocated: 0, quantity: 1, rejectedQty: 0, returnedQty: 0 }] }),
      ),
    },
    loyaltyTransaction: { create: vi.fn(() => Promise.resolve({})), findMany: vi.fn(() => Promise.resolve([])) },
    loyaltyTier: { findMany: vi.fn(() => Promise.resolve([])) },
    ...overrides,
  };
  const settings = { getValue: vi.fn((key: string) => Promise.resolve(SETTINGS[key])) };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  return { service: new LoyaltyService(prisma as never, settings as never, audit as never), prisma, tx, settings };
}

describe("LoyaltyService.redeemInTx / debitInTx", () => {
  it("decrements the balance with a guard and spends the soonest-expiring lot first", async () => {
    const { service, tx } = make();
    await service.redeemInTx(tx as never, "c1", "o1", 50);
    expect(tx.customer.updateMany).toHaveBeenCalledWith({ where: { id: "c1", pointsBalance: { gte: 50 } }, data: { pointsBalance: { decrement: 50 } } });
    expect(tx.loyaltyTransaction.update).toHaveBeenNthCalledWith(1, { where: { id: "soon" }, data: { remaining: { decrement: 30 } } });
    expect(tx.loyaltyTransaction.update).toHaveBeenNthCalledWith(2, { where: { id: "late" }, data: { remaining: { decrement: 20 } } });
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ customerId: "c1", points: -50, reason: "order_redeem", reference: "o1", orderId: "o1" }) });
  });

  it("refuses when a concurrent redemption already emptied the balance", async () => {
    const { service, tx } = make();
    tx.customer.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.redeemInTx(tx as never, "c1", "o1", 50)).rejects.toMatchObject({ response: { code: "POINTS_INSUFFICIENT" } });
    expect(tx.loyaltyTransaction.create).not.toHaveBeenCalled();
  });

  it("does nothing for zero points", async () => {
    const { service, tx } = make();
    await service.redeemInTx(tx as never, "c1", "o1", 0);
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
  });
});

describe("LoyaltyService.earnSweep", () => {
  it("creates a pending lot with the tier multiplier, available after the pending days", async () => {
    const deliveredAt = new Date("2026-11-01T10:00:00Z");
    const { service, prisma } = make();
    prisma.$queryRaw.mockResolvedValueOnce([{ id: "o1", customer_id: "c1", delivered_at: deliveredAt }]);
    await expect(service.earnSweep()).resolves.toEqual({ created: 1 });
    // ৳3,000 at 1 point/৳100 × 150% = 45 points
    expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ customerId: "c1", points: 45, reason: "order_delivered", status: "pending", reference: "o1", availableAt: new Date("2026-11-08T10:00:00Z") }),
    });
  });

  it("does nothing while the program is off", async () => {
    const { service, prisma, settings } = make();
    settings.getValue.mockImplementation((key: string) => Promise.resolve(key === "loyalty.enabled" ? false : SETTINGS[key]));
    await service.earnSweep();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("LoyaltyService.releaseSweep", () => {
  it("releases recomputed points into the balance when the order still counts", async () => {
    const { service, prisma, tx } = make({
      loyaltyTransaction: { findMany: vi.fn(() => Promise.resolve([{ id: "t1", customerId: "c1", orderId: "o1", points: 45, customer: { tier: { earnMultiplierPercent: 150 } } }])) },
    });
    await expect(service.releaseSweep()).resolves.toEqual({ released: 1, voided: 0 });
    expect(tx.loyaltyTransaction.updateMany).toHaveBeenCalledWith({ where: { id: "t1", status: "pending" }, data: expect.objectContaining({ status: "available", points: 45, remaining: 45 }) });
    expect(tx.customer.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { pointsBalance: { increment: 45 } } });
    expect(prisma.order.findUnique).toHaveBeenCalled();
  });

  it("voids the points when the order was returned or cancelled in the window", async () => {
    const { service, prisma, tx } = make({
      loyaltyTransaction: { findMany: vi.fn(() => Promise.resolve([{ id: "t1", customerId: "c1", orderId: "o1", points: 45, customer: { tier: null } }])) },
    });
    prisma.order.findUnique.mockResolvedValueOnce({ status: "returned_to_warehouse" } as never);
    await expect(service.releaseSweep()).resolves.toEqual({ released: 0, voided: 1 });
    expect(tx.loyaltyTransaction.updateMany).toHaveBeenCalledWith({ where: { id: "t1", status: "pending" }, data: expect.objectContaining({ status: "void" }) });
    expect(tx.customer.update).not.toHaveBeenCalled();
  });
});

describe("LoyaltyService.adjust", () => {
  it("grants positive adjustments as a new lot and audits the change", async () => {
    const { service, prisma, tx } = make({ customer: { findUnique: vi.fn(() => Promise.resolve({ id: "c1", pointsBalance: 10, tier: null, totalSpent: 0 })), findUniqueOrThrow: vi.fn(() => Promise.resolve({ pointsBalance: 110 })) } });
    prisma.loyaltyTransaction = { ...prisma.loyaltyTransaction, aggregate: vi.fn(() => Promise.resolve({ _sum: { points: 0, remaining: 0 } })) } as never;
    await service.adjust("c1", { points: 100, note: "Goodwill" }, actor);
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ customerId: "c1", points: 100, reason: "adjust", remaining: 100, note: "Goodwill", createdBy: "staff-1" }) });
    expect(tx.customer.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { pointsBalance: { increment: 100 } } });
  });
});
