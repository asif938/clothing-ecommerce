/**
 * Pure money/weight arithmetic for order merge and split (docs/PROJECT_SPEC.md
 * §8.2 "Duplicate/merge/split orders", §16 M11). Kept free of Prisma so the
 * rounding rules - the only place money could drift - are unit-tested in
 * isolation. All amounts are integer poisha (golden rule 3).
 */

export interface MergeInputOrder {
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  shippingDiscount: number;
  totalWeightGrams: number;
  paidTotal: number;
}

export interface MergeTotals {
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  shippingDiscount: number;
  total: number;
  codAmount: number;
  totalWeightGrams: number;
}

/**
 * The survivor keeps its own shipping fee/discount: the merged parcel ships
 * once, so the customer pays one delivery charge (the survivor's). Item
 * subtotals, discounts and weight add up.
 */
export function computeMerge(target: MergeInputOrder, sources: MergeInputOrder[]): MergeTotals {
  const all = [target, ...sources];
  const subtotal = all.reduce((sum, o) => sum + o.subtotal, 0);
  const discountTotal = all.reduce((sum, o) => sum + o.discountTotal, 0);
  const totalWeightGrams = all.reduce((sum, o) => sum + o.totalWeightGrams, 0);
  const total = Math.max(0, subtotal - discountTotal + target.shippingFee - target.shippingDiscount);
  return {
    subtotal,
    discountTotal,
    shippingFee: target.shippingFee,
    shippingDiscount: target.shippingDiscount,
    total,
    codAmount: Math.max(0, total - target.paidTotal),
    totalWeightGrams,
  };
}

export interface SplitItem {
  id: string;
  quantity: number;
  unitPrice: number;
  discountAllocated: number;
}

export interface SplitLine {
  orderItemId: string;
  quantity: number;
}

export interface SplitResult {
  moved: { orderItemId: string; quantity: number; wholeRow: boolean; lineTotal: number; discountAllocated: number }[];
  remainingItems: { orderItemId: string; quantity: number; lineTotal: number; discountAllocated: number }[];
  newSubtotal: number;
  newDiscount: number;
  newWeight: number;
  remainingSubtotal: number;
  remainingDiscount: number;
  remainingWeight: number;
}

export class SplitError extends Error {
  constructor(
    readonly code: "NOTHING_TO_SPLIT" | "UNKNOWN_ITEM" | "QUANTITY_TOO_HIGH" | "WOULD_EMPTY_ORDER" | "DUPLICATE_LINE",
    message: string,
  ) {
    super(message);
  }
}

/** Carves `lines` out of an order. The order-level discount follows the subtotal share (rounded), the remainder stays, so the two halves always sum back to the original. */
export function computeSplit(order: { subtotal: number; discountTotal: number; totalWeightGrams: number; items: SplitItem[] }, lines: SplitLine[]): SplitResult {
  if (lines.length === 0 || lines.every((l) => l.quantity <= 0)) throw new SplitError("NOTHING_TO_SPLIT", "Choose at least one item to split off.");
  const byId = new Map(order.items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const movedQty = new Map<string, number>();

  for (const line of lines) {
    if (line.quantity <= 0) continue;
    if (seen.has(line.orderItemId)) throw new SplitError("DUPLICATE_LINE", "An item appears twice in the split.");
    seen.add(line.orderItemId);
    const item = byId.get(line.orderItemId);
    if (!item) throw new SplitError("UNKNOWN_ITEM", "One of the items doesn't belong to this order.");
    if (line.quantity > item.quantity) throw new SplitError("QUANTITY_TOO_HIGH", "Can't move more units than the order has.");
    movedQty.set(item.id, line.quantity);
  }

  const totalUnits = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const movedUnits = [...movedQty.values()].reduce((sum, q) => sum + q, 0);
  if (movedUnits >= totalUnits) throw new SplitError("WOULD_EMPTY_ORDER", "At least one unit must stay on the original order.");

  const moved: SplitResult["moved"] = [];
  const remainingItems: SplitResult["remainingItems"] = [];
  for (const item of order.items) {
    const qty = movedQty.get(item.id) ?? 0;
    const movedDiscount = qty === 0 ? 0 : qty === item.quantity ? item.discountAllocated : Math.round((item.discountAllocated * qty) / item.quantity);
    if (qty > 0) moved.push({ orderItemId: item.id, quantity: qty, wholeRow: qty === item.quantity, lineTotal: item.unitPrice * qty, discountAllocated: movedDiscount });
    const left = item.quantity - qty;
    if (left > 0) remainingItems.push({ orderItemId: item.id, quantity: left, lineTotal: item.unitPrice * left, discountAllocated: item.discountAllocated - movedDiscount });
  }

  const newSubtotal = moved.reduce((sum, m) => sum + m.lineTotal, 0);
  const newDiscount = order.subtotal === 0 ? 0 : Math.min(order.discountTotal, Math.round((order.discountTotal * newSubtotal) / order.subtotal));
  const newWeight = Math.round((order.totalWeightGrams * movedUnits) / totalUnits);
  return {
    moved,
    remainingItems,
    newSubtotal,
    newDiscount,
    newWeight,
    remainingSubtotal: order.subtotal - newSubtotal,
    remainingDiscount: order.discountTotal - newDiscount,
    remainingWeight: order.totalWeightGrams - newWeight,
  };
}
