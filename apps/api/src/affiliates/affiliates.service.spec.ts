import { describe, expect, it, vi } from "vitest";
import { AffiliatesService } from "./affiliates.service";

const affiliate = { id: "a1", code: "NUSRAT", status: "active", phone: "+8801799999999", commissionType: "percent", commissionValue: 1_000, attributionDays: null, discountId: "d1" };
const actor = { id: "staff-1", name: "A", email: "a@x", locale: "en", permissions: new Set<string>(), isSuperAdmin: false, totpEnabled: true };

function make(options: { enabled?: boolean; byDiscount?: Record<string, unknown> | null; byCode?: Record<string, unknown> | null } = {}) {
  const values: Record<string, unknown> = { "affiliates.enabled": options.enabled ?? true, "affiliates.attributionDays": 30 };
  const settings = { getValue: vi.fn((key: string) => Promise.resolve(values[key])) };
  const tx = {
    affiliate: { findFirst: vi.fn(() => Promise.resolve(options.byDiscount === undefined ? affiliate : options.byDiscount)) },
    affiliateConversion: { create: vi.fn(() => Promise.resolve({})), findMany: vi.fn(() => Promise.resolve([{ id: "c1", commission: 5_000 }, { id: "c2", commission: 7_000 }])), updateMany: vi.fn(() => Promise.resolve({ count: 2 })) },
    affiliatePayout: { create: vi.fn(() => Promise.resolve({ id: "p1", amount: 12_000 })) },
  };
  const prisma = {
    $transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    affiliate: { findUnique: vi.fn(() => Promise.resolve(options.byCode === undefined ? affiliate : options.byCode)) },
    affiliateConversion: { findMany: vi.fn(() => Promise.resolve([])), updateMany: vi.fn(() => Promise.resolve({ count: 1 })) },
    order: { findUnique: vi.fn() },
  };
  const service = new AffiliatesService(prisma as never, settings as never, { record: vi.fn() } as never, { get: () => "https://shop.test" } as never);
  return { service, prisma, tx };
}

const input = {
  orderId: "o1",
  discountIds: [] as string[],
  cartAffiliateCode: null as string | null,
  cartAffiliateClickedAt: null as Date | null,
  phone: "+8801722222222",
  customerId: null,
  lines: [{ lineTotal: 200_000, discountAllocated: 20_000, quantity: 2 }],
  orderLevelDiscounts: 0,
};

describe("AffiliatesService.attributeInTx", () => {
  it("credits the affiliate whose coupon the order used", async () => {
    const { service, tx } = make();
    await service.attributeInTx(tx as never, { ...input, discountIds: ["d1"] });
    expect(tx.affiliateConversion.create).toHaveBeenCalledWith({ data: { affiliateId: "a1", orderId: "o1", source: "coupon", orderAmount: 180_000, commission: 18_000 } });
  });

  it("falls back to a recent link click", async () => {
    const { service, tx } = make({ byDiscount: null });
    await service.attributeInTx(tx as never, { ...input, cartAffiliateCode: "nusrat", cartAffiliateClickedAt: new Date(Date.now() - 2 * 86_400_000) });
    expect(tx.affiliateConversion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ source: "link", commission: 18_000 }) });
  });

  it("ignores clicks outside the attribution window", async () => {
    const { service, tx } = make({ byDiscount: null });
    await service.attributeInTx(tx as never, { ...input, cartAffiliateCode: "NUSRAT", cartAffiliateClickedAt: new Date(Date.now() - 40 * 86_400_000) });
    expect(tx.affiliateConversion.create).not.toHaveBeenCalled();
  });

  it("pays no commission on the affiliate's own purchase, or while the feature is off", async () => {
    const own = make();
    await own.service.attributeInTx(own.tx as never, { ...input, discountIds: ["d1"], phone: "+8801799999999" });
    expect(own.tx.affiliateConversion.create).not.toHaveBeenCalled();

    const off = make({ enabled: false });
    await off.service.attributeInTx(off.tx as never, { ...input, discountIds: ["d1"] });
    expect(off.tx.affiliateConversion.create).not.toHaveBeenCalled();
  });
});

describe("AffiliatesService.approvalSweep", () => {
  it("approves completed orders, recomputing for returned items but never above the original", async () => {
    const { service, prisma } = make();
    prisma.affiliateConversion.findMany.mockResolvedValueOnce([{ id: "c1", orderId: "o1", commission: 18_000, affiliate }] as never);
    prisma.order.findUnique.mockResolvedValueOnce({ status: "completed", referralDiscount: 0, pointsDiscount: 0, items: [{ lineTotal: 200_000, discountAllocated: 20_000, quantity: 2, rejectedQty: 0, returnedQty: 1 }] });
    expect(await service.approvalSweep()).toEqual({ approved: 1, rejected: 0 });
    expect(prisma.affiliateConversion.updateMany).toHaveBeenCalledWith({ where: { id: "c1", status: "pending" }, data: expect.objectContaining({ status: "approved", orderAmount: 90_000, commission: 9_000 }) });
  });

  it("rejects commissions on cancelled or refused orders", async () => {
    const { service, prisma } = make();
    prisma.affiliateConversion.findMany.mockResolvedValueOnce([{ id: "c1", orderId: "o1", commission: 18_000, affiliate }] as never);
    prisma.order.findUnique.mockResolvedValueOnce({ status: "cancelled", referralDiscount: 0, pointsDiscount: 0, items: [] });
    expect(await service.approvalSweep()).toEqual({ approved: 0, rejected: 1 });
    expect(prisma.affiliateConversion.updateMany).toHaveBeenCalledWith({ where: { id: "c1", status: "pending" }, data: { status: "rejected", rejectedReason: "Order cancelled" } });
  });
});

describe("AffiliatesService.recordPayout", () => {
  it("pays every approved, unpaid commission in one payout", async () => {
    const { service, tx } = make();
    const payout = await service.recordPayout("a1", { method: "bkash", externalRef: "TRX1" }, actor);
    expect(payout).toEqual({ id: "p1", amount: 12_000 });
    expect(tx.affiliatePayout.create).toHaveBeenCalledWith({ data: expect.objectContaining({ affiliateId: "a1", amount: 12_000, method: "bkash", externalRef: "TRX1" }) });
    expect(tx.affiliateConversion.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["c1", "c2"] }, status: "approved", payoutId: null }, data: { status: "paid", payoutId: "p1" } });
  });

  it("refuses when there's nothing approved", async () => {
    const { service, tx } = make();
    tx.affiliateConversion.findMany.mockResolvedValueOnce([]);
    await expect(service.recordPayout("a1", { method: "bkash" }, actor)).rejects.toMatchObject({ response: { code: "NOTHING_TO_PAY" } });
  });
});
