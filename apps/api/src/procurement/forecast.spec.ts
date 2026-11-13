import { describe, expect, it } from "vitest";
import { compareUrgency, forecastDemand, suggestReorder } from "./forecast";

const flat = (perDay: number, days: number) => Array.from({ length: days }, () => perDay);

describe("forecastDemand", () => {
  it("returns no demand for an empty or all-zero history", () => {
    expect(forecastDemand([], 30)).toMatchObject({ dailyRate: 0, forecastUnits: 0, confidence: "none" });
    expect(forecastDemand(flat(0, 90), 30)).toMatchObject({ dailyRate: 0, forecastUnits: 0, confidence: "none", totalUnits: 0 });
  });

  it("recovers a steady rate and scales it over the horizon", () => {
    const f = forecastDemand(flat(2, 90), 30);
    expect(f.dailyRate).toBeCloseTo(2, 5);
    expect(f.forecastUnits).toBe(60);
    expect(f.trend).toBeCloseTo(1, 5);
    expect(f.confidence).toBe("high");
  });

  it("weights recent sales above old ones", () => {
    const rising = [...flat(0, 60), ...flat(4, 30)];
    const falling = [...flat(4, 30), ...flat(0, 60)];
    expect(forecastDemand(rising, 30).dailyRate).toBeGreaterThan(forecastDemand(falling, 30).dailyRate);
  });

  it("nudges the rate by the recent trend, but clamps it", () => {
    const base = forecastDemand(flat(1, 60), 30).dailyRate;
    const surge = forecastDemand([...flat(1, 46), ...flat(10, 14)], 30);
    expect(surge.trend).toBeGreaterThan(5);
    expect(surge.dailyRate).toBeGreaterThan(base);
    // Clamped: the trend adds at most +25% (half of the +50% clamp) to the blended average of this history.
    const blended = forecastDemand([...flat(1, 46), ...flat(10, 14)].map((v) => v), 30).dailyRate;
    const unadjustedUpperBound = (0.5 * 10 + 0.3 * ((16 * 1 + 14 * 10) / 30) + 0.2 * ((46 + 140) / 60)) * 1.25;
    expect(blended).toBeLessThanOrEqual(unadjustedUpperBound);
  });

  it("skips the trend when the prior window sold nothing or history is short", () => {
    expect(forecastDemand([...flat(0, 20), ...flat(3, 10)], 30).trend).toBeNull();
    expect(forecastDemand([...flat(0, 30), ...flat(3, 14)], 30).trend).toBeNull();
  });

  it("grades confidence by units and history length", () => {
    expect(forecastDemand([...flat(0, 29), 1], 30).confidence).toBe("low");
    expect(forecastDemand([...flat(0, 20), ...flat(1, 10)], 30).confidence).toBe("medium");
    expect(forecastDemand(flat(1, 60), 30).confidence).toBe("high");
  });
});

describe("suggestReorder", () => {
  const base = { onHand: 10, incoming: 0, dailyRate: 2, leadTimeDays: 14, safetyStockDays: 7, coverDays: 30 };

  it("has nothing to say without demand", () => {
    expect(suggestReorder({ ...base, dailyRate: 0 })).toMatchObject({ urgency: "no_demand", suggestedQty: 0, daysOfCover: null });
  });

  it("is critical when stock runs out before a new order could arrive", () => {
    const s = suggestReorder(base);
    // reorder point = 2*14 + 2*7 = 42; target = 2*(14+30) + 14 = 102.
    expect(s).toMatchObject({ reorderPoint: 42, targetStock: 102, suggestedQty: 92, urgency: "critical" });
    expect(s.daysOfCover).toBe(5);
  });

  it("is only 'soon' when current stock outlasts the lead time", () => {
    const s = suggestReorder({ ...base, onHand: 40 });
    expect(s.urgency).toBe("soon");
    expect(s.suggestedQty).toBe(62);
  });

  it("counts incoming orders toward the position", () => {
    expect(suggestReorder({ ...base, incoming: 200 })).toMatchObject({ urgency: "ok", suggestedQty: 0 });
    expect(suggestReorder({ ...base, onHand: 0, incoming: 60 }).suggestedQty).toBe(0);
    expect(suggestReorder({ ...base, onHand: 0, incoming: 30 }).suggestedQty).toBe(72);
  });

  it("is ok above the reorder point", () => {
    expect(suggestReorder({ ...base, onHand: 100 })).toMatchObject({ urgency: "ok", suggestedQty: 0 });
  });

  it("rounds up to pack size and respects the minimum order", () => {
    expect(suggestReorder({ ...base, packSize: 12 }).suggestedQty).toBe(96);
    expect(suggestReorder({ ...base, onHand: 40, minOrderQty: 100 }).suggestedQty).toBe(100);
    expect(suggestReorder({ ...base, onHand: 100, minOrderQty: 100 }).suggestedQty).toBe(0);
  });

  it("treats negative stock as empty", () => {
    expect(suggestReorder({ ...base, onHand: -5 }).daysOfCover).toBe(0);
  });
});

describe("compareUrgency", () => {
  it("sorts critical first, then by days of cover", () => {
    const rows = [
      { urgency: "ok" as const, daysOfCover: 90 },
      { urgency: "soon" as const, daysOfCover: 20 },
      { urgency: "critical" as const, daysOfCover: 8 },
      { urgency: "critical" as const, daysOfCover: 2 },
      { urgency: "no_demand" as const, daysOfCover: null },
    ];
    expect([...rows].sort(compareUrgency).map((r) => r.daysOfCover)).toEqual([2, 8, 20, 90, null]);
  });
});
