import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { SettingsService } from "../settings/settings.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { OrdersLifecycleService } from "../checkout/orders-lifecycle.service";
import { StockReservationService } from "../checkout/stock-reservation.service";
import type { CompletePackingDto } from "./dto";

/** §6.8 "confirmed → processing → packed: warehouse; pick list; packing step can require scanning each item barcode (setting)". */
@Injectable()
export class PackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly lifecycle: OrdersLifecycleService,
    private readonly stock: StockReservationService,
  ) {}

  /** Warehouse picks up the order to start working on it — confirmed → processing. */
  async startProcessing(orderId: string, actor: AuthenticatedStaff) {
    await this.lifecycle.transition({ orderId, to: "processing", actor: { type: "staff", id: actor.id } });
  }

  /** Looks an order up by its order number OR barcode-encoded id — "scan order barcode" (§8.2 Fulfillment). */
  async findByBarcode(code: string) {
    const order = await this.prisma.order.findFirst({ where: { OR: [{ orderNumber: code }, { id: code }] }, include: { items: true } });
    if (!order) throw new NotFoundException("No order matches that barcode.");
    return order;
  }

  /**
   * Finishes packing. When `orders.packingRequiresScan` is on, the server
   * re-checks the scanned list against the order's actual items — never
   * trusting that the admin UI's own scan-progress tracking was correct —
   * and rejects with the specific mismatches rather than a generic error
   * (§8.2: "mismatch alerts").
   */
  async completePacking(orderId: string, dto: CompletePackingDto, actor: AuthenticatedStaff) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "processing") throw new BadRequestException({ code: "INVALID_TRANSITION", message: "This order isn't being processed yet." });

    const requiresScan = await this.settings.getValue<boolean>("orders.packingRequiresScan");
    if (requiresScan) {
      const scannedByItem = new Map(dto.scannedItems.map((i) => [i.orderItemId, i.scannedQuantity]));
      const mismatches = order.items
        .map((item) => ({ orderItemId: item.id, sku: item.sku, expected: item.quantity, scanned: scannedByItem.get(item.id) ?? 0 }))
        .filter((m) => m.scanned !== m.expected);
      if (mismatches.length > 0) throw new BadRequestException({ code: "PACKING_MISMATCH", message: "Scanned quantities don't match the order.", details: { mismatches } });
    }

    const stockDecrementAt = await this.settings.getValue<"packed" | "shipped">("orders.stockDecrementAt");
    const location = order.items[0]?.locationId;

    await this.prisma.$transaction(async (tx) => {
      if (stockDecrementAt === "packed" && location) {
        const byLocation = new Map<string, { variantId: string; quantity: number }[]>();
        for (const item of order.items) byLocation.set(item.locationId, [...(byLocation.get(item.locationId) ?? []), { variantId: item.variantId, quantity: item.quantity }]);
        for (const [locationId, lines] of byLocation) await this.stock.fulfill(tx, locationId, lines, { type: "order", id: order.id });
      }
      await this.lifecycle.transition({ orderId, to: "packed", actor: { type: "staff", id: actor.id } }, tx);
    });

    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "order.packed", entityType: "order", entityId: orderId, after: { scanned: dto.scannedItems.length } });
  }
}
