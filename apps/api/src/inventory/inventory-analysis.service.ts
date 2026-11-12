import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { OrderStatus } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { PriceSchedulesService } from "../price-schedules/price-schedules.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { computeSizeCurve } from "./size-curve";
import { suggestMarkdown, type MarkdownTierInput } from "./markdown";
import type { ApplyMarkdownsDto, DeadStockQueryDto, SizeCurveQueryDto } from "./operations.dto";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOT_SOLD: OrderStatus[] = ["cancelled", "expired", "pending_payment"];

type Localized = { bn?: string; en?: string } | null;
function label(value: unknown): string {
  const v = value as Localized;
  return (v?.en || v?.bn || "").trim();
}

/**
 * Inventory analysis (docs/PROJECT_SPEC.md §8.2 Inventory "size-curve
 * analysis and reorder suggestions", "dead stock report with markdown
 * suggestion", §16 M12). Read-only except `applyMarkdowns`, which turns
 * accepted suggestions into ordinary variant price schedules (M2) so they
 * show up — and can be cancelled/reverted — in the existing Price
 * schedules screen rather than through a second price-change mechanism.
 */
@Injectable()
export class InventoryAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly priceSchedules: PriceSchedulesService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Units sold per variant in the window: order lines of orders that weren't
   * cancelled/expired/unpaid, net of door rejections and returns (those
   * units came back, so they aren't demand the curve should chase).
   */
  private async soldByVariant(variantIds: string[], since: Date): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const items = await this.prisma.orderItem.findMany({
      where: { variantId: { in: variantIds }, order: { createdAt: { gte: since }, status: { notIn: NOT_SOLD } } },
      select: { variantId: true, quantity: true, rejectedQty: true, returnedQty: true },
    });
    const sold = new Map<string, number>();
    for (const item of items) sold.set(item.variantId, (sold.get(item.variantId) ?? 0) + Math.max(0, item.quantity - item.rejectedQty - item.returnedQty));
    return sold;
  }

  async sizeCurve(query: SizeCurveQueryDto) {
    const days = query.days ?? (await this.settings.getValue<number>("inventory.sizeCurveLookbackDays"));
    const since = new Date(Date.now() - days * DAY_MS);

    const products = await this.prisma.product.findMany({
      where: query.productId ? { id: query.productId } : { categoryId: query.categoryId, status: { not: "archived" } },
      select: {
        id: true,
        title: true,
        options: { where: { type: "size" }, select: { id: true, values: { select: { id: true, value: true, position: true } } } },
        variants: { select: { id: true, optionValueIds: true, inventoryLevels: { select: { onHand: true } } } },
      },
    });
    if (query.productId && products.length === 0) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });

    // Size label → { order, sold, onHand }. Products are aggregated by the
    // size *label* so a category view lines up "M" across products whose
    // option value ids differ.
    const bySize = new Map<string, { order: number; sold: number; onHand: number }>();
    const variantSize = new Map<string, string>();
    for (const product of products) {
      const sizeOption = product.options[0];
      if (!sizeOption) continue;
      const valueById = new Map(sizeOption.values.map((v) => [v.id, v]));
      for (const variant of product.variants) {
        const value = variant.optionValueIds.map((id) => valueById.get(id)).find((v) => v !== undefined);
        if (!value) continue;
        const size = label(value.value) || value.id;
        variantSize.set(variant.id, size);
        const row = bySize.get(size) ?? { order: value.position, sold: 0, onHand: 0 };
        row.order = Math.min(row.order, value.position);
        row.onHand += variant.inventoryLevels.reduce((a, l) => a + l.onHand, 0);
        bySize.set(size, row);
      }
    }
    if (bySize.size === 0) throw new BadRequestException({ code: "NO_SIZE_OPTION", message: "No products here have a size option" });

    const sold = await this.soldByVariant([...variantSize.keys()], since);
    for (const [variantId, size] of variantSize) bySize.get(size)!.sold += sold.get(variantId) ?? 0;

    const ordered = [...bySize.entries()].sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]));
    const curve = computeSizeCurve(
      ordered.map(([size, row]) => ({ size, sold: row.sold, onHand: row.onHand })),
      query.buyQuantity,
    );
    return {
      days,
      productCount: products.filter((p) => p.options.length > 0).length,
      title: query.productId ? products[0]!.title : null,
      totalSold: curve.reduce((a, r) => a + r.sold, 0),
      totalOnHand: curve.reduce((a, r) => a + r.onHand, 0),
      buyQuantity: query.buyQuantity,
      rows: curve,
    };
  }

  async deadStock(query: DeadStockQueryDto) {
    const [defaultDays, tiers, minMarginPercent] = await Promise.all([
      this.settings.getValue<number>("inventory.deadStockDays"),
      this.settings.getValue<MarkdownTierInput[]>("inventory.markdownTiers"),
      this.settings.getValue<number>("pricing.marginGuard.minMarginPercent"),
    ]);
    const days = query.days ?? defaultDays;
    const now = Date.now();

    const levels = await this.prisma.inventoryLevel.findMany({
      where: { onHand: { gt: 0 }, ...(query.locationId ? { locationId: query.locationId } : {}) },
      select: { variantId: true, onHand: true },
    });
    const onHandByVariant = new Map<string, number>();
    for (const level of levels) onHandByVariant.set(level.variantId, (onHandByVariant.get(level.variantId) ?? 0) + level.onHand);
    const variantIds = [...onHandByVariant.keys()];
    if (variantIds.length === 0) return { days, rows: [], totals: { variants: 0, units: 0, stockValue: 0 } };

    // Last sale / last receipt per variant from the stock-movement ledger
    // (every sale books a `sale` movement at placement).
    const [lastSales, lastReceipts, variants] = await Promise.all([
      this.prisma.stockMovement.groupBy({ by: ["variantId"], where: { variantId: { in: variantIds }, reason: "sale" }, _max: { createdAt: true } }),
      this.prisma.stockMovement.groupBy({ by: ["variantId"], where: { variantId: { in: variantIds }, reason: { in: ["purchase_receive", "transfer_in"] } }, _max: { createdAt: true } }),
      this.prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, sku: true, price: true, costPrice: true, createdAt: true, product: { select: { id: true, title: true } } },
      }),
    ]);
    const lastSaleById = new Map(lastSales.map((r) => [r.variantId, r._max.createdAt]));
    const lastReceiptById = new Map(lastReceipts.map((r) => [r.variantId, r._max.createdAt]));

    const rows = [];
    for (const variant of variants) {
      const lastSaleAt = lastSaleById.get(variant.id) ?? null;
      // Never sold → age from when the stock arrived (or the variant was created).
      const since = lastSaleAt ?? lastReceiptById.get(variant.id) ?? variant.createdAt;
      const daysUnsold = Math.floor((now - since.getTime()) / DAY_MS);
      if (daysUnsold < days) continue;
      const onHand = onHandByVariant.get(variant.id) ?? 0;
      const suggestion = suggestMarkdown({ price: variant.price, costPrice: variant.costPrice, daysUnsold, tiers, minMarginPercent });
      rows.push({
        variantId: variant.id,
        sku: variant.sku,
        productId: variant.product.id,
        title: variant.product.title,
        onHand,
        price: variant.price,
        costPrice: variant.costPrice,
        stockValue: variant.costPrice === null ? null : variant.costPrice * onHand,
        lastSaleAt,
        daysUnsold,
        suggestedPercentOff: suggestion?.percentOff ?? null,
        suggestedPrice: suggestion?.suggestedPrice ?? null,
        cappedByMargin: suggestion?.cappedByMargin ?? false,
      });
    }
    rows.sort((a, b) => (b.stockValue ?? 0) - (a.stockValue ?? 0) || b.daysUnsold - a.daysUnsold);
    return {
      days,
      rows,
      totals: { variants: rows.length, units: rows.reduce((a, r) => a + r.onHand, 0), stockValue: rows.reduce((a, r) => a + (r.stockValue ?? 0), 0) },
    };
  }

  /** Accepts markdown suggestions as variant price schedules (M2), starting now unless a start is given. */
  async applyMarkdowns(dto: ApplyMarkdownsDto, actor: AuthenticatedStaff) {
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: dto.items.map((i) => i.variantId) } }, select: { id: true, price: true } });
    const priceById = new Map(variants.map((v) => [v.id, v.price]));
    for (const item of dto.items) {
      const current = priceById.get(item.variantId);
      if (current === undefined) throw new BadRequestException({ code: "VARIANT_NOT_FOUND", message: `Variant ${item.variantId} not found` });
      if (item.newPrice >= current) throw new BadRequestException({ code: "NOT_A_MARKDOWN", message: "A markdown must lower the price", details: { variantId: item.variantId } });
    }
    const startsAt = dto.startsAt ?? new Date();
    const schedules = [];
    for (const item of dto.items) {
      schedules.push(
        await this.priceSchedules.create({ targetType: "variant", targetId: item.variantId, newPrice: item.newPrice, startsAt, endsAt: dto.endsAt ?? null, revertOnEnd: true }, actor),
      );
    }
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "inventory.markdowns_apply", entityType: "price_schedule", entityId: schedules.map((s) => s.id).join(","), after: dto });
    return { created: schedules.length, scheduleIds: schedules.map((s) => s.id) };
  }
}
