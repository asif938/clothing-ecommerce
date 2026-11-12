import type { OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus } from "@clothing/db";

/**
 * True profit per order (docs/PROJECT_SPEC.md §8.2 Reports "profit (6.1
 * costs incl. courier charges, gateway fees, ad spend when imported,
 * returns)", §16 M12). Pure — the service loads rows, this does the maths,
 * so every rule here is unit-tested (golden rule 10). Integer poisha only.
 *
 * Only orders with a *final delivery outcome* are counted — delivered /
 * partially delivered / completed ("sold"), or rejected at the door /
 * returned to sender ("failed delivery"). Orders still in the pipeline
 * have no realized profit yet; the report counts them separately.
 */

export const SOLD_STATUSES: OrderStatus[] = ["delivered", "partially_delivered", "completed"];
export const FAILED_DELIVERY_STATUSES: OrderStatus[] = ["rejected_at_door", "returned_to_sender", "returned_to_warehouse"];
const NON_GATEWAY_METHODS: PaymentMethod[] = ["cod", "store_credit"];

export interface ProfitOrderInput {
  status: OrderStatus;
  total: number;
  shippingFee: number;
  paidTotal: number;
  refundedTotal: number;
  /** Refunds still pending/processing — counted as money going back out. */
  refundsOutstanding: number;
  items: { quantity: number; lineTotal: number; costPrice: number | null; rejectedQty: number; returnedQty: number }[];
  shipments: { status: ShipmentStatus; deliveryChargeActual: number | null; deliveryFeeCollected: number | null }[];
  payments: { method: PaymentMethod; status: PaymentStatus; amount: number }[];
}

export interface OrderProfit {
  outcome: "sold" | "failed_delivery";
  revenue: number;
  cogs: number;
  courierCost: number;
  gatewayFees: number;
  refunds: number;
  profit: number;
  /** Units sold with no cost price on the order line — COGS is understated by these. */
  uncostedUnits: number;
  /** At least one shipment had no actual courier charge recorded; its cost was estimated from the shipping fee. */
  courierEstimated: boolean;
  gatewayFeesByMethod: Partial<Record<PaymentMethod, number>>;
}

export function isProfitEligible(status: OrderStatus): boolean {
  return SOLD_STATUSES.includes(status) || FAILED_DELIVERY_STATUSES.includes(status);
}

function proRata(lineTotal: number, part: number, quantity: number): number {
  if (quantity <= 0 || part <= 0) return 0;
  return Math.round((lineTotal * Math.min(part, quantity)) / quantity);
}

export function gatewayFee(amount: number, bps: number): number {
  return Math.round((amount * bps) / 10_000);
}

export function computeOrderProfit(order: ProfitOrderInput, gatewayFeeBps: Record<string, number>): OrderProfit | null {
  if (!isProfitEligible(order.status)) return null;
  const outcome: OrderProfit["outcome"] = SOLD_STATUSES.includes(order.status) ? "sold" : "failed_delivery";
  const refunds = order.refundedTotal + order.refundsOutstanding;

  let revenue: number;
  let cogs = 0;
  let uncostedUnits = 0;
  if (outcome === "sold") {
    const rejectedValue = order.items.reduce((sum, item) => sum + proRata(item.lineTotal, item.rejectedQty, item.quantity), 0);
    revenue = order.total - rejectedValue - refunds;
    for (const item of order.items) {
      const keptUnits = Math.max(0, item.quantity - item.rejectedQty - item.returnedQty);
      if (keptUnits === 0) continue;
      if (item.costPrice === null) uncostedUnits += keptUnits;
      else cogs += item.costPrice * keptUnits;
    }
  } else {
    // Goods came back to stock: no COGS. What we keep is any advance not
    // refunded plus whatever delivery fee the courier collected at the door.
    const doorFees = order.shipments.reduce((sum, s) => sum + (s.deliveryFeeCollected ?? 0), 0);
    revenue = Math.max(0, order.paidTotal - refunds) + doorFees;
  }

  const billable = order.shipments.filter((s) => s.status !== "cancelled" && s.status !== "pending");
  let courierEstimated = false;
  let courierCost = 0;
  for (const shipment of billable) {
    if (shipment.deliveryChargeActual !== null) {
      courierCost += shipment.deliveryChargeActual;
    } else {
      courierEstimated = true;
      courierCost += Math.round(order.shippingFee / billable.length);
    }
  }

  const gatewayFeesByMethod: Partial<Record<PaymentMethod, number>> = {};
  let gatewayFees = 0;
  for (const payment of order.payments) {
    if (payment.status !== "succeeded" || NON_GATEWAY_METHODS.includes(payment.method)) continue;
    const fee = gatewayFee(payment.amount, gatewayFeeBps[payment.method] ?? 0);
    gatewayFeesByMethod[payment.method] = (gatewayFeesByMethod[payment.method] ?? 0) + fee;
    gatewayFees += fee;
  }

  return {
    outcome,
    revenue,
    cogs,
    courierCost,
    gatewayFees,
    refunds,
    profit: revenue - cogs - courierCost - gatewayFees,
    uncostedUnits,
    courierEstimated,
    gatewayFeesByMethod,
  };
}

export interface ProfitSummary {
  orders: number;
  soldOrders: number;
  failedDeliveries: number;
  revenue: number;
  cogs: number;
  courierCost: number;
  gatewayFees: number;
  /** Ad spend is imported in M13; always 0 until then. */
  adSpend: number;
  refunds: number;
  profit: number;
  margin: number | null;
  uncostedUnits: number;
  courierEstimatedOrders: number;
  /** Methods whose fees came from recorded gateway settlements instead of the bps estimate. */
  gatewayFeesFromSettlements: PaymentMethod[];
}

/**
 * Totals across orders. Where staff have recorded gateway settlements that
 * fall inside the report range, the *recorded* fees for that method replace
 * the per-order estimates (the settlement is what the gateway actually
 * deducted).
 */
export function summarizeProfit(rows: OrderProfit[], recordedGatewayFees: Partial<Record<PaymentMethod, number>>, adSpend = 0): ProfitSummary {
  const estimatedByMethod: Partial<Record<PaymentMethod, number>> = {};
  const summary: ProfitSummary = {
    orders: rows.length,
    soldOrders: 0,
    failedDeliveries: 0,
    revenue: 0,
    cogs: 0,
    courierCost: 0,
    gatewayFees: 0,
    adSpend,
    refunds: 0,
    profit: 0,
    margin: null,
    uncostedUnits: 0,
    courierEstimatedOrders: 0,
    gatewayFeesFromSettlements: [],
  };
  for (const row of rows) {
    if (row.outcome === "sold") summary.soldOrders += 1;
    else summary.failedDeliveries += 1;
    summary.revenue += row.revenue;
    summary.cogs += row.cogs;
    summary.courierCost += row.courierCost;
    summary.refunds += row.refunds;
    summary.uncostedUnits += row.uncostedUnits;
    if (row.courierEstimated) summary.courierEstimatedOrders += 1;
    for (const [method, fee] of Object.entries(row.gatewayFeesByMethod) as [PaymentMethod, number][]) {
      estimatedByMethod[method] = (estimatedByMethod[method] ?? 0) + fee;
    }
  }
  const methods = new Set<PaymentMethod>([...(Object.keys(estimatedByMethod) as PaymentMethod[]), ...(Object.keys(recordedGatewayFees) as PaymentMethod[])]);
  for (const method of methods) {
    const recorded = recordedGatewayFees[method];
    if (recorded !== undefined) {
      summary.gatewayFees += recorded;
      summary.gatewayFeesFromSettlements.push(method);
    } else {
      summary.gatewayFees += estimatedByMethod[method] ?? 0;
    }
  }
  summary.profit = summary.revenue - summary.cogs - summary.courierCost - summary.gatewayFees - summary.adSpend;
  summary.margin = summary.revenue > 0 ? summary.profit / summary.revenue : null;
  return summary;
}
