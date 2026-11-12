import { describe, expect, it } from "vitest";
import { addMonths, computeEarnPoints, computeRedemption, consumeLotsFifo, eligibleSpendForOrder, resolveTier, type LoyaltyRules } from "./loyalty.ts";

const RULES: LoyaltyRules = { spendPerPoint: 10_000, pointValue: 100, minRedeemPoints: 50, maxRedeemPercent: 20 };

describe("computeEarnPoints", () => {
  it("earns 1 point per ৳100 by default and rounds down", () => {
    expect(computeEarnPoints(250_000, 10_000)).toBe(25);
    expect(computeEarnPoints(259_999, 10_000)).toBe(25);
    expect(computeEarnPoints(9_999, 10_000)).toBe(0);
  });

  it("applies the tier multiplier in percent", () => {
    expect(computeEarnPoints(100_000, 10_000, 150)).toBe(15);
    expect(computeEarnPoints(100_000, 10_000, 125)).toBe(12);
  });

  it("never earns on zero or negative inputs", () => {
    expect(computeEarnPoints(0, 10_000)).toBe(0);
    expect(computeEarnPoints(-5, 10_000)).toBe(0);
    expect(computeEarnPoints(100_000, 10_000, 0)).toBe(0);
  });
});

describe("eligibleSpendForOrder", () => {
  it("counts each line net of its discount", () => {
    expect(eligibleSpendForOrder([{ lineTotal: 200_000, discountAllocated: 20_000, quantity: 2, rejectedQty: 0, returnedQty: 0 }], 0)).toBe(180_000);
  });

  it("excludes rejected and returned units", () => {
    const lines = [
      { lineTotal: 300_000, discountAllocated: 0, quantity: 3, rejectedQty: 1, returnedQty: 1 },
      { lineTotal: 50_000, discountAllocated: 0, quantity: 1, rejectedQty: 0, returnedQty: 0 },
    ];
    expect(eligibleSpendForOrder(lines, 0)).toBe(150_000);
  });

  it("removes the kept share of points paid, so points never earn points", () => {
    const lines = [{ lineTotal: 100_000, discountAllocated: 0, quantity: 2, rejectedQty: 1, returnedQty: 0 }];
    // kept 50,000 of 100,000; 10,000 paid with points → 5,000 belongs to the kept half.
    expect(eligibleSpendForOrder(lines, 10_000)).toBe(45_000);
  });

  it("returns 0 when nothing was kept", () => {
    expect(eligibleSpendForOrder([{ lineTotal: 100_000, discountAllocated: 0, quantity: 1, rejectedQty: 1, returnedQty: 0 }], 0)).toBe(0);
  });
});

describe("computeRedemption", () => {
  it("applies requested points within balance and the % cap", () => {
    // goods ৳5,000 → cap 20% = ৳1,000 = 1,000 points
    expect(computeRedemption(300, 500, 500_000, RULES)).toEqual({ points: 300, discount: 30_000, rejection: null, maxUsablePoints: 500 });
  });

  it("caps at max % of the goods total", () => {
    const result = computeRedemption(800, 800, 200_000, RULES); // cap ৳400 = 400 points
    expect(result.points).toBe(400);
    expect(result.discount).toBe(40_000);
    expect(result.maxUsablePoints).toBe(400);
  });

  it("never uses more than the balance", () => {
    expect(computeRedemption(1_000, 120, 1_000_000, RULES).points).toBe(120);
  });

  it("rejects below the minimum, including when the cap pushes it below", () => {
    expect(computeRedemption(40, 500, 1_000_000, RULES).rejection).toBe("BELOW_MINIMUM");
    expect(computeRedemption(100, 500, 20_000, RULES)).toMatchObject({ points: 0, rejection: "CAP_BELOW_MINIMUM" });
  });

  it("reports nothing usable without a balance or a request", () => {
    expect(computeRedemption(0, 500, 1_000_000, RULES)).toMatchObject({ points: 0, rejection: "NOT_REQUESTED", maxUsablePoints: 500 });
    expect(computeRedemption(100, 0, 1_000_000, RULES)).toMatchObject({ points: 0, rejection: "NO_BALANCE", maxUsablePoints: 0 });
  });
});

describe("consumeLotsFifo", () => {
  const d = (s: string) => new Date(s);

  it("spends the soonest-expiring lots first and never-expiring last", () => {
    const lots = [
      { id: "never", remaining: 100, expiresAt: null },
      { id: "late", remaining: 50, expiresAt: d("2027-06-01") },
      { id: "soon", remaining: 30, expiresAt: d("2027-01-01") },
    ];
    expect(consumeLotsFifo(lots, 100)).toEqual({ allocations: [{ id: "soon", take: 30 }, { id: "late", take: 50 }, { id: "never", take: 20 }], shortfall: 0 });
  });

  it("reports a shortfall when lots don't cover the points", () => {
    expect(consumeLotsFifo([{ id: "a", remaining: 10, expiresAt: null }], 25)).toEqual({ allocations: [{ id: "a", take: 10 }], shortfall: 15 });
  });

  it("skips empty lots", () => {
    expect(consumeLotsFifo([{ id: "a", remaining: 0, expiresAt: null }], 5).allocations).toEqual([]);
  });
});

describe("resolveTier", () => {
  const tiers = [
    { id: "silver", minSpent: 0 },
    { id: "gold", minSpent: 2_000_000 },
    { id: "platinum", minSpent: 5_000_000 },
  ];
  it("picks the highest reached threshold", () => {
    expect(resolveTier(tiers, 1_000)?.id).toBe("silver");
    expect(resolveTier(tiers, 2_000_000)?.id).toBe("gold");
    expect(resolveTier(tiers, 9_000_000)?.id).toBe("platinum");
  });
  it("returns null when no tier applies", () => {
    expect(resolveTier([{ id: "gold", minSpent: 100 }], 50)).toBeNull();
  });
});

describe("addMonths", () => {
  it("adds calendar months in UTC", () => {
    expect(addMonths(new Date("2026-01-15T00:00:00Z"), 12).toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });
});
