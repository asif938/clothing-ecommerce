import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { createWithDocumentNumber } from "../common/document-number";
import type { AuthenticatedStaff } from "../common/types";
import { InventoryService, type StockMovementResult } from "./inventory.service";
import type { CreateTransferDto, ListTransfersQueryDto, ReceiveTransferDto, UpdateTransferDto } from "./operations.dto";

const INCLUDE = {
  fromLocation: { select: { id: true, name: true } },
  toLocation: { select: { id: true, name: true } },
  items: { include: { variant: { select: { id: true, sku: true, barcode: true, product: { select: { id: true, title: true } } } } }, orderBy: { id: "asc" as const } },
} satisfies Prisma.StockTransferInclude;

/**
 * Stock transfers between locations (docs/PROJECT_SPEC.md §5.4, §8.2
 * Inventory, §16 M12): draft → in_transit (dispatch: `transfer_out` at the
 * source, which must have the units *available*) → received (`transfer_in`
 * at the destination). Receiving fewer than were sent records the shortfall
 * on the line and in the audit log — those units left the source and never
 * arrived, which is exactly what a staff member needs to chase. Cancelling
 * an in-transit transfer returns everything to the source.
 */
@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  async list(query: ListTransfersQueryDto) {
    const transfers = await this.prisma.stockTransfer.findMany({
      where: query.status ? { status: query.status } : {},
      include: { fromLocation: { select: { id: true, name: true } }, toLocation: { select: { id: true, name: true } }, items: { select: { quantity: true, quantityReceived: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return transfers.map(({ items, ...t }) => ({ ...t, units: items.reduce((a, i) => a + i.quantity, 0), unitsReceived: items.reduce((a, i) => a + i.quantityReceived, 0) }));
  }

  async get(id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id }, include: INCLUDE });
    if (!transfer) throw new NotFoundException({ code: "TRANSFER_NOT_FOUND", message: "Transfer not found" });
    return transfer;
  }

  private async assertLocations(...ids: string[]) {
    const count = await this.prisma.stockLocation.count({ where: { id: { in: ids }, isActive: true } });
    if (count !== new Set(ids).size) throw new BadRequestException({ code: "LOCATION_INVALID", message: "Choose active stock locations" });
  }

  async create(dto: CreateTransferDto, actor: AuthenticatedStaff) {
    await this.assertLocations(dto.fromLocationId, dto.toLocationId);
    const transfer = await createWithDocumentNumber(
      "TR",
      async (head) => (await this.prisma.stockTransfer.findFirst({ where: { number: { startsWith: head } }, orderBy: { number: "desc" }, select: { number: true } }))?.number ?? null,
      (number) =>
        this.prisma.stockTransfer.create({
          data: { number, fromLocationId: dto.fromLocationId, toLocationId: dto.toLocationId, note: dto.note ?? null, createdBy: actor.id, items: { create: dto.items } },
          include: INCLUDE,
        }),
    );
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "stock_transfer.create", entityType: "stock_transfer", entityId: transfer.id, after: dto });
    return transfer;
  }

  async update(id: string, dto: UpdateTransferDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    if (before.status !== "draft") throw new BadRequestException({ code: "TRANSFER_NOT_DRAFT", message: "Only a draft transfer can be edited" });
    await this.prisma.$transaction(async (tx) => {
      if (dto.items) {
        await tx.stockTransferItem.deleteMany({ where: { transferId: id } });
        await tx.stockTransferItem.createMany({ data: dto.items.map((item) => ({ ...item, transferId: id })) });
      }
      if (dto.note !== undefined) await tx.stockTransfer.update({ where: { id }, data: { note: dto.note } });
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "stock_transfer.update", entityType: "stock_transfer", entityId: id, after: dto });
    return this.get(id);
  }

  async dispatch(id: string, actor: AuthenticatedStaff) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.stockTransfer.updateMany({ where: { id, status: "draft" }, data: { status: "in_transit", shippedAt: new Date() } });
      if (count === 0) throw new BadRequestException({ code: "TRANSFER_NOT_DRAFT", message: "Only a draft transfer can be dispatched" });
      const transfer = await tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: { items: true } });
      for (const item of transfer.items) {
        await this.inventory.applyMovementTx(tx, {
          variantId: item.variantId,
          locationId: transfer.fromLocationId,
          quantity: -item.quantity,
          reason: "transfer_out",
          referenceType: "stock_transfer",
          referenceId: id,
          note: transfer.number,
          actor: actor.id,
          requireAvailable: true,
        });
      }
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "stock_transfer.dispatch", entityType: "stock_transfer", entityId: id });
    return this.get(id);
  }

  async receive(id: string, dto: ReceiveTransferDto, actor: AuthenticatedStaff) {
    const movements: StockMovementResult[] = [];
    const shortfalls: { variantId: string; sent: number; received: number }[] = [];
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.stockTransfer.updateMany({ where: { id, status: "in_transit" }, data: { status: "received", receivedAt: new Date() } });
      if (count === 0) throw new BadRequestException({ code: "TRANSFER_NOT_IN_TRANSIT", message: "Only an in-transit transfer can be received" });
      const transfer = await tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: { items: true } });
      const requested = new Map((dto.lines ?? []).map((l) => [l.variantId, l.quantity]));
      for (const variantId of requested.keys()) {
        if (!transfer.items.some((i) => i.variantId === variantId)) throw new BadRequestException({ code: "NOT_ON_TRANSFER", message: `Variant ${variantId} isn't on this transfer` });
      }
      for (const item of transfer.items) {
        const received = requested.get(item.variantId) ?? item.quantity;
        if (received > item.quantity) throw new BadRequestException({ code: "OVER_RECEIPT", message: "You can't receive more than was sent", details: { variantId: item.variantId } });
        if (received < item.quantity) shortfalls.push({ variantId: item.variantId, sent: item.quantity, received });
        await tx.stockTransferItem.update({ where: { id: item.id }, data: { quantityReceived: received } });
        if (received === 0) continue;
        movements.push(
          await this.inventory.applyMovementTx(tx, {
            variantId: item.variantId,
            locationId: transfer.toLocationId,
            quantity: received,
            reason: "transfer_in",
            referenceType: "stock_transfer",
            referenceId: id,
            note: dto.note ?? transfer.number,
            actor: actor.id,
          }),
        );
      }
    });
    await this.inventory.afterMovementsCommitted(movements);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "stock_transfer.receive", entityType: "stock_transfer", entityId: id, after: { shortfalls, note: dto.note ?? null } });
    return this.get(id);
  }

  async cancel(id: string, actor: AuthenticatedStaff) {
    const movements: StockMovementResult[] = [];
    await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: { items: true } });
      if (!transfer) throw new NotFoundException({ code: "TRANSFER_NOT_FOUND", message: "Transfer not found" });
      const { count } = await tx.stockTransfer.updateMany({ where: { id, status: { in: ["draft", "in_transit"] } }, data: { status: "cancelled" } });
      if (count === 0) throw new BadRequestException({ code: "TRANSFER_CLOSED", message: "This transfer can no longer be cancelled" });
      if (transfer.status !== "in_transit") return;
      for (const item of transfer.items) {
        movements.push(
          await this.inventory.applyMovementTx(tx, {
            variantId: item.variantId,
            locationId: transfer.fromLocationId,
            quantity: item.quantity,
            reason: "transfer_in",
            referenceType: "stock_transfer",
            referenceId: id,
            note: `${transfer.number} cancelled — returned to source`,
            actor: actor.id,
          }),
        );
      }
    });
    await this.inventory.afterMovementsCommitted(movements);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "stock_transfer.cancel", entityType: "stock_transfer", entityId: id });
    return this.get(id);
  }
}
