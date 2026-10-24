import { describe, expect, it } from "vitest";
import { computeRateFee, listMatchingRates, selectZone, type RateCandidate, type ZoneCandidate } from "./shipping-calc";

const dhaka = { divisionId: "div-dhaka", districtId: "dist-dhaka", areaId: "area-gulshan", isDhakaCity: true };
const chittagong = { divisionId: "div-ctg", districtId: "dist-ctg", areaId: "area-agrabad", isDhakaCity: false };

function zone(overrides: Partial<ZoneCandidate>): ZoneCandidate {
  return { id: "z1", priority: 0, matchDivisionIds: [], matchDistrictIds: [], matchAreaIds: [], matchDhakaCity: false, isCatchAll: false, isActive: true, ...overrides };
}

describe("specificityOf / selectZone", () => {
  it("prefers an area match over a dhaka-city-flag match", () => {
    const zones = [zone({ id: "dhaka-city", matchDhakaCity: true, priority: 10 }), zone({ id: "gulshan-special", matchAreaIds: ["area-gulshan"], priority: 1 })];
    expect(selectZone(zones, dhaka)?.id).toBe("gulshan-special");
  });

  it("falls back to the catch-all zone when nothing more specific matches", () => {
    const zones = [zone({ id: "dhaka-city", matchDhakaCity: true }), zone({ id: "rest-of-bd", isCatchAll: true })];
    expect(selectZone(zones, chittagong)?.id).toBe("rest-of-bd");
  });

  it("breaks ties at the same specificity by priority", () => {
    const zones = [zone({ id: "low", isCatchAll: true, priority: 1 }), zone({ id: "high", isCatchAll: true, priority: 5 })];
    expect(selectZone(zones, chittagong)?.id).toBe("high");
  });

  it("ignores inactive zones", () => {
    const zones = [zone({ id: "inactive-area-match", matchAreaIds: ["area-gulshan"], isActive: false }), zone({ id: "rest-of-bd", isCatchAll: true })];
    expect(selectZone(zones, dhaka)?.id).toBe("rest-of-bd");
  });

  it("returns null when nothing matches at all", () => {
    expect(selectZone([zone({ matchDhakaCity: true })], chittagong)).toBeNull();
  });
});

function rate(overrides: Partial<RateCandidate>): RateCandidate {
  return { id: "r1", baseFee: 7000, includedWeightGrams: 1000, extraFeePerStep: 2000, weightStepGrams: 1000, freeOverAmount: null, minOrder: null, maxOrder: null, isActive: true, position: 0, ...overrides };
}

describe("listMatchingRates", () => {
  it("excludes rates outside the min/max order range", () => {
    const rates = [rate({ id: "small-only", maxOrder: 100_00 }), rate({ id: "any" })];
    expect(listMatchingRates(rates, 500_00).map((r) => r.id)).toEqual(["any"]);
  });

  it("orders by position", () => {
    const rates = [rate({ id: "second", position: 2 }), rate({ id: "first", position: 1 })];
    expect(listMatchingRates(rates, 0).map((r) => r.id)).toEqual(["first", "second"]);
  });
});

describe("computeRateFee", () => {
  it("charges only the base fee within the included weight", () => {
    expect(computeRateFee(rate({}), 900, 100_00, null)).toBe(7000);
  });

  it("adds a weight surcharge per step over the included weight, rounding up", () => {
    // 1000g included, 2500g total -> 1500g extra -> ceil(1500/1000) = 2 steps.
    expect(computeRateFee(rate({}), 2500, 100_00, null)).toBe(7000 + 2 * 2000);
  });

  it("is free once the rate's own freeOverAmount is reached, regardless of weight", () => {
    expect(computeRateFee(rate({ freeOverAmount: 100_00 }), 5000, 150_00, null)).toBe(0);
  });

  it("is free once the global free-delivery threshold is reached when the rate sets none", () => {
    expect(computeRateFee(rate({ freeOverAmount: null }), 5000, 150_00, 100_00)).toBe(0);
  });

  it("the rate's own freeOverAmount takes priority over the global threshold", () => {
    expect(computeRateFee(rate({ freeOverAmount: 1_000_00 }), 5000, 150_00, 100_00)).toBeGreaterThan(0);
  });
});
