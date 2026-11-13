import { describe, expect, it, vi } from "vitest";
import { ReferralsService } from "./referrals.service";

const BASE: Record<string, unknown> = {
  "referral.enabled": true,
  "referral.refereeDiscountType": "percent",
  "referral.refereeDiscountPercent": 10,
  "referral.refereeDiscountAmount": 10_000,
  "referral.refereeMaxDiscount": 30_000,
  "referral.refereeMinOrder": 0,
  "referral.combinableWithCoupons": false,
  "referral.rewardType": "store_credit",
  "referral.rewardAmount": 10_000,
  "referral.rewardPoints": 100,
  "referral.maxRewardsPerMonth": 2,
};

function make(overrides: { settings?: Record<string, unknown>; referrer?: Record<string, unknown> | null; previousOrders?: number; referred?: boolean; pending?: Record<string, unknown>[]; orders?: Record<string, unknown>[]; rewardedThisMonth?: number } = {}) {
  const values = { ...BASE, ...overrides.settings };
  const settings = { getValue: vi.fn((key: string) => Promise.resolve(values[key])) };
  const referrer = overrides.referrer === undefined ? { id: "r1", name: "Nusrat Jahan", phone: "+8801711111111", status: "active", referralCode: "A1B2C3D4", deletedAt: null } : overrides.referrer;
  const prisma = {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    customer: {
      findUnique: vi.fn((args: { where: Record<string, unknown> }) => Promise.resolve("referralCode" in args.where ? referrer : { ordersCount: overrides.previousOrders ?? 0, name: "N", phone: "+8801711111111", email: null, locale: "bn" })),
    },
    order: { count: vi.fn(() => Promise.resolve(overrides.previousOrders ?? 0)), findMany: vi.fn(() => Promise.resolve(overrides.orders ?? [])) },
    referral: {
      findUnique: vi.fn(() => Promise.resolve(overrides.referred ? { id: "x" } : null)),
      findMany: vi.fn(() => Promise.resolve(overrides.pending ?? [])),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
      count: vi.fn(() => Promise.resolve(overrides.rewardedThisMonth ?? 0)),
    },
  };
  const loyalty = { getSettings: vi.fn(() => Promise.resolve({ enabled: true })), grant: vi.fn(() => Promise.resolve(true)) };
  const storeCredit = { credit: vi.fn(() => Promise.resolve(true)) };
  const notifications = { commonVariables: vi.fn(() => Promise.resolve({})), enqueue: vi.fn(() => Promise.resolve()) };
  const service = new ReferralsService(prisma as never, settings as never, { record: vi.fn() } as never, notifications as never, loyalty as never, storeCredit as never, { get: () => "https://shop.test" } as never);
  return { service, prisma, loyalty, storeCredit, notifications };
}

describe("ReferralsService.quote", () => {
  const ctx = { customerId: "c2", phone: "+8801722222222", goodsTotal: 500_000, couponApplied: false };

  it("gives a new shopper the capped first-order discount", async () => {
    const { service } = make();
    expect(await service.quote("a1b2c3d4", ctx)).toEqual({ code: "A1B2C3D4", referrerName: "Nusrat", discount: 30_000, rejection: null });
  });

  it("refuses returning customers, self-referral and stacking with coupons", async () => {
    expect((await make({ previousOrders: 2 }).service.quote("A1B2C3D4", ctx))?.rejection).toBe("NOT_FIRST_ORDER");
    expect((await make().service.quote("A1B2C3D4", { ...ctx, phone: "+8801711111111" }))?.rejection).toBe("SELF_REFERRAL");
    expect((await make().service.quote("A1B2C3D4", { ...ctx, couponApplied: true }))?.rejection).toBe("COUPON_IN_USE");
    expect((await make({ referred: true }).service.quote("A1B2C3D4", ctx))?.rejection).toBe("ALREADY_REFERRED");
  });

  it("returns nothing while the program is off", async () => {
    expect(await make({ settings: { "referral.enabled": false } }).service.quote("A1B2C3D4", ctx)).toBeNull();
  });
});

describe("ReferralsService.rewardSweep", () => {
  const pending = [{ id: "ref1", orderId: "o1", referrerCustomerId: "r1" }];

  it("rewards the referrer with store credit once the friend's order completes", async () => {
    const { service, storeCredit, prisma } = make({ pending, orders: [{ id: "o1", status: "completed" }] });
    expect(await service.rewardSweep()).toEqual({ rewarded: 1, voided: 0 });
    expect(prisma.referral.updateMany).toHaveBeenCalledWith({ where: { id: "ref1", status: "pending" }, data: expect.objectContaining({ status: "rewarded", rewardType: "store_credit", rewardAmount: 10_000 }) });
    expect(storeCredit.credit).toHaveBeenCalledWith("r1", 10_000, expect.objectContaining({ reason: "referral", reference: "ref1" }));
  });

  it("rewards points when configured", async () => {
    const { service, loyalty } = make({ pending, orders: [{ id: "o1", status: "completed" }], settings: { "referral.rewardType": "points" } });
    await service.rewardSweep();
    expect(loyalty.grant).toHaveBeenCalledWith("r1", 100, "referral", "ref1", expect.anything());
  });

  it("waits while the order is still in its return window", async () => {
    const { service, storeCredit } = make({ pending, orders: [{ id: "o1", status: "delivered" }] });
    expect(await service.rewardSweep()).toEqual({ rewarded: 0, voided: 0 });
    expect(storeCredit.credit).not.toHaveBeenCalled();
  });

  it("voids referrals whose order failed or that exceed the monthly cap", async () => {
    const failed = make({ pending, orders: [{ id: "o1", status: "rejected_at_door" }] });
    expect(await failed.service.rewardSweep()).toEqual({ rewarded: 0, voided: 1 });
    expect(failed.prisma.referral.updateMany).toHaveBeenCalledWith({ where: { id: "ref1", status: "pending" }, data: { status: "void", voidReason: "Order rejected_at_door" } });

    const capped = make({ pending, orders: [{ id: "o1", status: "completed" }], rewardedThisMonth: 2 });
    expect(await capped.service.rewardSweep()).toEqual({ rewarded: 0, voided: 1 });
    expect(capped.storeCredit.credit).not.toHaveBeenCalled();
  });
});
