import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PurchaseOrderStatus } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { InventoryService, type StockMovementResult } from "../inventory/inventory.service";
import { BomService } from "../materials/bom.service";
import { nextCostPrice, purchaseOrderStatusAfterReceive } from "../inventory/stock-math";
import { createWithDocumentNumber } from "../common/document-number";
import type { AuthenticatedStaff } from "../common/types";
import type { CreatePurchaseOrderDto, ListPurchaseOrdersQueryDto, ReceivePurchaseOrderDto, UpdatePurchaseOrderDto } from "./dto";

const ITEM_INCLUDE = {
  items: { include: { variant: { select: { id: true, sku: true, barcode: true, costPrice: true, product: { select: { id: true, title: true } } } } }, orderBy: { id: "asc" as const } },
  supplier: { select: { id: true, name: true } },
  location: { select: { id: true, name: true } },
} satisfies Prisma.PurchaseOrderInclude;

const OPEN_FOR_RECEIVING: PurchaseOrderStatus[] = ["sent", "partially_received"];

function totalCost(items: { qtyOrdered: number; unitCost: number }[]): number {
  return items.reduce((sum, item) => sum + item.qtyOrdered * item.unitCost, 0);
}

/**
 * Purchase and production orders with receiving (docs/PROJECT_SPEC.md §5.4,
 * §8.2 Inventory, §16 M12). Lifecycle: draft → sent → partially_received →
 * received, or cancelled from any open state (cancelling a partially
 * received order closes it short; what already arrived stays in stock).
 * Receiving books `purchase_receive` stock movements at the PO's location
 * and, per `procurement.costMethod`, updates the variant cost price.
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly inventory: InventoryService,
    private readonly bom: BomService,
  ) {}

  async list(query: ListPurchaseOrdersQueryDto) {
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { ...(query.status ? { status: query.status } : {}), ...(query.supplierId ? { supplierId: query.supplierId } : {}) },
      include: { supplier: { select: { id: true, name: true } }, location: { select: { id: true, name: true } }, items: { select: { qtyOrdered: true, qtyReceived: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return orders.map(({ items, ...po }) => ({
      ...po,
      unitsOrdered: items.reduce((a, i) => a + i.qtyOrdered, 0),
      unitsReceived: items.reduce((a, i) => a + i.qtyReceived, 0),
    }));
  }

  async get(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: ITEM_INCLUDE });
    if (!po) throw new NotFoundException({ code: "PURCHASE_ORDER_NOT_FOUND", message: "Purchase order not found" });
    return po;
  }

  private async assertRefs(supplierId: string | undefined, locationId: string | undefined, variantIds: string[]) {
    if (supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier || !supplier.isActive) throw new BadRequestException({ code: "SUPPLIER_INVALID", message: "Choose an active supplier" });
    }
    if (locationId) {
      const location = await this.prisma.stockLocation.findUnique({ where: { id: locationId } });
      if (!location || !location.isActive) throw new BadRequestException({ code: "LOCATION_INVALID", message: "Choose an active stock location" });
    }
    if (variantIds.length > 0) {
      const found = await this.prisma.productVariant.count({ where: { id: { in: variantIds } } });
      if (found !== variantIds.length) throw new BadRequestException({ code: "VARIANT_NOT_FOUND", message: "One or more variants no longer exist" });
    }
  }

  async create(dto: CreatePurchaseOrderDto, actor: AuthenticatedStaff) {
    await this.assertRefs(dto.supplierId, dto.locationId, dto.items.map((i) => i.variantId));
    const po = await createWithDocumentNumber(
      dto.type === "production" ? "PRD" : "PO",
      async (head) => (await this.prisma.purchaseOrder.findFirst({ where: { number: { startsWith: head } }, orderBy: { number: "desc" }, select: { number: true } }))?.number ?? null,
      (number) =>
        this.prisma.purchaseOrder.create({
          data: {
            number,
            supplierId: dto.supplierId,
            type: dto.type,
            locationId: dto.locationId,
            expectedAt: dto.expectedAt ?? null,
            notes: dto.notes ?? null,
            totalCost: totalCost(dto.items),
            createdBy: actor.id,
            items: { create: dto.items },
          },
          include: ITEM_INCLUDE,
        }),
    );
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "purchase_order.create", entityType: "purchase_order", entityId: po.id, after: { number: po.number, totalCost: po.totalCost, items: dto.items } });
    return po;
  }

  async update(id: string, dto: UpdatePurchaseOrderDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (before.status === "received" || before.status === "cancelled") throw new BadRequestException({ code: "PURCHASE_ORDER_CLOSED", message: "This purchase order is closed" });
    const editingLines = dto.items !== undefined || dto.supplierId !== undefined || dto.locationId !== undefined || dto.type !== undefined;
    if (editingLines && before.status !== "draft") {
      throw new BadRequestException({ code: "PURCHASE_ORDER_NOT_DRAFT", message: "Only notes and the expected date can change after the order is sent" });
    }
    await this.assertRefs(dto.supplierId, dto.locationId, dto.items?.map((i) => i.variantId) ?? []);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderItem.createMany({ data: dto.items.map((item) => ({ ...item, purchaseOrderId: id })) });
      }
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(dto.supplierId ? { supplierId: dto.supplierId } : {}),
          ...(dto.type ? { type: dto.type } : {}),
          ...(dto.locationId ? { locationId: dto.locationId } : {}),
          ...(dto.expectedAt !== undefined ? { expectedAt: dto.expectedAt } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.items ? { totalCost: totalCost(dto.items) } : {}),
        },
        include: ITEM_INCLUDE,
      });
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "purchase_order.update", entityType: "purchase_order", entityId: id, before: { totalCost: before.totalCost, notes: before.notes, expectedAt: before.expectedAt }, after: dto });
    return updated;
  }

  /** Marks the order as placed with the supplier — stock is booked only on receiving. */
  async send(id: string, actor: AuthenticatedStaff) {
    const { count } = await this.prisma.purchaseOrder.updateMany({ where: { id, status: "draft" }, data: { status: "sent", sentAt: new Date() } });
    if (count === 0) throw new BadRequestException({ code: "PURCHASE_ORDER_NOT_DRAFT", message: "Only a draft can be marked as sent" });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "purchase_order.send", entityType: "purchase_order", entityId: id });
    return this.get(id);
  }

  async cancel(id: string, actor: AuthenticatedStaff) {
    const { count } = await this.prisma.purchaseOrder.updateMany({ where: { id, status: { in: ["draft", "sent", "partially_received"] } }, data: { status: "cancelled", cancelledAt: new Date() } });
    if (count === 0) throw new BadRequestException({ code: "PURCHASE_ORDER_CLOSED", message: "This purchase order can no longer be cancelled" });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "purchase_order.cancel", entityType: "purchase_order", entityId: id });
    return this.get(id);
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const { count } = await this.prisma.purchaseOrder.deleteMany({ where: { id, status: "draft" } });
    if (count === 0) throw new BadRequestException({ code: "PURCHASE_ORDER_NOT_DRAFT", message: "Only drafts can be deleted — cancel it instead" });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "purchase_order.delete", entityType: "purchase_order", entityId: id });
  }

  async receive(id: string, dto: ReceivePurchaseOrderDto, actor: AuthenticatedStaff) {
    const costMethod = await this.settings.getValue<"weighted_average" | "last_cost" | "none">("procurement.costMethod");
    const movements: StockMovementResult[] = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
      if (!po) throw new NotFoundException({ code: "PURCHASE_ORDER_NOT_FOUND", message: "Purchase order not found" });
      if (!OPEN_FOR_RECEIVING.includes(po.status)) throw new BadRequestException({ code: "PURCHASE_ORDER_NOT_RECEIVABLE", message: "Mark the order as sent before receiving, and you can't receive a closed order" });

      const itemByVariant = new Map(po.items.map((item) => [item.variantId, item]));
      const costChanges: { variantId: string; from: number | null; to: number | null }[] = [];

      for (const line of dto.lines) {
        const item = itemByVariant.get(line.variantId);
        if (!item) throw new BadRequestException({ code: "NOT_ON_PURCHASE_ORDER", message: `Variant ${line.variantId} isn't on this purchase order` });
        const remaining = item.qtyOrdered - item.qtyReceived;
        if (line.quantity > remaining && !dto.allowOverReceipt) {
          throw new BadRequestException({ code: "OVER_RECEIPT", message: `Only ${Math.max(0, remaining)} left to receive for one line — tick "allow over-receipt" if the supplier sent extra`, details: { variantId: line.variantId, remaining } });
        }

        // Cost is per variant (not per location), so blend against the
        // variant's total on-hand across every location *before* this receipt.
        const [variant, onHandAgg] = await Promise.all([
          tx.productVariant.findUniqueOrThrow({ where: { id: line.variantId }, select: { costPrice: true } }),
          tx.inventoryLevel.aggregate({ where: { variantId: line.variantId }, _sum: { onHand: true } }),
        ]);
        const newCost = nextCostPrice(costMethod, onHandAgg._sum.onHand ?? 0, variant.costPrice, line.quantity, item.unitCost);
        if (newCost !== variant.costPrice) {
          await tx.productVariant.update({ where: { id: line.variantId }, data: { costPrice: newCost } });
          costChanges.push({ variantId: line.variantId, from: variant.costPrice, to: newCost });
        }

        movements.push(
          await this.inventory.applyMovementTx(tx, {
            variantId: line.variantId,
            locationId: po.locationId,
            quantity: line.quantity,
            reason: "purchase_receive",
            referenceType: "purchase_order",
            referenceId: po.id,
            note: dto.note ?? po.number,
            actor: actor.id,
          }),
        );
        await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { qtyReceived: { increment: line.quantity } } });
        item.qtyReceived += line.quantity;
      }

      // §16 M17: finished goods arriving on a production order use up raw
      // materials per their BOM. Same transaction, so a shortage rolls the
      // receipt back unless the receiver explicitly allows it.
      let materials: { consumed: { materialId: string; quantity: number }[]; shortages: { materialId: string; short: number }[]; withoutBom: string[] } | null = null;
      if (po.type === "production" && (await this.settings.getValue<boolean>("procurement.materials.autoConsume"))) {
        materials = await this.bom.consumeForProductionTx(tx, {
          lines: dto.lines,
          purchaseOrderId: po.id,
          purchaseOrderNumber: po.number,
          allowShortage: dto.allowMaterialShortage,
          actor: actor.id,
        });
      }

      const status = purchaseOrderStatusAfterReceive(po.items);
      await tx.purchaseOrder.update({ where: { id }, data: { status, ...(status === "received" ? { receivedAt: new Date() } : {}) } });
      return { status, costChanges, materials };
    });

    await this.inventory.afterMovementsCommitted(movements);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "purchase_order.receive", entityType: "purchase_order", entityId: id, after: { lines: dto.lines, status: result.status, costChanges: result.costChanges, materials: result.materials } });
    return this.get(id);
  }
}
