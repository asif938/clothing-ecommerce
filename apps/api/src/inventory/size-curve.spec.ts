import { describe, expect, it } from "vitest";
import { allocateLargestRemainder, computeSizeCurve } from "./size-curve";

describe("allocateLargestRemainder", () => {
  it("always sums exactly to the total", () => {
    const parts = allocateLargestRemainder([1, 1, 1], 10);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10);
    expect(parts).toEqual([4, 3, 3]);
  });
  it("is proportional", () => {
    expect(allocateLargestRemainder([10, 30, 60], 50)).toEqual([5, 15, 30]);
  });
  it("splits evenly when all weights are zero", () => {
    expect(allocateLargestRemainder([0, 0], 5)).toEqual([3, 2]);
  });
  it("returns zeros for a zero total", () => {
    expect(allocateLargestRemainder([1, 2], 0)).toEqual([0, 0]);
  });
});

describe("computeSizeCurve", () => {
  const rows = [
    { size: "S", sold: 10, onHand: 20 },
    { size: "M", sold: 50, onHand: 10 },
    { size: "L", sold: 40, onHand: 10 },
  ];

  it("reports sold and stock shares and the gap", () => {
    const curve = computeSizeCurve(rows);
    expect(curve.map((r) => r.soldShare)).toEqual([0.1, 0.5, 0.4]);
    expect(curve.map((r) => r.stockShare)).toEqual([0.5, 0.25, 0.25]);
    expect(curve[0]!.gap).toBeCloseTo(0.4);
    expect(curve[1]!.gap).toBeCloseTo(-0.25);
  });

  it("steers a new buy toward the under-stocked sizes and sums to the buy", () => {
    const curve = computeSizeCurve(rows, 60);
    // Target after buy (100 units): S 10, M 50, L 40 → short: S 0, M 40, L 30 → scaled to 60.
    expect(curve.map((r) => r.suggestedQty)).toEqual([0, 34, 26]);
    expect(curve.reduce((a, r) => a + r.suggestedQty, 0)).toBe(60);
  });

  it("splits evenly with no sales history", () => {
    const curve = computeSizeCurve([{ size: "S", sold: 0, onHand: 0 }, { size: "M", sold: 0, onHand: 0 }], 9);
    expect(curve.map((r) => r.suggestedQty)).toEqual([5, 4]);
  });

  it("follows the sales curve when no size is short of target", () => {
    const curve = computeSizeCurve([{ size: "S", sold: 1, onHand: 0 }, { size: "M", sold: 3, onHand: 1000 }], 4);
    // S is short (target 251) so all goes to S
    expect(curve.map((r) => r.suggestedQty)).toEqual([4, 0]);
  });
});
