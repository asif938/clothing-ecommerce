import { describe, expect, it } from "vitest";
import { buildPnl, monthRanges } from "./pnl";

const base = { revenue: 1_000_000, cogs: 400_000, courierCost: 80_000, gatewayFees: 20_000, adSpend: 50_000, expenses: { rent: 100_000, salaries: 200_000 }, countAdSpend: true };

describe("buildPnl", () => {
  it("walks revenue down to net profit", () => {
    const pnl = buildPnl(base);
    expect(pnl.grossProfit).toBe(600_000);
    expect(pnl.contribution).toBe(500_000);
    expect(pnl.operatingExpenses).toBe(300_000);
    expect(pnl.netProfit).toBe(500_000 - 50_000 - 300_000);
    expect(pnl.grossMargin).toBeCloseTo(0.6);
    expect(pnl.netMargin).toBeCloseTo(0.15);
  });

  it("sorts expense categories by size and drops zero lines", () => {
    const pnl = buildPnl({ ...base, expenses: { rent: 100, salaries: 300, utilities: 0, other: 100 } });
    expect(pnl.expensesByCategory.map((e) => e.category)).toEqual(["salaries", "other", "rent"]);
  });

  it("leaves ad spend out when it is already logged as an expense", () => {
    expect(buildPnl({ ...base, countAdSpend: false }).adSpend).toBe(0);
    expect(buildPnl({ ...base, countAdSpend: false }).netProfit).toBe(buildPnl(base).netProfit + 50_000);
  });

  it("reports a loss and null margins with no revenue", () => {
    const pnl = buildPnl({ ...base, revenue: 0, cogs: 0, courierCost: 0, gatewayFees: 0, adSpend: 0, expenses: { rent: 100_000 } });
    expect(pnl.netProfit).toBe(-100_000);
    expect(pnl.netMargin).toBeNull();
    expect(pnl.grossMargin).toBeNull();
  });
});

describe("monthRanges", () => {
  it("returns a single clipped piece inside one month", () => {
    const from = new Date("2026-03-10T00:00:00+06:00");
    const to = new Date("2026-03-20T23:59:59+06:00");
    expect(monthRanges(from, to)).toEqual([{ key: "2026-03", from, to }]);
  });

  it("splits at Dhaka month boundaries, not UTC ones", () => {
    const ranges = monthRanges(new Date("2026-01-15T00:00:00+06:00"), new Date("2026-03-05T12:00:00+06:00"));
    expect(ranges.map((r) => r.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
    // January ends 1 ms before Feb 1 00:00 Dhaka (= Jan 31 18:00 UTC).
    expect(ranges[0]!.to.toISOString()).toBe("2026-01-31T17:59:59.999Z");
    expect(ranges[1]!.from.toISOString()).toBe("2026-01-31T18:00:00.000Z");
    expect(ranges[2]!.to.toISOString()).toBe(new Date("2026-03-05T12:00:00+06:00").toISOString());
  });

  it("crosses a year boundary", () => {
    expect(monthRanges(new Date("2026-12-20T00:00:00+06:00"), new Date("2027-01-10T00:00:00+06:00")).map((r) => r.key)).toEqual(["2026-12", "2027-01"]);
  });

  it("returns nothing for an inverted range", () => {
    expect(monthRanges(new Date("2026-02-01"), new Date("2026-01-01"))).toEqual([]);
  });
});
