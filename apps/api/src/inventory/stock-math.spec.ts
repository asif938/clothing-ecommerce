import { describe, expect, it } from "vitest";
import { nextCostPrice, purchaseOrderStatusAfterReceive, stockTakeAdjustment, summarizeStockTake, weightedAverageCost } from "./stock-math";

describe("weightedAverageCost", () => {
  it("blends existing stock and the receipt by quantity", () => {
    // 10 @ ৳500 + 30 @ ৳600 → ৳575
    expect(weightedAverageCost(10, 50_000, 30, 60_000)).toBe(57_500);
  });
  it("rounds to the nearest poisha", () => {
    expect(weightedAverageCost(1, 100, 2, 101)).toBe(101); // 302/3 = 100.67
  });
  it("uses the receipt cost when nothing is on hand or no cost is known", () => {
    expect(weightedAverageCost(0, 50_000, 5, 60_000)).toBe(60_000);
    expect(weightedAverageCost(-2, 50_000, 5, 60_000)).toBe(60_000);
    expect(weightedAverageCost(10, null, 5, 60_000)).toBe(60_000);
  });
  it("keeps the current cost for an empty receipt", () => {
    expect(weightedAverageCost(10, 50_000, 0, 60_000)).toBe(50_000);
  });
});

describe("nextCostPrice", () => {
  it("honours the configured method", () => {
    expect(nextCostPrice("none", 10, 50_000, 30, 60_000)).toBe(50_000);
    expect(nextCostPrice("last_cost", 10, 50_000, 30, 60_000)).toBe(60_000);
    expect(nextCostPrice("weighted_average", 10, 50_000, 30, 60_000)).toBe(57_500);
  });
});

describe("purchaseOrderStatusAfterReceive", () => {
  it("is received only when every line is fully received", () => {
    expect(purchaseOrderStatusAfterReceive([{ qtyOrdered: 5, qtyReceived: 5 }, { qtyOrdered: 3, qtyReceived: 4 }])).toBe("received");
  });
  it("is partially received when anything arrived", () => {
    expect(purchaseOrderStatusAfterReceive([{ qtyOrdered: 5, qtyReceived: 5 }, { qtyOrdered: 3, qtyReceived: 0 }])).toBe("partially_received");
  });
  it("stays sent when nothing arrived", () => {
    expect(purchaseOrderStatusAfterReceive([{ qtyOrdered: 5, qtyReceived: 0 }])).toBe("sent");
    expect(purchaseOrderStatusAfterReceive([])).toBe("sent");
  });
});

describe("stockTakeAdjustment", () => {
  it("applies only the counted difference, preserving sales made during the count", () => {
    // Snapshot 10, counted 8 (2 missing). Meanwhile 3 sold → on hand now 7. Result 5.
    expect(stockTakeAdjustment(10, 8, 7)).toEqual({ variance: -2, delta: -2, newOnHand: 5 });
  });
  it("handles a surplus", () => {
    expect(stockTakeAdjustment(4, 6, 4)).toEqual({ variance: 2, delta: 2, newOnHand: 6 });
  });
  it("never takes on hand below zero", () => {
    expect(stockTakeAdjustment(10, 0, 3)).toEqual({ variance: -10, delta: -3, newOnHand: 0 });
  });
});

describe("summarizeStockTake", () => {
  it("totals variances and their value, tracking uncounted and uncosted lines", () => {
    const summary = summarizeStockTake([
      { expectedQty: 10, countedQty: 8, costPrice: 50_000 },
      { expectedQty: 2, countedQty: 3, costPrice: null },
      { expectedQty: 5, countedQty: 5, costPrice: 40_000 },
      { expectedQty: 1, countedQty: null, costPrice: 10_000 },
    ]);
    expect(summary).toEqual({ linesCounted: 3, linesUncounted: 1, linesWithVariance: 2, unitsOver: 1, unitsShort: 2, valueVariance: -100_000, uncostedLines: 1 });
  });
});
