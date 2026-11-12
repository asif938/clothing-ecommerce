import { Injectable } from "@nestjs/common";
import type { OrderStatus } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { dhakaDateKey } from "../common/dhaka-time";
import { GatewaySettlementsService } from "./gateway-settlements.service";
import { FAILED_DELIVERY_STATUSES, SOLD_STATUSES, computeOrderProfit, summarizeProfit, type OrderProfit } from "./profit";

const IN_PIPELINE: OrderStatus[] = ["pending", "confirmed", "processing", "packed", "shipped", "out_for_delivery", "on_hold"];

export interface ProfitDayRow {
  day: string;
  orders: number;
  revenue: number;
  cogs: number;
  courierCost: number;
  gatewayFees: number;
  profit: number;
}

export interface ProfitOrderRow extends OrderProfit {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: Date;
}

/**
 * True profit report (docs/PROJECT_SPEC.md §8.2 Reports "profit", §16 M12)
 * — loads orders placed in the range and hands each to the pure
 * `computeOrderProfit`. Range is by order *placement* date, matching every
 * other report here.
 */
@Injectable()
export class ProfitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly gatewaySettlements: GatewaySettlementsService,
  ) {}

  async report(from: Date, to: Date) {
    const [feeBps, recordedFees, orders, inPipeline] = await Promise.all([
      this.settings.getValue<Record<string, number>>("finance.gatewayFeeBps"),
      this.gatewaySettlements.recordedFees(from, to),
      this.prisma.order.findMany({
        where: { createdAt: { gte: from, lte: to }, status: { in: [...SOLD_STATUSES, ...FAILED_DELIVERY_STATUSES] } },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          createdAt: true,
          total: true,
          shippingFee: true,
          paidTotal: true,
          refundedTotal: true,
          items: { select: { quantity: true, lineTotal: true, costPrice: true, rejectedQty: true, returnedQty: true } },
          shipments: { select: { status: true, deliveryChargeActual: true, deliveryFeeCollected: true } },
          payments: { select: { method: true, status: true, amount: true } },
          refunds: { where: { status: { in: ["pending", "processing"] } }, select: { amount: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.order.count({ where: { createdAt: { gte: from, lte: to }, status: { in: IN_PIPELINE } } }),
    ]);

    const rows: ProfitOrderRow[] = [];
    for (const order of orders) {
      const profit = computeOrderProfit({ ...order, refundsOutstanding: order.refunds.reduce((a, r) => a + r.amount, 0) }, feeBps);
      if (profit) rows.push({ orderId: order.id, orderNumber: order.orderNumber, status: order.status, createdAt: order.createdAt, ...profit });
    }

    const byDay = new Map<string, ProfitDayRow>();
    for (const row of rows) {
      const day = dhakaDateKey(row.createdAt);
      const d = byDay.get(day) ?? { day, orders: 0, revenue: 0, cogs: 0, courierCost: 0, gatewayFees: 0, profit: 0 };
      d.orders += 1;
      d.revenue += row.revenue;
      d.cogs += row.cogs;
      d.courierCost += row.courierCost;
      d.gatewayFees += row.gatewayFees;
      d.profit += row.profit;
      byDay.set(day, d);
    }

    return {
      range: { from, to },
      summary: { ...summarizeProfit(rows, recordedFees), ordersInPipeline: inPipeline },
      days: [...byDay.values()],
      orders: rows,
    };
  }
}
