import { describe, expect, it } from "vitest";
import {
  allocateProportionally,
  canCombine,
  computeDiscountAmount,
  conditionsMatchCart,
  eligibleSubtotal,
  lineIsEligible,
  violatesMarginGuard,
  type DiscountLine,
} from "./discount-math";

function line(overrides: Partial<DiscountLine>): DiscountLine {
  return { variantId: "v1", productId: "p1", categoryIds: [], tags: [], quantity: 1, lineTotal: 1000, ...overrides };
}

describe("lineIsEligible", () => {
  it("passes with no conditions", () => {
    expect(lineIsEligible(line({}), {})).toBe(true);
  });

  it("requires membership in includeCategoryIds when set", () => {
    expect(lineIsEligible(line({ categoryIds: ["c1"] }), { includeCategoryIds: ["c2"] })).toBe(false);
    expect(lineIsEligible(line({ categoryIds: ["c1"] }), { includeCategoryIds: ["c1"] })).toBe(true);
  });

  it("excludes a line whose category is in excludeCategoryIds", () => {
    expect(lineIsEligible(line({ categoryIds: ["c1"] }), { excludeCategoryIds: ["c1"] })).toBe(false);
  });

  it("excludes a line whose tag is in excludeTags even if includeTags also matches", () => {
    expect(lineIsEligible(line({ tags: ["sale", "new"] }), { includeTags: ["new"], excludeTags: ["sale"] })).toBe(false);
  });
});

describe("conditionsMatchCart", () => {
  const context = { subtotal: 5000, totalQty: 3, isFirstOrder: false, channel: "web" };

  it("enforces minSubtotal", () => {
    expect(conditionsMatchCart({ minSubtotal: 6000 }, context)).toBe(false);
    expect(conditionsMatchCart({ minSubtotal: 4000 }, context)).toBe(true);
  });

  it("enforces firstOrderOnly", () => {
    expect(conditionsMatchCart({ firstOrderOnly: true }, context)).toBe(false);
    expect(conditionsMatchCart({ firstOrderOnly: true }, { ...context, isFirstOrder: true })).toBe(true);
  });

  it("enforces an allowed channel list", () => {
    expect(conditionsMatchCart({ channels: ["admin"] }, context)).toBe(false);
  });
});

describe("eligibleSubtotal / computeDiscountAmount", () => {
  it("sums only eligible lines", () => {
    const lines = [line({ variantId: "a", lineTotal: 1000, categoryIds: ["c1"] }), line({ variantId: "b", lineTotal: 2000, categoryIds: ["c2"] })];
    expect(eligibleSubtotal(lines, { includeCategoryIds: ["c1"] })).toBe(1000);
  });

  it("rounds a percent discount down", () => {
    expect(computeDiscountAmount("percent", 10, 999)).toBe(99);
  });

  it("caps a fixed discount at the eligible amount", () => {
    expect(computeDiscountAmount("fixed", 5000, 2000)).toBe(2000);
  });

  it("free_shipping contributes nothing to the subtotal discount", () => {
    expect(computeDiscountAmount("free_shipping", 0, 5000)).toBe(0);
  });
});

describe("allocateProportionally", () => {
  it("splits proportionally and the last line absorbs the remainder so the sum matches exactly", () => {
    const lines = [line({ variantId: "a", lineTotal: 300 }), line({ variantId: "b", lineTotal: 700 })];
    const allocations = allocateProportionally(100, lines);
    expect(allocations.get("a")).toBe(30);
    expect(allocations.get("b")).toBe(70);
    expect([...allocations.values()].reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("handles an uneven split without losing or gaining poisha", () => {
    const lines = [line({ variantId: "a", lineTotal: 333 }), line({ variantId: "b", lineTotal: 333 }), line({ variantId: "c", lineTotal: 334 })];
    const allocations = allocateProportionally(100, lines);
    expect([...allocations.values()].reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("returns no allocations when the amount is zero", () => {
    expect(allocateProportionally(0, [line({})]).size).toBe(0);
  });
});

describe("canCombine", () => {
  it("allows a code discount alongside an automatic one when both permit it", () => {
    expect(canCombine("code", { automatic: true }, [{ type: "automatic", combinable: { codes: true } }])).toBe(true);
  });

  it("rejects when the candidate itself disallows combining with an already-applied type", () => {
    expect(canCombine("code", { automatic: false }, [{ type: "automatic", combinable: { codes: true } }])).toBe(false);
  });

  it("rejects when the already-applied discount disallows combining with the candidate's type", () => {
    expect(canCombine("code", { automatic: true }, [{ type: "automatic", combinable: { codes: false } }])).toBe(false);
  });

  it("allows combining with no discounts applied yet", () => {
    expect(canCombine("automatic", {}, [])).toBe(true);
  });
});

describe("violatesMarginGuard", () => {
  it("blocks when the discounted revenue would fall below cost", () => {
    expect(violatesMarginGuard({ variantId: "v1", costPrice: 500, unitPrice: 600, quantity: 1, allocatedDiscount: 200 }, 0)).toBe(true);
  });

  it("allows when revenue stays at or above cost plus the minimum margin", () => {
    expect(violatesMarginGuard({ variantId: "v1", costPrice: 500, unitPrice: 600, quantity: 1, allocatedDiscount: 50 }, 0)).toBe(false);
  });

  it("never blocks when cost price is unknown", () => {
    expect(violatesMarginGuard({ variantId: "v1", costPrice: null, unitPrice: 600, quantity: 1, allocatedDiscount: 10000 }, 0)).toBe(false);
  });

  it("accounts for a non-zero minimum margin percent", () => {
    // cost 500, qty 1, 10% margin -> minAcceptable 550; revenue 540 should block.
    expect(violatesMarginGuard({ variantId: "v1", costPrice: 500, unitPrice: 600, quantity: 1, allocatedDiscount: 60 }, 10)).toBe(true);
  });
});
