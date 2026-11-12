import type { PurchaseOrderStatus } from "@clothing/db";

/**
 * Pure stock/procurement rules for M12 (docs/PROJECT_SPEC.md §16 M12),
 * kept free of Prisma so they're unit-tested directly (golden rule 10).
 * All money is integer poisha (golden rule 3).
 */

/**
 * Moving weighted-average cost after receiving `receivedQty` units at
 * `unitCost`. Stock already on hand with no known cost (or nothing on hand)
 * contributes nothing — the received cost simply becomes the cost. Rounded
 * to the nearest poisha.
 */
export function weightedAverageCost(onHandBefore: number, currentCost: number | null, receivedQty: number, unitCost: number): number {
  if (receivedQty <= 0) return currentCost ?? unitCost;
  if (currentCost === null || onHandBefore <= 0) return unitCost;
  return Math.round((onHandBefore * currentCost + receivedQty * unitCost) / (onHandBefore + receivedQty));
}

export function nextCostPrice(
  method: "weighted_average" | "last_cost" | "none",
  onHandBefore: number,
  currentCost: number | null,
  receivedQty: number,
  unitCost: number,
): number | null {
  if (method === "none") return currentCost;
  if (method === "last_cost") return unitCost;
  return weightedAverageCost(onHandBefore, currentCost, receivedQty, unitCost);
}

/** A purchase order's status after a receipt: fully received, partially, or still just sent. */
export function purchaseOrderStatusAfterReceive(items: { qtyOrdered: number; qtyReceived: number }[]): PurchaseOrderStatus {
  if (items.length > 0 && items.every((item) => item.qtyReceived >= item.qtyOrdered)) return "received";
  if (items.some((item) => item.qtyReceived > 0)) return "partially_received";
  return "sent";
}

/**
 * Stock-take adjustment for one line. The count is compared with the
 * on-hand *snapshot taken when counting started* (`expected`), and only the
 * difference is applied to the current on-hand — so units sold (or
 * received) while staff were counting aren't silently undone. Never takes
 * on-hand below zero.
 */
export function stockTakeAdjustment(expected: number, counted: number, currentOnHand: number): { variance: number; delta: number; newOnHand: number } {
  const variance = counted - expected;
  const delta = currentOnHand + variance < 0 ? -currentOnHand : variance;
  return { variance, delta, newOnHand: currentOnHand + delta };
}

export interface StockTakeVarianceSummary {
  linesCounted: number;
  linesUncounted: number;
  linesWithVariance: number;
  unitsOver: number;
  unitsShort: number;
  /** Σ variance × cost (poisha); lines with no cost price are skipped and counted in `uncostedLines`. */
  valueVariance: number;
  uncostedLines: number;
}

export function summarizeStockTake(lines: { expectedQty: number; countedQty: number | null; costPrice: number | null }[]): StockTakeVarianceSummary {
  const summary: StockTakeVarianceSummary = { linesCounted: 0, linesUncounted: 0, linesWithVariance: 0, unitsOver: 0, unitsShort: 0, valueVariance: 0, uncostedLines: 0 };
  for (const line of lines) {
    if (line.countedQty === null) {
      summary.linesUncounted += 1;
      continue;
    }
    summary.linesCounted += 1;
    const variance = line.countedQty - line.expectedQty;
    if (variance === 0) continue;
    summary.linesWithVariance += 1;
    if (variance > 0) summary.unitsOver += variance;
    else summary.unitsShort += -variance;
    if (line.costPrice === null) summary.uncostedLines += 1;
    else summary.valueVariance += variance * line.costPrice;
  }
  return summary;
}
