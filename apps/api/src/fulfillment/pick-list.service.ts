import { Injectable } from "@nestjs/common";
import { SettingsService } from "../settings/settings.service";
import { PrismaService } from "../prisma/prisma.service";
import { StockReservationService } from "../checkout/stock-reservation.service";

export interface PickListLine {
  variantId: string;
  sku: string;
  title: unknown;
  binLocation: string | null;
  totalQuantity: number;
  orders: { orderId: string; orderNumber: string; quantity: number }[];
}

/** §8.2 Fulfillment: "pick list (by location, grouped by product/bin)". */
@Injectable()
export class PickListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly stock: StockReservationService,
  ) {}

  async generate(locationId?: string): Promise<{ locationId: string; groupBy: "product" | "bin"; lines: PickListLine[] }> {
    const resolvedLocationId = locationId ?? (await this.stock.defaultLocation()).id;
    const groupBy = await this.settings.getValue<"product" | "bin">("fulfillment.pickListGroupBy");

    const orders = await this.prisma.order.findMany({
      where: { status: { in: ["confirmed", "processing"] } },
      include: { items: { where: { locationId: resolvedLocationId } } },
      orderBy: { createdAt: "asc" },
    });

    const byVariant = new Map<string, PickListLine>();
    for (const order of orders) {
      for (const item of order.items) {
        const existing = byVariant.get(item.variantId);
        if (existing) {
          existing.totalQuantity += item.quantity;
          existing.orders.push({ orderId: order.id, orderNumber: order.orderNumber, quantity: item.quantity });
        } else {
          byVariant.set(item.variantId, {
            variantId: item.variantId,
            sku: item.sku,
            title: item.title,
            binLocation: null,
            totalQuantity: item.quantity,
            orders: [{ orderId: order.id, orderNumber: order.orderNumber, quantity: item.quantity }],
          });
        }
      }
    }

    if (groupBy === "bin" && byVariant.size > 0) {
      const levels = await this.prisma.inventoryLevel.findMany({
        where: { locationId: resolvedLocationId, variantId: { in: [...byVariant.keys()] } },
        select: { variantId: true, binLocation: true },
      });
      for (const level of levels) {
        const line = byVariant.get(level.variantId);
        if (line) line.binLocation = level.binLocation;
      }
    }

    const lines = [...byVariant.values()];
    if (groupBy === "bin") {
      lines.sort((a, b) => (a.binLocation ?? "").localeCompare(b.binLocation ?? "") || a.sku.localeCompare(b.sku));
    } else {
      lines.sort((a, b) => a.sku.localeCompare(b.sku));
    }

    return { locationId: resolvedLocationId, groupBy, lines };
  }
}
