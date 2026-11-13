/**
 * Cohort retention and customer lifetime value (docs/PROJECT_SPEC.md §8.2
 * Reports "cohort/LTV", §16 M17). Pure: the service aggregates in SQL, this
 * shapes the rows into a retention matrix and summarises the LTV spread, so
 * the maths is unit-tested (golden rule 10). Money is integer poisha.
 *
 * A *cohort* is the Dhaka calendar month of a customer's first realized
 * order (delivered / partially delivered / completed — the same "sold"
 * definition as the true-profit report). Cohorts are tracked by month
 * offset: offset 0 is the acquisition month itself.
 */

/** `YYYY-MM` → a single integer so month differences are plain subtraction. */
export function monthIndex(key: string): number {
  const [year, month] = key.split("-").map(Number) as [number, number];
  return year * 12 + (month - 1);
}

export function monthKeyFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** One SQL aggregate row: customers of `cohort` that ordered in `month`. */
export interface CohortActivityRow {
  cohort: string;
  month: string;
  customers: number;
  orders: number;
  revenue: number;
}

export interface CohortRow {
  cohort: string;
  /** Customers acquired in the cohort month. */
  size: number;
  /** Share of the cohort that ordered in month +k; null when month +k hasn't started yet. */
  retention: (number | null)[];
  /** Cumulative revenue per acquired customer through month +k, poisha; null when not reached. */
  ltv: (number | null)[];
  totalRevenue: number;
}

/**
 * Builds the matrix. `currentMonth` (`YYYY-MM`, Dhaka) is the latest month
 * with data — offsets beyond it are `null`, not zero, so a young cohort
 * doesn't look like it churned. `maxOffset` caps the columns.
 */
export function buildCohortMatrix(rows: CohortActivityRow[], currentMonth: string, maxOffset: number): CohortRow[] {
  const nowIndex = monthIndex(currentMonth);
  const byCohort = new Map<string, CohortActivityRow[]>();
  for (const row of rows) byCohort.set(row.cohort, [...(byCohort.get(row.cohort) ?? []), row]);

  const cohorts: CohortRow[] = [];
  for (const [cohort, activity] of byCohort) {
    const start = monthIndex(cohort);
    // Everyone's first order falls in their cohort month, so the offset-0 customer count is the cohort size.
    const size = activity.find((a) => monthIndex(a.month) === start)?.customers ?? 0;
    if (size === 0) continue;
    const customersAt = new Map<number, number>();
    const revenueAt = new Map<number, number>();
    for (const a of activity) {
      const offset = monthIndex(a.month) - start;
      if (offset < 0) continue;
      customersAt.set(offset, (customersAt.get(offset) ?? 0) + a.customers);
      revenueAt.set(offset, (revenueAt.get(offset) ?? 0) + a.revenue);
    }
    const retention: (number | null)[] = [];
    const ltv: (number | null)[] = [];
    let cumulative = 0;
    for (let offset = 0; offset <= maxOffset; offset++) {
      if (start + offset > nowIndex) {
        retention.push(null);
        ltv.push(null);
        continue;
      }
      cumulative += revenueAt.get(offset) ?? 0;
      retention.push((customersAt.get(offset) ?? 0) / size);
      ltv.push(Math.round(cumulative / size));
    }
    cohorts.push({ cohort, size, retention, ltv, totalRevenue: cumulative });
  }
  return cohorts.sort((a, b) => a.cohort.localeCompare(b.cohort));
}

export interface CustomerValueInput {
  orders: number;
  /** Realized revenue net of refunds, poisha. */
  revenue: number;
}

export interface LtvSummary {
  customers: number;
  totalRevenue: number;
  averageLtv: number;
  medianLtv: number;
  averageOrders: number;
  /** Share of customers with 2+ orders. */
  repeatRate: number | null;
  /** Share of all revenue from the top 10% of customers. */
  topDecileShare: number | null;
  /** Revenue per customer at the 25th/75th/90th percentile. */
  percentiles: { p25: number; p75: number; p90: number };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  return Math.round(sortedAsc[lower]! + (sortedAsc[upper]! - sortedAsc[lower]!) * (rank - lower));
}

export function summarizeLtv(customers: CustomerValueInput[]): LtvSummary {
  if (customers.length === 0) {
    return { customers: 0, totalRevenue: 0, averageLtv: 0, medianLtv: 0, averageOrders: 0, repeatRate: null, topDecileShare: null, percentiles: { p25: 0, p75: 0, p90: 0 } };
  }
  const revenues = customers.map((c) => c.revenue).sort((a, b) => a - b);
  const totalRevenue = revenues.reduce((a, b) => a + b, 0);
  const topCount = Math.max(1, Math.ceil(customers.length * 0.1));
  const topRevenue = revenues.slice(-topCount).reduce((a, b) => a + b, 0);
  return {
    customers: customers.length,
    totalRevenue,
    averageLtv: Math.round(totalRevenue / customers.length),
    medianLtv: percentile(revenues, 50),
    averageOrders: customers.reduce((a, c) => a + c.orders, 0) / customers.length,
    repeatRate: customers.filter((c) => c.orders >= 2).length / customers.length,
    topDecileShare: totalRevenue > 0 ? topRevenue / totalRevenue : null,
    percentiles: { p25: percentile(revenues, 25), p75: percentile(revenues, 75), p90: percentile(revenues, 90) },
  };
}
