import { describe, expect, it } from "vitest";
import { buildCohortMatrix, monthIndex, monthKeyFromIndex, summarizeLtv } from "./cohorts";

describe("month helpers", () => {
  it("round-trips across a year boundary", () => {
    expect(monthKeyFromIndex(monthIndex("2026-12") + 1)).toBe("2027-01");
    expect(monthIndex("2027-01") - monthIndex("2026-11")).toBe(2);
  });
});

describe("buildCohortMatrix", () => {
  const rows = [
    // January cohort: 10 customers, 4 came back in Feb, 2 in Mar.
    { cohort: "2026-01", month: "2026-01", customers: 10, orders: 10, revenue: 1_000_000 },
    { cohort: "2026-01", month: "2026-02", customers: 4, orders: 5, revenue: 500_000 },
    { cohort: "2026-01", month: "2026-03", customers: 2, orders: 2, revenue: 200_000 },
    // February cohort: 20 customers, 5 came back in March.
    { cohort: "2026-02", month: "2026-02", customers: 20, orders: 20, revenue: 2_000_000 },
    { cohort: "2026-02", month: "2026-03", customers: 5, orders: 5, revenue: 400_000 },
  ];

  it("computes retention against the cohort size", () => {
    const [jan, feb] = buildCohortMatrix(rows, "2026-03", 3);
    expect(jan!.size).toBe(10);
    expect(jan!.retention.slice(0, 3)).toEqual([1, 0.4, 0.2]);
    expect(feb!.retention.slice(0, 2)).toEqual([1, 0.25]);
  });

  it("accumulates revenue per acquired customer", () => {
    const [jan] = buildCohortMatrix(rows, "2026-03", 3);
    expect(jan!.ltv.slice(0, 3)).toEqual([100_000, 150_000, 170_000]);
    expect(jan!.totalRevenue).toBe(1_700_000);
  });

  it("marks months that have not happened yet as null instead of zero", () => {
    const [jan, feb] = buildCohortMatrix(rows, "2026-03", 3);
    // Current month is March: January +3 is April (not started) → null; February +2 is April → null, +1 is March → 0.25.
    expect(jan!.retention[3]).toBeNull();
    expect(jan!.ltv[3]).toBeNull();
    expect(feb!.retention).toEqual([1, 0.25, null, null]);
    expect(jan!.retention[2]).toBe(0.2);
  });

  it("returns cohorts oldest first and skips cohorts with no acquisition month row", () => {
    const shuffled = [...rows].reverse();
    expect(buildCohortMatrix(shuffled, "2026-03", 2).map((c) => c.cohort)).toEqual(["2026-01", "2026-02"]);
    expect(buildCohortMatrix([{ cohort: "2026-01", month: "2026-02", customers: 1, orders: 1, revenue: 1 }], "2026-03", 2)).toEqual([]);
  });
});

describe("summarizeLtv", () => {
  it("handles an empty store", () => {
    expect(summarizeLtv([])).toMatchObject({ customers: 0, repeatRate: null, topDecileShare: null });
  });

  it("summarises the spread", () => {
    const customers = [
      ...Array.from({ length: 8 }, () => ({ orders: 1, revenue: 100_000 })),
      { orders: 3, revenue: 400_000 },
      { orders: 5, revenue: 1_000_000 },
    ];
    const s = summarizeLtv(customers);
    expect(s.customers).toBe(10);
    expect(s.totalRevenue).toBe(2_200_000);
    expect(s.averageLtv).toBe(220_000);
    expect(s.medianLtv).toBe(100_000);
    expect(s.repeatRate).toBe(0.2);
    expect(s.averageOrders).toBeCloseTo(1.6);
    expect(s.topDecileShare).toBeCloseTo(1_000_000 / 2_200_000);
    expect(s.percentiles.p90).toBeGreaterThan(s.percentiles.p75);
  });

  it("counts at least one customer in the top decile", () => {
    expect(summarizeLtv([{ orders: 1, revenue: 500 }, { orders: 1, revenue: 100 }]).topDecileShare).toBeCloseTo(500 / 600);
  });
});
