import { DHAKA_OFFSET_MS } from "../common/dhaka-time";

/**
 * Profit & loss statement (docs/PROJECT_SPEC.md §8.2 Finance "profit & loss
 * summary", §16 M17). Pure, integer poisha only (golden rule 3).
 *
 * It builds on the true-profit report (M12), which already nets refunds and
 * door rejections out of revenue and counts COGS, courier charges and
 * gateway fees per delivered order. The P&L adds what that report can't see:
 * imported ad spend and the shop's recorded operating expenses.
 *
 *   gross profit      = revenue − COGS
 *   contribution      = gross profit − courier − gateway fees
 *   net profit        = contribution − ad spend − operating expenses
 */

export interface PnlInputs {
  revenue: number;
  cogs: number;
  courierCost: number;
  gatewayFees: number;
  adSpend: number;
  /** Operating expenses by category key, poisha. */
  expenses: Record<string, number>;
  /** False when ad spend is already logged as expenses (avoids counting it twice). */
  countAdSpend: boolean;
}

export interface PnlStatement {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number | null;
  courierCost: number;
  gatewayFees: number;
  contribution: number;
  adSpend: number;
  operatingExpenses: number;
  expensesByCategory: { category: string; amount: number }[];
  netProfit: number;
  netMargin: number | null;
}

export function buildPnl(input: PnlInputs): PnlStatement {
  const grossProfit = input.revenue - input.cogs;
  const contribution = grossProfit - input.courierCost - input.gatewayFees;
  const adSpend = input.countAdSpend ? input.adSpend : 0;
  const expensesByCategory = Object.entries(input.expenses)
    .map(([category, amount]) => ({ category, amount }))
    .filter((e) => e.amount !== 0)
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
  const operatingExpenses = expensesByCategory.reduce((a, e) => a + e.amount, 0);
  const netProfit = contribution - adSpend - operatingExpenses;
  return {
    revenue: input.revenue,
    cogs: input.cogs,
    grossProfit,
    grossMargin: input.revenue > 0 ? grossProfit / input.revenue : null,
    courierCost: input.courierCost,
    gatewayFees: input.gatewayFees,
    contribution,
    adSpend,
    operatingExpenses,
    expensesByCategory,
    netProfit,
    netMargin: input.revenue > 0 ? netProfit / input.revenue : null,
  };
}

export interface MonthRange {
  /** `YYYY-MM` (Dhaka calendar). */
  key: string;
  from: Date;
  to: Date;
}

/**
 * Splits [from, to] into Dhaka calendar months, clipping the first and last
 * to the requested range. `to` of every piece is the last millisecond
 * before the next month (or the range end).
 */
export function monthRanges(from: Date, to: Date): MonthRange[] {
  if (to < from) return [];
  const ranges: MonthRange[] = [];
  const start = new Date(from.getTime() + DHAKA_OFFSET_MS);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  for (;;) {
    const monthStart = new Date(Date.UTC(year, month, 1) - DHAKA_OFFSET_MS);
    const nextStart = new Date(Date.UTC(year, month + 1, 1) - DHAKA_OFFSET_MS);
    ranges.push({
      key: `${year}-${String(month + 1).padStart(2, "0")}`,
      from: monthStart < from ? from : monthStart,
      to: new Date(Math.min(nextStart.getTime() - 1, to.getTime())),
    });
    if (nextStart > to) break;
    year = month === 11 ? year + 1 : year;
    month = month === 11 ? 0 : month + 1;
  }
  return ranges;
}
