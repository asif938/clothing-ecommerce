import { describe, expect, it } from "vitest";
import { reportConfigSchema, validateReportConfig, type ReportConfig } from "@clothing/shared/analytics";
import { aggregate, weekStartKey, type SourceRow } from "./report-builder";

function row(orderId: string, dims: Record<string, string>, over: Partial<SourceRow> = {}): SourceRow {
  return { orderId, dims, units: 1, subtotal: 100_000, discount: 0, shipping: 6_000, revenue: 106_000, cogs: 0, ...over };
}

const config = (over: Partial<ReportConfig>): ReportConfig => reportConfigSchema.parse({ dataset: "sales", dimensions: [], metrics: ["orders"], ...over });

const sales: SourceRow[] = [
  row("o1", { day: "2026-11-01", channel: "web" }, { units: 2, subtotal: 200_000, discount: 20_000, revenue: 186_000 }),
  row("o2", { day: "2026-11-01", channel: "phone" }),
  row("o3", { day: "2026-11-02", channel: "web" }, { revenue: 106_000 }),
];

describe("aggregate", () => {
  it("groups by a dimension and sums the metrics", () => {
    const r = aggregate(sales, config({ dimensions: ["channel"], metrics: ["orders", "units", "revenue"] }));
    expect(r.rows).toEqual([
      { channel: "phone", orders: 1, units: 1, revenue: 106_000 },
      { channel: "web", orders: 2, units: 3, revenue: 292_000 },
    ]);
    expect(r.totals).toEqual({ orders: 3, units: 4, revenue: 398_000 });
  });

  it("derives average order value and discount rate", () => {
    const r = aggregate(sales, config({ dimensions: ["channel"], metrics: ["aov", "discountRate"], sort: { key: "channel", direction: "desc" } }));
    expect(r.rows[0]).toEqual({ channel: "web", aov: 146_000, discountRate: 20_000 / 300_000 });
  });

  it("supports two dimensions", () => {
    const r = aggregate(sales, config({ dimensions: ["day", "channel"], metrics: ["orders"] }));
    expect(r.rows.map((x) => `${x.day}/${x.channel}/${x.orders}`)).toEqual(["2026-11-01/phone/1", "2026-11-01/web/1", "2026-11-02/web/1"]);
  });

  it("filters with eq, neq and in", () => {
    const eq = aggregate(sales, config({ filters: [{ field: "channel", op: "eq", values: ["web"] }] }));
    expect(eq.totals.orders).toBe(2);
    const neq = aggregate(sales, config({ filters: [{ field: "channel", op: "neq", values: ["web"] }] }));
    expect(neq.totals.orders).toBe(1);
    const inn = aggregate(sales, config({ filters: [{ field: "day", op: "in", values: ["2026-11-02", "2026-11-09"] }] }));
    expect(inn.totals.orders).toBe(1);
    expect(inn.matchedRows).toBe(1);
  });

  it("treats a missing dimension value as (none)", () => {
    const r = aggregate([row("o1", {})], config({ dimensions: ["source"], metrics: ["orders"] }));
    expect(r.rows).toEqual([{ source: "(none)", orders: 1 }]);
  });

  it("sorts by a metric and applies the limit, keeping totals over everything", () => {
    const r = aggregate(sales, config({ dimensions: ["day"], metrics: ["revenue"], sort: { key: "revenue", direction: "desc" }, limit: 1 }));
    expect(r.rows).toEqual([{ day: "2026-11-01", revenue: 292_000 }]);
    expect(r.truncated).toBe(true);
    expect(r.totals.revenue).toBe(398_000);
  });

  it("defaults to chronological order for a day dimension and biggest-first without one", () => {
    expect(aggregate([...sales].reverse(), config({ dimensions: ["day"] })).rows.map((x) => x.day)).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("gives null for ratios with no denominator and sorts them last", () => {
    const lines: SourceRow[] = [
      row("o1", { product: "A" }, { units: 0, revenue: 0, cogs: 0 }),
      row("o2", { product: "B" }, { units: 2, revenue: 200_000, cogs: 80_000 }),
    ];
    const r = aggregate(lines, config({ dataset: "products", dimensions: ["product"], metrics: ["grossMargin", "avgPrice"], sort: { key: "grossMargin", direction: "desc" } }));
    expect(r.rows).toEqual([
      { product: "B", grossMargin: 0.6, avgPrice: 100_000 },
      { product: "A", grossMargin: null, avgPrice: null },
    ]);
  });

  it("counts distinct orders across the lines of a products report", () => {
    const lines: SourceRow[] = [row("o1", { product: "A" }), row("o1", { product: "A" }), row("o2", { product: "A" })];
    const r = aggregate(lines, config({ dataset: "products", dimensions: ["product"], metrics: ["orders", "units"] }));
    expect(r.rows).toEqual([{ product: "A", orders: 2, units: 3 }]);
  });

  it("labels the columns from the dataset", () => {
    const r = aggregate(sales, config({ dimensions: ["day"], metrics: ["revenue"] }));
    expect(r.columns).toEqual([
      { key: "day", kind: "dimension", label: { bn: "দিন", en: "Day" } },
      { key: "revenue", kind: "metric", label: { bn: "মোট (রেভিনিউ)", en: "Revenue (total)" }, format: "money" },
    ]);
  });
});

describe("weekStartKey", () => {
  it("returns the Monday of the Dhaka-local week", () => {
    expect(weekStartKey(new Date("2026-11-13T10:00:00+06:00"))).toBe("2026-11-09"); // Friday
    expect(weekStartKey(new Date("2026-11-09T00:30:00+06:00"))).toBe("2026-11-09"); // Monday, just after midnight Dhaka
    expect(weekStartKey(new Date("2026-11-08T23:30:00+06:00"))).toBe("2026-11-02"); // Sunday
  });
});

describe("validateReportConfig", () => {
  it("accepts a good config and names the first problem in a bad one", () => {
    expect(validateReportConfig(config({ dimensions: ["day"], metrics: ["revenue"] }))).toBeNull();
    expect(validateReportConfig(config({ dimensions: ["product"] }))).toMatch(/Unknown dimension/);
    expect(validateReportConfig(config({ metrics: ["grossProfit"] }))).toMatch(/Unknown metric/);
    expect(validateReportConfig(config({ filters: [{ field: "revenue", op: "eq", values: ["1"] }] }))).toMatch(/Can't filter/);
    expect(validateReportConfig(config({ sort: { key: "nope", direction: "asc" } }))).toMatch(/Can't sort/);
    expect(validateReportConfig(config({ dimensions: ["day", "day"] }))).toMatch(/once/);
  });
});
