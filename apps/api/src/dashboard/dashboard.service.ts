import { Injectable } from "@nestjs/common";
import type { OrderStatus } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import type { DashboardQueryDto } from "./dto";

const CANCELLED_LIKE: OrderStatus[] = ["cancelled", "expired"];
const DELIVERED_LIKE: OrderStatus[] = ["delivered", "partially_delivered", "completed"];
const REJECTED_LIKE: OrderStatus[] = ["rejected_at_door", "returned_to_sender"];
const COD_IN_TRANSIT: OrderStatus[] = ["shipped", "out_for_delivery"];
const LIVE_WINDOW_MINUTES = 5;
const TOP_PRODUCTS_LIMIT = 10;

function resolveRange(query: DashboardQueryDto): { from: Date; to: Date } {
  const now = new Date();
  if (query.range === "custom" && query.from && query.to) return { from: query.from, to: query.to };
  if (query.range === "today") return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: now };
  const days = query.range === "30d" ? 30 : 7;
  return { from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), to: now };
}

/**
 * Admin dashboard KPIs (docs/PROJECT_SPEC.md §8.2 "Dashboard"). Two numbers
 * are documented approximations rather than exact, since the underlying
 * event history doesn't exist to compute them precisely: "conversion rate"
 * divides orders by distinct anonymous visitors seen in `analytics_events`
 * over the same window (no funnel/session table exists yet — M4's
 * first-party events are the closest proxy available); "new vs returning"
 * classifies by the customer's *current* `ordersCount` (===1 vs >1) rather
 * than what it was at the moment of each individual order in the range —
 * exact would need an event-sourced order history. Both are flagged here
 * and in docs/DECISIONS.md, not silently approximated.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async getKpis(query: DashboardQueryDto) {
    const { from, to } = resolveRange(query);
    const dateFilter = { gte: from, lte: to };

    const [orders, byStatus, topProductsRaw, lowStock, liveVisitors, activeCarts, pendingCod, failedProviderLogs, codOutstanding, anomalies] = await Promise.all([
      this.prisma.order.findMany({ where: { createdAt: dateFilter }, select: { id: true, total: true, status: true, customerId: true } }),
      this.prisma.order.groupBy({ by: ["status"], where: { createdAt: dateFilter }, _count: { _all: true } }),
      this.prisma.orderItem.groupBy({
        by: ["variantId"],
        where: { order: { createdAt: dateFilter, status: { notIn: CANCELLED_LIKE } } },
        _sum: { lineTotal: true, quantity: true },
        orderBy: { _sum: { lineTotal: "desc" } },
        take: TOP_PRODUCTS_LIMIT,
      }),
      this.inventory.lowStock(),
      this.prisma.analyticsEvent.findMany({
        where: { createdAt: { gte: new Date(Date.now() - LIVE_WINDOW_MINUTES * 60 * 1000) } },
        select: { anonymousId: true },
        distinct: ["anonymousId"],
      }),
      this.prisma.cart.count({ where: { status: "active", lastActivityAt: { gte: new Date(Date.now() - LIVE_WINDOW_MINUTES * 60 * 1000) } } }),
      this.prisma.order.aggregate({ where: { status: { in: COD_IN_TRANSIT } }, _sum: { codAmount: true } }),
      this.prisma.providerLog.groupBy({
        by: ["providerInstanceId"],
        where: { status: "error", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        _count: { _all: true },
      }),
      // §16 M12: COD the courier collected (delivered) but hasn't paid out per
      // a confirmed settlement; `pendingCod` above is COD still on the road.
      this.prisma.shipment.aggregate({ where: { status: { in: ["delivered", "partially_delivered"] }, codSettledAt: null, codAmount: { gt: 0 } }, _sum: { codAmount: true }, _count: { _all: true } }),
      this.prisma.anomalyAlert.findMany({ where: { acknowledgedAt: null }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);

    const nonCancelled = orders.filter((o) => !CANCELLED_LIKE.includes(o.status));
    const revenue = nonCancelled.reduce((sum, o) => sum + o.total, 0);
    const ordersCount = orders.length;
    const deliveredCount = orders.filter((o) => DELIVERED_LIKE.includes(o.status)).length;
    const rejectedCount = orders.filter((o) => REJECTED_LIKE.includes(o.status)).length;
    const aov = nonCancelled.length > 0 ? Math.round(revenue / nonCancelled.length) : 0;

    const uniqueVisitors = liveVisitors.length;
    const conversionRate = uniqueVisitors > 0 ? ordersCount / uniqueVisitors : null;

    const customerIds = [...new Set(orders.map((o) => o.customerId).filter((id): id is string => !!id))];
    const customers = customerIds.length > 0 ? await this.prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, ordersCount: true } }) : [];
    const newCustomerIds = new Set(customers.filter((c) => c.ordersCount <= 1).map((c) => c.id));
    const newCustomerOrders = orders.filter((o) => o.customerId && newCustomerIds.has(o.customerId)).length;
    const returningCustomerOrders = ordersCount - newCustomerOrders;

    const variantIds = topProductsRaw.map((t) => t.variantId);
    const variants = variantIds.length > 0 ? await this.prisma.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, sku: true, product: { select: { title: true, slug: true } } } }) : [];
    const variantById = new Map(variants.map((v) => [v.id, v]));

    const failedInstanceIds = failedProviderLogs.map((l) => l.providerInstanceId);
    const failedInstances = failedInstanceIds.length > 0 ? await this.prisma.providerInstance.findMany({ where: { id: { in: failedInstanceIds } }, select: { id: true, name: true, capability: true, driver: true } }) : [];
    const alerts = failedProviderLogs.map((l) => {
      const instance = failedInstances.find((i) => i.id === l.providerInstanceId);
      return { type: "integration_failing" as const, providerInstanceId: l.providerInstanceId, name: instance?.name ?? l.providerInstanceId, capability: instance?.capability ?? null, errorCount24h: l._count._all };
    });

    return {
      range: { from, to },
      revenue,
      ordersCount,
      aov,
      conversionRate,
      deliveredRate: ordersCount > 0 ? deliveredCount / ordersCount : 0,
      rejectionRate: ordersCount > 0 ? rejectedCount / ordersCount : 0,
      newCustomerOrders,
      returningCustomerOrders,
      ordersByStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
      topProducts: topProductsRaw.map((t) => ({
        variantId: t.variantId,
        sku: variantById.get(t.variantId)?.sku ?? t.variantId,
        title: variantById.get(t.variantId)?.product.title ?? null,
        slug: variantById.get(t.variantId)?.product.slug ?? null,
        revenue: t._sum.lineTotal ?? 0,
        quantity: t._sum.quantity ?? 0,
      })),
      lowStock: lowStock.slice(0, 20),
      liveVisitors: uniqueVisitors,
      activeCarts,
      pendingCodAmount: pendingCod._sum.codAmount ?? 0,
      codOutstanding: { amount: codOutstanding._sum.codAmount ?? 0, shipments: codOutstanding._count._all },
      alerts,
      anomalies: anomalies.map((a) => ({ id: a.id, metric: a.metric, severity: a.severity, message: a.message, createdAt: a.createdAt })),
    };
  }
}
