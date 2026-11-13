import { REPORT_DATASETS, type ReportConfig, type ReportMetricDef } from "@clothing/shared/analytics";
import { DHAKA_OFFSET_MS } from "../common/dhaka-time";

/**
 * Report builder aggregation (docs/PROJECT_SPEC.md §8.2 Reports "report
 * builder", §16 M17). The service loads flat source rows for a dataset; this
 * filters, groups and sums them according to a validated `ReportConfig`.
 * Pure and integer-only for money (golden rule 3), so every metric formula
 * is unit-tested (golden rule 10).
 */

export const NO_VALUE = "(none)";

/** One order (sales dataset) or one order line (products dataset). */
export interface SourceRow {
  orderId: string;
  /** Dimension key → label, e.g. `{ day: "2026-11-13", channel: "web" }`. */
  dims: Record<string, string>;
  units: number;
  subtotal: number;
  discount: number;
  shipping: number;
  revenue: number;
  cogs: number;
}

export type ReportCell = string | number | null;

export interface ReportResultColumn {
  key: string;
  kind: "dimension" | "metric";
  label: { bn: string; en: string };
  format?: ReportMetricDef["format"];
}

export interface ReportResult {
  columns: ReportResultColumn[];
  rows: Record<string, ReportCell>[];
  /** The same metrics over every matching row, ignoring grouping and the row limit. */
  totals: Record<string, ReportCell>;
  /** Groups beyond `limit` were dropped. */
  truncated: boolean;
  matchedRows: number;
}

interface Accumulator {
  orderIds: Set<string>;
  units: number;
  subtotal: number;
  discount: number;
  shipping: number;
  revenue: number;
  cogs: number;
}

const emptyAccumulator = (): Accumulator => ({ orderIds: new Set(), units: 0, subtotal: 0, discount: 0, shipping: 0, revenue: 0, cogs: 0 });

function add(acc: Accumulator, row: SourceRow) {
  acc.orderIds.add(row.orderId);
  acc.units += row.units;
  acc.subtotal += row.subtotal;
  acc.discount += row.discount;
  acc.shipping += row.shipping;
  acc.revenue += row.revenue;
  acc.cogs += row.cogs;
}

const ratio = (numerator: number, denominator: number): number | null => (denominator > 0 ? numerator / denominator : null);
const rounded = (numerator: number, denominator: number): number | null => (denominator > 0 ? Math.round(numerator / denominator) : null);

export function metricValue(key: string, acc: Accumulator): ReportCell {
  const orders = acc.orderIds.size;
  switch (key) {
    case "orders":
      return orders;
    case "units":
      return acc.units;
    case "subtotal":
      return acc.subtotal;
    case "discount":
      return acc.discount;
    case "shipping":
      return acc.shipping;
    case "revenue":
      return acc.revenue;
    case "cogs":
      return acc.cogs;
    case "aov":
      return rounded(acc.revenue, orders);
    case "discountRate":
      return ratio(acc.discount, acc.subtotal);
    case "grossProfit":
      return acc.revenue - acc.cogs;
    case "grossMargin":
      return ratio(acc.revenue - acc.cogs, acc.revenue);
    case "avgPrice":
      return rounded(acc.revenue, acc.units);
    default:
      return null;
  }
}

function matchesFilters(row: SourceRow, filters: ReportConfig["filters"]): boolean {
  return filters.every((filter) => {
    const value = row.dims[filter.field] ?? NO_VALUE;
    const hit = filter.values.includes(value);
    return filter.op === "neq" ? !hit : hit;
  });
}

/** Compares two cells in the given direction; nulls always sort last, whichever way the column is ordered. */
function compareCells(a: ReportCell, b: ReportCell, direction: "asc" | "desc"): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const order = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
  return direction === "asc" ? order : -order;
}

export function aggregate(rows: SourceRow[], config: ReportConfig): ReportResult {
  const dataset = REPORT_DATASETS[config.dataset];
  const matched = rows.filter((row) => matchesFilters(row, config.filters));

  const groups = new Map<string, { dims: string[]; acc: Accumulator }>();
  const grand = emptyAccumulator();
  for (const row of matched) {
    add(grand, row);
    const dims = config.dimensions.map((d) => row.dims[d] ?? NO_VALUE);
    const key = JSON.stringify(dims);
    const group = groups.get(key) ?? { dims, acc: emptyAccumulator() };
    add(group.acc, row);
    groups.set(key, group);
  }

  const out: Record<string, ReportCell>[] = [...groups.values()].map((g) => {
    const record: Record<string, ReportCell> = {};
    config.dimensions.forEach((d, i) => (record[d] = g.dims[i]!));
    for (const m of config.metrics) record[m] = metricValue(m, g.acc);
    return record;
  });

  if (config.sort) {
    const { key, direction } = config.sort;
    out.sort((a, b) => compareCells(a[key] ?? null, b[key] ?? null, direction));
  } else if (config.dimensions.length > 0) {
    // Chronological / alphabetical by every dimension in turn.
    out.sort((a, b) => {
      for (const d of config.dimensions) {
        const c = compareCells(a[d] ?? null, b[d] ?? null, "asc");
        if (c !== 0) return c;
      }
      return 0;
    });
  } else {
    const first = config.metrics[0]!;
    out.sort((a, b) => compareCells(a[first] ?? null, b[first] ?? null, "desc"));
  }

  const totals: Record<string, ReportCell> = {};
  for (const m of config.metrics) totals[m] = metricValue(m, grand);

  const columns: ReportResultColumn[] = [
    ...config.dimensions.map((d) => ({ key: d, kind: "dimension" as const, label: dataset.dimensions.find((x) => x.key === d)!.label })),
    ...config.metrics.map((m) => {
      const def = dataset.metrics.find((x) => x.key === m)!;
      return { key: m, kind: "metric" as const, label: def.label, format: def.format };
    }),
  ];

  return { columns, rows: out.slice(0, config.limit), totals, truncated: out.length > config.limit, matchedRows: matched.length };
}

/** `YYYY-MM-DD` of the Monday that starts the Dhaka-local week containing `date`. */
export function weekStartKey(date: Date): string {
  const shifted = new Date(date.getTime() + DHAKA_OFFSET_MS);
  const sinceMonday = (shifted.getUTCDay() + 6) % 7;
  shifted.setUTCDate(shifted.getUTCDate() - sinceMonday);
  return shifted.toISOString().slice(0, 10);
}
