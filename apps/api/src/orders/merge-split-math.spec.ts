import { describe, expect, it } from "vitest";
import { computeMerge, computeSplit, SplitError } from "./merge-split-math";

describe("computeMerge", () => {
  const target = { subtotal: 100000, discountTotal: 5000, shippingFee: 6000, shippingDiscount: 0, totalWeightGrams: 500, paidTotal: 0 };
  const source = { subtotal: 40000, discountTotal: 0, shippingFee: 12000, shippingDiscount: 0, totalWeightGrams: 300, paidTotal: 0 };

  it("sums items/discounts/weight and charges only the survivor's shipping", () => {
    expect(computeMerge(target, [source])).toEqual({
      subtotal: 140000,
      discountTotal: 5000,
      shippingFee: 6000,
      shippingDiscount: 0,
      total: 141000,
      codAmount: 141000,
      totalWeightGrams: 800,
    });
  });
  it("subtracts what the survivor already paid from the COD amount", () => {
    expect(computeMerge({ ...target, paidTotal: 50000 }, [source]).codAmount).toBe(91000);
  });
  it("never goes negative", () => {
    expect(computeMerge({ ...target, discountTotal: 999999 }, [source]).total).toBe(0);
  });
});

describe("computeSplit", () => {
  const order = {
    subtotal: 30000,
    discountTotal: 3000,
    totalWeightGrams: 900,
    items: [
      { id: "a", quantity: 2, unitPrice: 10000, discountAllocated: 2000 },
      { id: "b", quantity: 1, unitPrice: 10000, discountAllocated: 1000 },
    ],
  };

  it("moves a whole row and splits the discount by subtotal share", () => {
    const out = computeSplit(order, [{ orderItemId: "b", quantity: 1 }]);
    expect(out.moved).toEqual([{ orderItemId: "b", quantity: 1, wholeRow: true, lineTotal: 10000, discountAllocated: 1000 }]);
    expect(out.newSubtotal).toBe(10000);
    expect(out.newDiscount).toBe(1000);
    expect(out.remainingSubtotal).toBe(20000);
    expect(out.remainingDiscount).toBe(2000);
    expect(out.newWeight).toBe(300);
    expect(out.remainingWeight).toBe(600);
  });
  it("splits part of a row, keeping both halves summing to the original", () => {
    const out = computeSplit(order, [{ orderItemId: "a", quantity: 1 }]);
    expect(out.moved[0]).toMatchObject({ quantity: 1, wholeRow: false, lineTotal: 10000, discountAllocated: 1000 });
    expect(out.remainingItems.find((i) => i.orderItemId === "a")).toMatchObject({ quantity: 1, lineTotal: 10000, discountAllocated: 1000 });
    expect(out.newSubtotal + out.remainingSubtotal).toBe(order.subtotal);
    expect(out.newDiscount + out.remainingDiscount).toBe(order.discountTotal);
    expect(out.newWeight + out.remainingWeight).toBe(order.totalWeightGrams);
  });
  it("keeps odd-poisha discounts balanced", () => {
    const odd = { subtotal: 30000, discountTotal: 1001, totalWeightGrams: 1000, items: [{ id: "a", quantity: 3, unitPrice: 10000, discountAllocated: 1001 }] };
    const out = computeSplit(odd, [{ orderItemId: "a", quantity: 1 }]);
    expect(out.newDiscount + out.remainingDiscount).toBe(1001);
    expect(out.moved[0]!.discountAllocated + out.remainingItems[0]!.discountAllocated).toBe(1001);
  });
  it.each([
    [[], "NOTHING_TO_SPLIT"],
    [[{ orderItemId: "zzz", quantity: 1 }], "UNKNOWN_ITEM"],
    [[{ orderItemId: "a", quantity: 5 }], "QUANTITY_TOO_HIGH"],
    [[{ orderItemId: "a", quantity: 2 }, { orderItemId: "b", quantity: 1 }], "WOULD_EMPTY_ORDER"],
    [[{ orderItemId: "a", quantity: 1 }, { orderItemId: "a", quantity: 1 }], "DUPLICATE_LINE"],
  ])("rejects %j with %s", (lines, code) => {
    expect(() => computeSplit(order, lines as { orderItemId: string; quantity: number }[])).toThrowError(expect.objectContaining({ code }) as unknown as SplitError);
  });
});
