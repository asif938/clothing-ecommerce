import { describe, expect, it, vi } from "vitest";
import { reverseOrderBookkeepingInTx } from "./order-bookkeeping";

function makeTx(usages: { discountId: string; code: string | null }[] = []) {
  return {
    $executeRaw: vi.fn(() => Promise.resolve(1)),
    discountUsage: { findMany: vi.fn(() => Promise.resolve(usages)), deleteMany: vi.fn() },
    discount: { updateMany: vi.fn() },
    discountCode: { updateMany: vi.fn() },
  };
}

const baseOrder = { id: "o1", customerId: "c1", channel: "web", total: 150000, items: [{ quantity: 2, optionsSnapshot: { optionValueIds: [] } }] };

describe("reverseOrderBookkeepingInTx", () => {
  it("takes a web order back off the customer's counters", async () => {
    const tx = makeTx();
    await reverseOrderBookkeepingInTx(tx as never, baseOrder, { releaseCoupons: false });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, total, customerId] = tx.$executeRaw.mock.calls[0] as unknown as [TemplateStringsArray, number, string];
    expect(strings.join("?")).toContain("UPDATE customers");
    expect(total).toBe(150000);
    expect(customerId).toBe("c1");
  });

  it("leaves counters alone for guest orders and non-web channels (only web checkout increments them)", async () => {
    const guest = makeTx();
    await reverseOrderBookkeepingInTx(guest as never, { ...baseOrder, customerId: null }, { releaseCoupons: false });
    const manual = makeTx();
    await reverseOrderBookkeepingInTx(manual as never, { ...baseOrder, channel: "phone" }, { releaseCoupons: false });
    expect(guest.$executeRaw).not.toHaveBeenCalled();
    expect(manual.$executeRaw).not.toHaveBeenCalled();
  });

  it("gives flash-sale units back for lines that carried a flash-sale id", async () => {
    const tx = makeTx();
    await reverseOrderBookkeepingInTx(tx as never, { ...baseOrder, customerId: null, items: [{ quantity: 3, optionsSnapshot: { optionValueIds: [], flashSaleItemId: "fs1" } }, { quantity: 1, optionsSnapshot: null }] }, { releaseCoupons: false });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, quantity, itemId] = tx.$executeRaw.mock.calls[0] as unknown as [TemplateStringsArray, number, string];
    expect(strings.join("?")).toContain("flash_sale_items");
    expect(quantity).toBe(3);
    expect(itemId).toBe("fs1");
  });

  it("releases coupon usage and its counters only when asked", async () => {
    const off = makeTx([{ discountId: "d1", code: "VIPAB12" }]);
    await reverseOrderBookkeepingInTx(off as never, baseOrder, { releaseCoupons: false });
    expect(off.discountUsage.deleteMany).not.toHaveBeenCalled();

    const on = makeTx([{ discountId: "d1", code: "VIPAB12" }]);
    await reverseOrderBookkeepingInTx(on as never, baseOrder, { releaseCoupons: true });
    expect(on.discount.updateMany).toHaveBeenCalledWith({ where: { id: "d1", usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
    expect(on.discountCode.updateMany).toHaveBeenCalledWith({ where: { code: "VIPAB12", discountId: "d1", usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
    expect(on.discountUsage.deleteMany).toHaveBeenCalledWith({ where: { orderId: "o1" } });
  });
});
