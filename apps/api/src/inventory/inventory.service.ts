import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { AdjustStockDto, ListInventoryQueryDto, ListMovementsQueryDto } from "./dto";

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
    return { movement, level: updated };
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
