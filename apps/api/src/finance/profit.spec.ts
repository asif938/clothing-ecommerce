import { describe, expect, it } from "vitest";
import { computeOrderProfit, gatewayFee, summarizeProfit, type ProfitOrderInput } from "./profit";

const bps = { sslcommerz: 250, bkash: 185, mock: 0 };

function order(overrides: Partial<ProfitOrderInput> = {}): ProfitOrderInput {
  return {
    status: "delivered",
    total: 207_000, // 2 × ৳1,000 goods + ৳70 shipping
    shippingFee: 7_000,
    paidTotal: 0,
    refundedTotal: 0,
    refundsOutstanding: 0,
    items: [{ quantity: 2, lineTotal: 200_000, costPrice: 55_000, rejectedQty: 0, returnedQty: 0 }],
    shipments: [{ status: "delivered", deliveryChargeActual: 6_000, deliveryFeeCollected: null }],
    payments: [{ method: "cod", status: "succeeded", amount: 207_000 }],
    ...overrides,
  };
}

describe("computeOrderProfit", () => {
  it("ignores orders without a final delivery outcome", () => {
    expect(computeOrderProfit(order({ status: "shipped" }), bps)).toBeNull();
    expect(computeOrderProfit(order({ status: "cancelled" }), bps)).toBeNull();
  });

  it("delivered COD order: revenue − COGS − courier charge", () => {
    expect(computeOrderProfit(order(), bps)).toMatchObject({ outcome: "sold", revenue: 207_000, cogs: 110_000, courierCost: 6_000, gatewayFees: 0, profit: 91_000, courierEstimated: false });
  });

  it("charges gateway fees on succeeded online payments only", () => {
    const p = computeOrderProfit(
      order({
        payments: [
          { method: "bkash", status: "succeeded", amount: 20_000 },
          { method: "sslcommerz", status: "failed", amount: 187_000 },
          { method: "cod", status: "succeeded", amount: 187_000 },
        ],
      }),
      bps,
    );
    expect(p).toMatchObject({ gatewayFees: 370, gatewayFeesByMethod: { bkash: 370 } });
  });

  it("estimates courier cost from the shipping fee when no charge was recorded", () => {
    const p = computeOrderProfit(order({ shipments: [{ status: "delivered", deliveryChargeActual: null, deliveryFeeCollected: null }] }), bps);
    expect(p).toMatchObject({ courierCost: 7_000, courierEstimated: true });
  });

  it("partial delivery: rejected units earn nothing and cost nothing", () => {
    const p = computeOrderProfit(order({ status: "partially_delivered", items: [{ quantity: 2, lineTotal: 200_000, costPrice: 55_000, rejectedQty: 1, returnedQty: 0 }] }), bps);
    expect(p).toMatchObject({ revenue: 107_000, cogs: 55_000, profit: 107_000 - 55_000 - 6_000 });
  });

  it("subtracts refunds (completed and outstanding) and excludes returned units from COGS", () => {
    const p = computeOrderProfit(
      order({ status: "completed", refundedTotal: 50_000, refundsOutstanding: 10_000, items: [{ quantity: 2, lineTotal: 200_000, costPrice: 55_000, rejectedQty: 0, returnedQty: 1 }] }),
      bps,
    );
    expect(p).toMatchObject({ revenue: 147_000, cogs: 55_000, refunds: 60_000 });
  });

  it("rejected at the door: courier cost is a loss, door fee and retained advance are income", () => {
    const p = computeOrderProfit(
      order({ status: "rejected_at_door", paidTotal: 20_000, refundedTotal: 0, refundsOutstanding: 14_000, shipments: [{ status: "rejected_at_door", deliveryChargeActual: 9_000, deliveryFeeCollected: 0 }], payments: [] }),
      bps,
    );
    expect(p).toMatchObject({ outcome: "failed_delivery", revenue: 6_000, cogs: 0, courierCost: 9_000, profit: -3_000 });
  });

  it("counts uncosted units", () => {
    const p = computeOrderProfit(order({ items: [{ quantity: 3, lineTotal: 300_000, costPrice: null, rejectedQty: 0, returnedQty: 0 }] }), bps);
    expect(p).toMatchObject({ cogs: 0, uncostedUnits: 3 });
  });

  it("does not bill cancelled or never-booked shipments", () => {
    const p = computeOrderProfit(
      order({ shipments: [{ status: "cancelled", deliveryChargeActual: null, deliveryFeeCollected: null }, { status: "delivered", deliveryChargeActual: 6_000, deliveryFeeCollected: null }] }),
      bps,
    );
    expect(p).toMatchObject({ courierCost: 6_000, courierEstimated: false });
  });
});

describe("gatewayFee", () => {
  it("rounds basis points to the poisha", () => {
    expect(gatewayFee(10_001, 185)).toBe(185);
  });
});

describe("summarizeProfit", () => {
  const a = computeOrderProfit(order({ payments: [{ method: "bkash", status: "succeeded", amount: 100_000 }] }), bps)!;
  const b = computeOrderProfit(order({ status: "returned_to_sender", shipments: [{ status: "returned_to_sender", deliveryChargeActual: 9_000, deliveryFeeCollected: null }], payments: [] }), bps)!;

  it("totals rows and computes margin", () => {
    const s = summarizeProfit([a, b], {});
    expect(s).toMatchObject({ orders: 2, soldOrders: 1, failedDeliveries: 1, revenue: 207_000, cogs: 110_000, courierCost: 15_000, gatewayFees: 1_850 });
    expect(s.profit).toBe(207_000 - 110_000 - 15_000 - 1_850);
    expect(s.margin).toBeCloseTo(s.profit / 207_000);
  });

  it("prefers recorded settlement fees over estimates per method", () => {
    const s = summarizeProfit([a, b], { bkash: 2_400 });
    expect(s.gatewayFees).toBe(2_400);
    expect(s.gatewayFeesFromSettlements).toEqual(["bkash"]);
  });

  it("subtracts ad spend", () => {
    expect(summarizeProfit([a], {}, 10_000).profit).toBe(a.profit - 10_000);
  });
});
