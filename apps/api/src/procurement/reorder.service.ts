import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { addDays, dhakaDateKey, dhakaDayStart } from "../common/dhaka-time";
import type { AuthenticatedStaff } from "../common/types";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { compareUrgency, forecastDemand, suggestReorder, type ForecastConfidence, type ReorderUrgency } from "./forecast";
import type { CreateDraftOrdersDto, ReorderQueryDto } from "./dto";

const NOT_SOLD = ["cancelled", "expired", "pending_payment"];
const OPEN_PO = ["sent", "partially_received"] as const;

type Localized = { bn?: string; en?: string } | null;
const title = (value: unknown): string => {
  const v = value as Localized;
  return (v?.en || v?.bn || "").trim();
};

export interface ReorderRow {
  variantId: string;
  sku: string;
  productId: string;
  title: string;
  supplierId: string | null;
  supplierName: string | null;
  leadTimeDays: number;
  onHand: number;
  incoming: number;
  nextExpectedAt: Date | null;
  dailyRate: number;
  trend: number | null;
  forecastUnits: number;
  confidence: ForecastConfidence;
  daysOfCover: number | null;
  reorderPoint: number;
  targetStock: number;
  suggestedQty: number;
  urgency: ReorderUrgency;
  unitCost: number;
  estimatedCost: number;
}

/**
 * Demand forecast and reorder suggestions (docs/PROJECT_SPEC.md §8.2
 * Inventory "reorder suggestions", §16 M17). Read-only except
 * `createDraftOrders`, which turns accepted suggestions into ordinary draft
 * purchase orders (M12) so they go through the same send/receive flow.
 *
 * Only variants that sold in the window are analysed — a variant with no
 * sales has no demand to forecast, and the dead-stock report (M12) already
 * covers it.
 */
@Injectable()
export class ReorderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly purchaseOrders: PurchaseOrdersService,
    private readonly audit: AuditService,
  ) {}

  /** Units sold per variant per Dhaka calendar day (net of door rejections and returns). */
  private async dailySales(since: Date): Promise<Map<string, Map<string, number>>> {
    const rows = await this.prisma.$queryRaw<{ variant_id: string; day: string; units: number | bigint }[]>`
      SELECT oi.variant_id AS variant_id,
             to_char(o.created_at + interval '6 hours', 'YYYY-MM-DD') AS day,
             SUM(GREATEST(0, oi.quantity - oi.rejected_qty - oi.returned_qty))::int AS units
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at >= ${since} AND o.status::text <> ALL(${NOT_SOLD}::text[])
      GROUP BY oi.variant_id, to_char(o.created_at + interval '6 hours', 'YYYY-MM-DD')`;
    const byVariant = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const days = byVariant.get(row.variant_id) ?? new Map<string, number>();
      days.set(row.day, Number(row.units));
      byVariant.set(row.variant_id, days);
    }
    return byVariant;
  }

  async suggestions(query: ReorderQueryDto) {
    const [lookbackDefault, horizonDefault, defaultLead, safetyStockDays, coverDays] = await Promise.all([
      this.settings.getValue<number>("forecast.lookbackDays"),
      this.settings.getValue<number>("forecast.horizonDays"),
      this.settings.getValue<number>("procurement.leadTimeDays"),
      this.settings.getValue<number>("procurement.safetyStockDays"),
      this.settings.getValue<number>("procurement.coverDays"),
    ]);
    const days = query.days ?? lookbackDefault;
    const horizonDays = query.horizonDays ?? horizonDefault;

    const now = new Date();
    const firstDay = dhakaDayStart(addDays(now, -(days - 1)));
    const sales = await this.dailySales(firstDay);
    const variantIds = [...sales.keys()];
    if (variantIds.length === 0) return { days, horizonDays, rows: [] as ReorderRow[], totals: { variants: 0, actionable: 0, critical: 0, units: 0, estimatedCost: 0 } };

    const dayKeys = Array.from({ length: days }, (_, i) => dhakaDateKey(addDays(firstDay, i)));

    const [variants, levels, incomingItems, supplierItems] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { id: { in: variantIds }, product: { status: { not: "archived" }, ...(query.categoryId ? { categoryId: query.categoryId } : {}) } },
        select: { id: true, sku: true, costPrice: true, product: { select: { id: true, title: true } } },
      }),
      this.prisma.inventoryLevel.groupBy({ by: ["variantId"], where: { variantId: { in: variantIds } }, _sum: { onHand: true } }),
      this.prisma.purchaseOrderItem.findMany({
        where: { variantId: { in: variantIds }, purchaseOrder: { status: { in: [...OPEN_PO] } } },
        select: { variantId: true, qtyOrdered: true, qtyReceived: true, purchaseOrder: { select: { expectedAt: true } } },
      }),
      // Most recent non-cancelled PO line per variant tells us who normally supplies it.
      this.prisma.purchaseOrderItem.findMany({
        where: { variantId: { in: variantIds }, purchaseOrder: { status: { not: "cancelled" }, supplier: { isActive: true } } },
        orderBy: { purchaseOrder: { createdAt: "desc" } },
        select: { variantId: true, purchaseOrder: { select: { supplier: { select: { id: true, name: true, leadTimeDays: true } } } } },
      }),
    ]);

    const onHandById = new Map(levels.map((l) => [l.variantId, l._sum.onHand ?? 0]));
    const incomingById = new Map<string, { qty: number; expectedAt: Date | null }>();
    for (const item of incomingItems) {
      const open = Math.max(0, item.qtyOrdered - item.qtyReceived);
      if (open === 0) continue;
      const entry = incomingById.get(item.variantId) ?? { qty: 0, expectedAt: null };
      entry.qty += open;
      const expected = item.purchaseOrder.expectedAt;
      if (expected && (!entry.expectedAt || expected < entry.expectedAt)) entry.expectedAt = expected;
      incomingById.set(item.variantId, entry);
    }
    const supplierById = new Map<string, { id: string; name: string; leadTimeDays: number | null }>();
    for (const item of supplierItems) if (!supplierById.has(item.variantId)) supplierById.set(item.variantId, item.purchaseOrder.supplier);

    const rows: ReorderRow[] = [];
    for (const variant of variants) {
      const supplier = supplierById.get(variant.id) ?? null;
      if (query.supplierId && supplier?.id !== query.supplierId) continue;
      const perDay = sales.get(variant.id)!;
      const forecast = forecastDemand(
        dayKeys.map((key) => perDay.get(key) ?? 0),
        horizonDays,
      );
      const leadTimeDays = supplier?.leadTimeDays ?? defaultLead;
      const onHand = onHandById.get(variant.id) ?? 0;
      const incoming = incomingById.get(variant.id);
      const reorder = suggestReorder({ onHand, incoming: incoming?.qty ?? 0, dailyRate: forecast.dailyRate, leadTimeDays, safetyStockDays, coverDays });
      const unitCost = variant.costPrice ?? 0;
      rows.push({
        variantId: variant.id,
        sku: variant.sku,
        productId: variant.product.id,
        title: title(variant.product.title),
        supplierId: supplier?.id ?? null,
        supplierName: supplier?.name ?? null,
        leadTimeDays,
        onHand,
        incoming: incoming?.qty ?? 0,
        nextExpectedAt: incoming?.expectedAt ?? null,
        dailyRate: Math.round(forecast.dailyRate * 100) / 100,
        trend: forecast.trend === null ? null : Math.round(forecast.trend * 100) / 100,
        forecastUnits: forecast.forecastUnits,
        confidence: forecast.confidence,
        daysOfCover: reorder.daysOfCover === null ? null : Math.round(reorder.daysOfCover * 10) / 10,
        reorderPoint: reorder.reorderPoint,
        targetStock: reorder.targetStock,
        suggestedQty: reorder.suggestedQty,
        urgency: reorder.urgency,
        unitCost,
        estimatedCost: reorder.suggestedQty * unitCost,
      });
    }
    rows.sort(compareUrgency);
    const shown = query.show === "all" ? rows : rows.filter((r) => r.suggestedQty > 0);
    return {
      days,
      horizonDays,
      rows: shown,
      totals: {
        variants: rows.length,
        actionable: rows.filter((r) => r.suggestedQty > 0).length,
        critical: rows.filter((r) => r.urgency === "critical").length,
        units: shown.reduce((a, r) => a + r.suggestedQty, 0),
        estimatedCost: shown.reduce((a, r) => a + r.estimatedCost, 0),
      },
    };
  }

  /** One draft purchase order per supplier; unit cost is the variant's current cost price. */
  async createDraftOrders(dto: CreateDraftOrdersDto, actor: AuthenticatedStaff) {
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: dto.items.map((i) => i.variantId) } }, select: { id: true, costPrice: true } });
    const costById = new Map(variants.map((v) => [v.id, v.costPrice ?? 0]));
    if (costById.size !== dto.items.length) throw new BadRequestException({ code: "VARIANT_NOT_FOUND", message: "One or more variants no longer exist" });

    const bySupplier = new Map<string, CreateDraftOrdersDto["items"]>();
    for (const item of dto.items) bySupplier.set(item.supplierId, [...(bySupplier.get(item.supplierId) ?? []), item]);

    const created: { id: string; number: string; supplierId: string; totalCost: number }[] = [];
    for (const [supplierId, items] of bySupplier) {
      const po = await this.purchaseOrders.create(
        {
          supplierId,
          type: "purchase",
          locationId: dto.locationId,
          notes: "Created from reorder suggestions",
          items: items.map((i) => ({ variantId: i.variantId, qtyOrdered: i.quantity, unitCost: costById.get(i.variantId) ?? 0 })),
        },
        actor,
      );
      created.push({ id: po.id, number: po.number, supplierId, totalCost: po.totalCost });
    }
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "reorder.create_drafts", entityType: "purchase_order", entityId: created.map((c) => c.id).join(","), after: { orders: created.length, lines: dto.items.length } });
    return { created };
  }
}
