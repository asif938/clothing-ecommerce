import { Injectable } from "@nestjs/common";
import type { OrderStatus, ShipmentStatus } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";

const CANCELLED_LIKE: OrderStatus[] = ["cancelled", "expired"];
const SHIPMENT_DELIVERED_LIKE: ShipmentStatus[] = ["delivered", "partially_delivered"];
const SHIPMENT_REJECTED_LIKE: ShipmentStatus[] = ["rejected_at_door", "returned_to_sender"];

/**
 * Core reports (docs/PROJECT_SPEC.md §8.2) — sales, products, courier,
 * staff, discounts, search terms. The true profit report arrived in M12
 * (`finance/profit.service.ts`); customer cohorts are phase 3 — see
 * docs/DECISIONS.md. Day-bucketed grouping (sales by day) is
 * done in JS after one range-bounded fetch rather than a raw SQL
 * `date_trunc` query — admin report volumes are small enough that this is
 * never a real cost, and it avoids a second, untestable raw-SQL code path
 * alongside every other Prisma query in this codebase.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async salesByDay(from: Date, to: Date) {
    const orders = await this.prisma.order.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { total: true, status: true, createdAt: true } });
    const byDay = new Map<string, { day: string; orders: number; revenue: number; cancelled: number }>();
    for (const order of orders) {
      const day = order.createdAt.toISOString().slice(0, 10);
      const row = byDay.get(day) ?? { day, orders: 0, revenue: 0, cancelled: 0 };
      row.orders += 1;
      if (CANCELLED_LIKE.includes(order.status)) row.cancelled += 1;
      else row.revenue += order.total;
      byDay.set(day, row);
    }
    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  async topProducts(from: Date, to: Date, limit = 50) {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ["variantId"],
      where: { order: { createdAt: { gte: from, lte: to }, status: { notIn: CANCELLED_LIKE } } },
      _sum: { lineTotal: true, quantity: true },
      orderBy: { _sum: { lineTotal: "desc" } },
      take: limit,
    });
    const variantIds = grouped.map((g) => g.variantId);
    const variants = variantIds.length > 0 ? await this.prisma.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, sku: true, product: { select: { title: true, slug: true, categoryId: true } } } }) : [];
    const byId = new Map(variants.map((v) => [v.id, v]));
    return grouped.map((g) => ({
      variantId: g.variantId,
      sku: byId.get(g.variantId)?.sku ?? g.variantId,
      productSlug: byId.get(g.variantId)?.product.slug ?? null,
      quantity: g._sum.quantity ?? 0,
      revenue: g._sum.lineTotal ?? 0,
    }));
  }

  async courierPerformance(from: Date, to: Date) {
    const shipments = await this.prisma.shipment.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { courierDriver: true, status: true, deliveryChargeActual: true } });
    const byDriver = new Map<string, { driver: string; booked: number; delivered: number; rejected: number; deliveryChargeTotal: number }>();
    for (const shipment of shipments) {
      const row = byDriver.get(shipment.courierDriver) ?? { driver: shipment.courierDriver, booked: 0, delivered: 0, rejected: 0, deliveryChargeTotal: 0 };
      row.booked += 1;
      if (SHIPMENT_DELIVERED_LIKE.includes(shipment.status)) row.delivered += 1;
      if (SHIPMENT_REJECTED_LIKE.includes(shipment.status)) row.rejected += 1;
      row.deliveryChargeTotal += shipment.deliveryChargeActual ?? 0;
      byDriver.set(shipment.courierDriver, row);
    }
    return [...byDriver.values()].map((r) => ({ ...r, successRate: r.booked > 0 ? r.delivered / r.booked : 0 }));
  }

  async staffPerformance(from: Date, to: Date) {
    const orders = await this.prisma.order.findMany({
      where: { confirmedAt: { gte: from, lte: to }, confirmedBy: { not: null } },
      select: { confirmedBy: true, confirmedAt: true, createdAt: true },
    });
    const byStaff = new Map<string, { staffId: string; confirmations: number; totalMinutesToConfirm: number }>();
    for (const order of orders) {
      const staffId = order.confirmedBy!;
      const row = byStaff.get(staffId) ?? { staffId, confirmations: 0, totalMinutesToConfirm: 0 };
      row.confirmations += 1;
      row.totalMinutesToConfirm += (order.confirmedAt!.getTime() - order.createdAt.getTime()) / 60_000;
      byStaff.set(staffId, row);
    }
    const staffIds = [...byStaff.keys()];
    const staff = staffIds.length > 0 ? await this.prisma.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } }) : [];
    const nameById = new Map(staff.map((s) => [s.id, s.name]));
    return [...byStaff.values()].map((r) => ({
      staffId: r.staffId,
      name: nameById.get(r.staffId) ?? r.staffId,
      confirmations: r.confirmations,
      avgMinutesToConfirm: r.confirmations > 0 ? Math.round(r.totalMinutesToConfirm / r.confirmations) : 0,
    }));
  }

  async discountUsage(from: Date, to: Date) {
    const grouped = await this.prisma.discountUsage.groupBy({ by: ["discountId"], where: { createdAt: { gte: from, lte: to } }, _count: { _all: true }, _sum: { amount: true } });
    const discountIds = grouped.map((g) => g.discountId);
    const discounts = discountIds.length > 0 ? await this.prisma.discount.findMany({ where: { id: { in: discountIds } }, select: { id: true, name: true, code: true } }) : [];
    const byId = new Map(discounts.map((d) => [d.id, d]));
    return grouped.map((g) => ({
      discountId: g.discountId,
      name: byId.get(g.discountId)?.name ?? g.discountId,
      code: byId.get(g.discountId)?.code ?? null,
      uses: g._count._all,
      totalDiscounted: g._sum.amount ?? 0,
    }));
  }

  async searchTerms(from: Date, to: Date) {
    const events = await this.prisma.analyticsEvent.findMany({ where: { type: "search", createdAt: { gte: from, lte: to } }, select: { payload: true } });
    const byTerm = new Map<string, { term: string; searches: number; zeroResultSearches: number }>();
    for (const event of events) {
      const payload = event.payload as { term?: string; resultCount?: number } | null;
      const term = payload?.term?.trim().toLowerCase();
      if (!term) continue;
      const row = byTerm.get(term) ?? { term, searches: 0, zeroResultSearches: 0 };
      row.searches += 1;
      if (payload?.resultCount === 0) row.zeroResultSearches += 1;
      byTerm.set(term, row);
    }
    return [...byTerm.values()].sort((a, b) => b.searches - a.searches);
  }
}
