import { describe, expect, it, vi } from "vitest";
import { DiscountsService } from "./discounts.service";

const discount = { id: "d1", type: "code", code: "VIP", status: "active", startsAt: null, endsAt: null, usedCount: 0, limits: null, conditions: null, combinableWith: null, valueType: "percentage", value: 10, marginGuardOverride: false };

function makeService(bulkUsedCount: number) {
  const prisma = {
    discount: { findMany: vi.fn(() => Promise.resolve([])), findFirst: vi.fn(() => Promise.resolve(null)) },
    discountCode: { findUnique: vi.fn(() => Promise.resolve({ id: "dc1", code: "VIPAB12", usedCount: bulkUsedCount, assignedTo: null, discount })) },
    discountUsage: { count: vi.fn(() => Promise.resolve(0)) },
  };
  const settings = { getValue: vi.fn(() => Promise.resolve(3)) };
  const experiments = { offerGate: vi.fn(() => Promise.resolve({ gated: new Set(), allowed: new Set() })) };
  return new DiscountsService(prisma as never, {} as never, settings as never, experiments as never);
}

const context = { subtotal: 100000, itemCount: 1, productIds: [], categoryIds: [], collectionIds: [], isFirstOrder: false, channel: "web" };

describe("single-use bulk codes", () => {
  it("rejects a bulk code that was already redeemed", async () => {
    const service = makeService(1);
    const result = await service.evaluate([], context as never, ["VIPAB12"], null, null);
    expect(result.applied).toHaveLength(0);
    expect(result.rejectedCodes).toEqual([expect.objectContaining({ code: "VIPAB12", reasonCode: "LIMIT_REACHED" })]);
  });

  it("claims a bulk code atomically and fails the order when the claim loses a race", async () => {
    const service = makeService(0);
    const tx = {
      discountCode: {
        findUnique: vi.fn(() => Promise.resolve({ id: "dc1", discountId: "d1" })),
        updateMany: vi.fn(() => Promise.resolve({ count: 0 })),
      },
    };
    await expect(service.claimBulkCodesInTx(tx as never, [{ discountId: "d1", code: "VIPAB12" }])).rejects.toMatchObject({ response: { code: "CODE_ALREADY_USED" } });
    expect(tx.discountCode.updateMany).toHaveBeenCalledWith({ where: { id: "dc1", usedCount: { lt: 1 } }, data: { usedCount: { increment: 1 } } });
  });

  it("leaves shared discount codes alone", async () => {
    const service = makeService(0);
    const tx = { discountCode: { findUnique: vi.fn(() => Promise.resolve(null)), updateMany: vi.fn() } };
    await service.claimBulkCodesInTx(tx as never, [{ discountId: "d1", code: "VIP" }, { discountId: "d2", code: null }]);
    expect(tx.discountCode.updateMany).not.toHaveBeenCalled();
  });
});
