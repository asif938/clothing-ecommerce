/**
 * Discount evaluation (docs/PROJECT_SPEC.md §5.8, §6.1, §6.3 steps 3-4) —
 * pure functions, unit-tested. `combinable_with`'s full generality
 * ("other discounts / codes / automatic") is simplified here to two flags,
 * `automatic`/`codes` — "can this discount coexist with another applied
 * automatic / code discount" — rather than a per-discount-pair matrix; see
 * docs/DECISIONS.md.
 */

export interface DiscountLine {
  variantId: string;
  productId: string;
  categoryIds: string[];
  tags: string[];
  quantity: number;
  lineTotal: number;
}

export interface DiscountConditions {
  minSubtotal?: number;
  minQty?: number;
  includeCategoryIds?: string[];
  excludeCategoryIds?: string[];
  includeProductIds?: string[];
  excludeProductIds?: string[];
  includeTags?: string[];
  excludeTags?: string[];
  firstOrderOnly?: boolean;
  channels?: string[];
}

export interface DiscountContext {
  subtotal: number;
  totalQty: number;
  isFirstOrder: boolean;
  channel: string;
}

export interface CombinableWith {
  automatic?: boolean;
  codes?: boolean;
}

export function lineIsEligible(line: DiscountLine, conditions: DiscountConditions): boolean {
  if (conditions.includeCategoryIds?.length && !line.categoryIds.some((id) => conditions.includeCategoryIds!.includes(id))) return false;
  if (conditions.excludeCategoryIds?.length && line.categoryIds.some((id) => conditions.excludeCategoryIds!.includes(id))) return false;
  if (conditions.includeProductIds?.length && !conditions.includeProductIds.includes(line.productId)) return false;
  if (conditions.excludeProductIds?.length && conditions.excludeProductIds.includes(line.productId)) return false;
  if (conditions.includeTags?.length && !line.tags.some((tag) => conditions.includeTags!.includes(tag))) return false;
  if (conditions.excludeTags?.length && line.tags.some((tag) => conditions.excludeTags!.includes(tag))) return false;
  return true;
}

export function conditionsMatchCart(conditions: DiscountConditions, context: DiscountContext): boolean {
  if (conditions.minSubtotal !== undefined && context.subtotal < conditions.minSubtotal) return false;
  if (conditions.minQty !== undefined && context.totalQty < conditions.minQty) return false;
  if (conditions.firstOrderOnly && !context.isFirstOrder) return false;
  if (conditions.channels?.length && !conditions.channels.includes(context.channel)) return false;
  return true;
}

export function eligibleSubtotal(lines: DiscountLine[], conditions: DiscountConditions): number {
  return lines.filter((line) => lineIsEligible(line, conditions)).reduce((sum, line) => sum + line.lineTotal, 0);
}

/** §6.1: percentage discounts round down to the nearest poisha per line; fixed amounts are capped at the eligible subtotal (can't discount below zero). */
export function computeDiscountAmount(valueType: "percent" | "fixed" | "free_shipping", value: number, eligibleAmount: number): number {
  if (valueType === "free_shipping") return 0;
  if (valueType === "percent") return Math.floor((eligibleAmount * value) / 100);
  return Math.min(value, eligibleAmount);
}

/** §6.1: "allocated proportionally to line value; the last line absorbs remainder poisha so allocations sum exactly." */
export function allocateProportionally(amount: number, lines: DiscountLine[]): Map<string, number> {
  const allocations = new Map<string, number>();
  const eligible = lines.filter((line) => line.lineTotal > 0);
  const basis = eligible.reduce((sum, line) => sum + line.lineTotal, 0);
  if (basis <= 0 || amount <= 0) return allocations;

  let allocated = 0;
  eligible.forEach((line, index) => {
    const isLast = index === eligible.length - 1;
    const share = isLast ? amount - allocated : Math.floor((amount * line.lineTotal) / basis);
    allocations.set(line.variantId, share);
    allocated += share;
  });
  return allocations;
}

/** Can `candidate` be applied together with the discounts already applied in `appliedTypes`? Each side must agree to coexist with the other's type (symmetric). */
export function canCombine(candidateType: "automatic" | "code", candidateCombinable: CombinableWith, appliedTypes: { type: "automatic" | "code"; combinable: CombinableWith }[]): boolean {
  const key = (type: "automatic" | "code"): keyof CombinableWith => (type === "automatic" ? "automatic" : "codes");
  for (const applied of appliedTypes) {
    const candidateAllowsApplied = candidateCombinable[key(applied.type)] !== false;
    const appliedAllowsCandidate = applied.combinable[key(candidateType)] !== false;
    if (!candidateAllowsApplied || !appliedAllowsCandidate) return false;
  }
  return true;
}

export interface MarginGuardLine {
  variantId: string;
  costPrice: number | null;
  unitPrice: number;
  quantity: number;
  allocatedDiscount: number;
}

/** §6.3 step 5: blocks a discount allocation on a line (or the whole discount, per setting) when the net price would fall below cost × (1 + minMargin%). */
export function violatesMarginGuard(line: MarginGuardLine, minMarginPercent: number): boolean {
  if (line.costPrice === null) return false;
  const lineRevenue = line.unitPrice * line.quantity - line.allocatedDiscount;
  const minAcceptable = Math.ceil(line.costPrice * line.quantity * (1 + minMarginPercent / 100));
  return lineRevenue < minAcceptable;
}
