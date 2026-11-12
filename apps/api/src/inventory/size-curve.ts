/**
 * Size-curve analysis (docs/PROJECT_SPEC.md §8.2 Inventory, §16 M12): how a
 * product's sales split across sizes versus how its stock is split, and how
 * to divide a new buy so the stock mix moves toward the sales mix.
 */

/**
 * Splits an integer `total` across `weights` proportionally, using the
 * largest-remainder method so the parts always sum exactly to `total`
 * (ties go to the earlier index). All-zero weights split evenly.
 */
export function allocateLargestRemainder(weights: number[], total: number): number[] {
  if (weights.length === 0 || total <= 0) return weights.map(() => 0);
  const positive = weights.map((w) => (w > 0 ? w : 0));
  const sum = positive.reduce((a, b) => a + b, 0);
  const effective = sum > 0 ? positive : positive.map(() => 1);
  const effectiveSum = sum > 0 ? sum : effective.length;
  const raw = effective.map((w) => (w / effectiveSum) * total);
  const floors = raw.map((r) => Math.floor(r));
  let remaining = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    floors[i]! += 1;
    remaining -= 1;
  }
  return floors;
}

export interface SizeCurveInput {
  size: string;
  sold: number;
  onHand: number;
}

export interface SizeCurveRow extends SizeCurveInput {
  /** Share of units sold in the window (0–1). */
  soldShare: number;
  /** Share of current on-hand units (0–1). */
  stockShare: number;
  /** stockShare − soldShare: negative = under-stocked relative to demand. */
  gap: number;
  /** Units of this size to include in a buy of `buyQuantity`. */
  suggestedQty: number;
}

/**
 * For a buy of `buyQuantity` units: target each size's post-buy stock at
 * (current total + buy) × its sold share, order the shortfall, and scale the
 * shortfalls to exactly `buyQuantity` (largest remainder). With no sales
 * history the buy splits evenly; if no size is short of target (stock
 * already skewed toward the bestsellers) the buy follows the sales curve.
 */
export function computeSizeCurve(rows: SizeCurveInput[], buyQuantity = 0): SizeCurveRow[] {
  const totalSold = rows.reduce((a, r) => a + Math.max(0, r.sold), 0);
  const totalStock = rows.reduce((a, r) => a + Math.max(0, r.onHand), 0);
  const soldShares = rows.map((r) => (totalSold > 0 ? Math.max(0, r.sold) / totalSold : rows.length > 0 ? 1 / rows.length : 0));

  let suggested = rows.map(() => 0);
  if (buyQuantity > 0 && rows.length > 0) {
    const targetTotal = totalStock + buyQuantity;
    const shortfalls = rows.map((r, i) => Math.max(0, targetTotal * soldShares[i]! - Math.max(0, r.onHand)));
    const anyShort = shortfalls.some((s) => s > 0);
    suggested = allocateLargestRemainder(anyShort ? shortfalls : soldShares, buyQuantity);
  }

  return rows.map((r, i) => {
    const stockShare = totalStock > 0 ? Math.max(0, r.onHand) / totalStock : 0;
    const soldShare = totalSold > 0 ? Math.max(0, r.sold) / totalSold : 0;
    return { ...r, soldShare, stockShare, gap: stockShare - soldShare, suggestedQty: suggested[i]! };
  });
}
