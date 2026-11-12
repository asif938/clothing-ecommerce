import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotifyMeService } from "../notify-me/notify-me.service";
import type { AuthenticatedStaff } from "../common/types";
import type { Prisma, StockMovementReason } from "@clothing/db";
import type { AdjustStockDto, ListInventoryQueryDto, ListMovementsQueryDto } from "./dto";

/** One stock change applied inside a caller's transaction (M12 transfers, stock takes, purchase receiving). */
export interface StockMovementInput {
  variantId: string;
  locationId: string;
  /** Signed: + adds stock, − removes it. */
  quantity: number;
  reason: StockMovementReason;
  referenceType?: string;
  referenceId?: string;
  note?: string | null;
  actor?: string | null;
  /** For decrements: require *available* (on hand − reserved) to cover it, not just on hand — so moving stock away never strands an order's reservation. */
  requireAvailable?: boolean;
}

export interface StockMovementResult {
  variantId: string;
  onHandBefore: number;
  onHandAfter: number;
  /** True when this movement took the level from not-available to available (back-in-stock trigger). */
  becameAvailable: boolean;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifyMe: NotifyMeService,
  ) {}

  /** Called whenever a new variant is created (manual or via the matrix generator/import) — every variant always has a level row at every active location, defaulting to zero on hand. */
  async ensureLevelsForVariant(variantId: string): Promise<void> {
    const locations = await this.prisma.stockLocation.findMany({ where: { isActive: true } });
    for (const location of locations) {
      await this.prisma.inventoryLevel.upsert({
        where: { variantId_locationId: { variantId, locationId: location.id } },
        create: { variantId, locationId: location.id },
        update: {},
      });
    }
  }

  async list(query: ListInventoryQueryDto) {
    const levels = await this.prisma.inventoryLevel.findMany({
      where: {
        ...(query.variantId ? { variantId: query.variantId } : {}),
        ...(query.locationId ? { locationId: query.locationId } : {}),
      },
      include: { variant: { include: { product: { select: { title: true, slug: true } } } }, location: true },
      orderBy: [{ updatedAt: "desc" }],
    });
    const filtered = query.lowStockOnly ? levels.filter((level) => level.lowStockThreshold !== null && level.available <= level.lowStockThreshold) : levels;
    return filtered;
  }

  async lowStock() {
    return await this.list({ lowStockOnly: true });
  }

  async setLowStockThreshold(variantId: string, locationId: string, lowStockThreshold: number | null, actor: AuthenticatedStaff) {
    const level = await this.prisma.inventoryLevel.update({ where: { variantId_locationId: { variantId, locationId } }, data: { lowStockThreshold } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "inventory_level.threshold", entityType: "inventory_level", entityId: level.id, after: { lowStockThreshold } });
    return level;
  }

  async adjust(dto: AdjustStockDto, actor: AuthenticatedStaff) {
    const level = await this.prisma.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId: dto.variantId, locationId: dto.locationId } } });
    if (!level) throw new BadRequestException({ code: "LEVEL_NOT_FOUND", message: "No inventory level for this variant at this location" });
    if (level.onHand + dto.quantityDelta < 0) {
      throw new BadRequestException({ code: "INSUFFICIENT_STOCK", message: `Only ${level.onHand} on hand` });
    }

    const [movement, updated] = await this.prisma.$transaction([
      this.prisma.stockMovement.create({
        data: { variantId: dto.variantId, locationId: dto.locationId, quantity: dto.quantityDelta, reason: dto.reason, note: dto.note ?? null, actor: actor.id },
      }),
      this.prisma.inventoryLevel.update({ where: { id: level.id }, data: { onHand: { increment: dto.quantityDelta } } }),
    ]);

    await this.audit.record({
      actorType: "staff",
      actorId: actor.id,
      action: "inventory.adjust",
      entityType: "inventory_level",
      entityId: level.id,
      before: { onHand: level.onHand },
      after: { onHand: updated.onHand, quantityDelta: dto.quantityDelta, reason: dto.reason },
    });

    // Milestone 10 (§16 M10) — fires the "back in stock" notify-me sequence
    // the moment this exact level crosses from out-of-stock to available
    // again; a decrease, or a level that was already available, is a no-op.
    if (level.available <= 0 && updated.available > 0) {
      await this.notifyMe.fulfillForVariant(dto.variantId);
    }
    return { movement, level: updated };
  }

  /**
   * The single write path for M12's multi-line stock operations. Must run
   * inside the caller's `$transaction` so a multi-line document is
   * all-or-nothing. Decrements use a conditional `updateMany` (on hand —
   * or available — must cover the quantity) so two concurrent operations
   * can't drive stock negative between a read and a write.
   */
  async applyMovementTx(tx: Prisma.TransactionClient, input: StockMovementInput): Promise<StockMovementResult> {
    if (input.quantity === 0) throw new BadRequestException({ code: "ZERO_QUANTITY", message: "Quantity must not be zero" });
    const before = await tx.inventoryLevel.upsert({
      where: { variantId_locationId: { variantId: input.variantId, locationId: input.locationId } },
      create: { variantId: input.variantId, locationId: input.locationId },
      update: {},
    });

    if (input.quantity < 0) {
      const needed = -input.quantity;
      const guard = input.requireAvailable ? { available: { gte: needed } } : { onHand: { gte: needed } };
      const { count } = await tx.inventoryLevel.updateMany({ where: { id: before.id, ...guard }, data: { onHand: { increment: input.quantity } } });
      if (count === 0) {
        throw new BadRequestException({
          code: "INSUFFICIENT_STOCK",
          message: `Not enough stock for ${input.variantId}: ${input.requireAvailable ? before.available : before.onHand} ${input.requireAvailable ? "available" : "on hand"}, ${needed} needed`,
          details: { variantId: input.variantId, locationId: input.locationId },
        });
      }
    } else {
      await tx.inventoryLevel.update({ where: { id: before.id }, data: { onHand: { increment: input.quantity } } });
    }
    const after = await tx.inventoryLevel.findUniqueOrThrow({ where: { id: before.id } });

    await tx.stockMovement.create({
      data: {
        variantId: input.variantId,
        locationId: input.locationId,
        quantity: input.quantity,
        reason: input.reason,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        note: input.note ?? null,
        actor: input.actor ?? null,
      },
    });

    return { variantId: input.variantId, onHandBefore: before.onHand, onHandAfter: after.onHand, becameAvailable: before.available <= 0 && after.available > 0 };
  }

  /** Fires M10's back-in-stock sequence for every variant a committed batch of movements made available again. Call *after* the transaction commits. */
  async afterMovementsCommitted(results: StockMovementResult[]): Promise<void> {
    const variantIds = new Set(results.filter((r) => r.becameAvailable).map((r) => r.variantId));
    for (const variantId of variantIds) await this.notifyMe.fulfillForVariant(variantId);
  }

  async listMovements(query: ListMovementsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where = {
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { variant: { select: { sku: true, productId: true } }, location: { select: { name: true } } },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async barcodeLabels(variantIds: string[]) {
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: { select: { title: true } } },
    });
    return variants.map((variant) => ({
      variantId: variant.id,
      sku: variant.sku,
      barcode: variant.barcode ?? variant.sku,
      title: variant.product.title,
      price: variant.price,
    }));
  }
}
