import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { createWithDocumentNumber } from "../common/document-number";
import type { AuthenticatedStaff } from "../common/types";
import { InventoryService, type StockMovementResult } from "./inventory.service";
import { stockTakeAdjustment, summarizeStockTake } from "./stock-math";
import type { ApplyStockTakeDto, CountLinesDto, CreateStockTakeDto, ListStockTakesQueryDto, ScanDto } from "./operations.dto";

/**
 * Stock takes (docs/PROJECT_SPEC.md §5.4, §8.2 Inventory "count sheet, scan,
 * variance report, apply", §16 M12). Starting a count snapshots each
 * variant's on-hand as `expectedQty`; staff type counts or scan barcodes;
 * applying books a `stock_take` movement of (counted − expected) per line
 * — see `stockTakeAdjustment` for why the snapshot, not live on-hand, is
 * the baseline.
 */
@Injectable()
export class StockTakesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  async list(query: ListStockTakesQueryDto) {
    const takes = await this.prisma.stockTake.findMany({
      where: query.status ? { status: query.status } : {},
      include: { location: { select: { id: true, name: true } }, _count: { select: { lines: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return takes.map(({ _count, ...take }) => ({ ...take, lineCount: _count.lines }));
  }

  /** The count sheet + variance report in one payload. */
  async get(id: string) {
    const take = await this.prisma.stockTake.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, name: true } },
        lines: {
          include: { variant: { select: { id: true, sku: true, barcode: true, costPrice: true, product: { select: { id: true, title: true } } } } },
          orderBy: { variant: { sku: "asc" } },
        },
      },
    });
    if (!take) throw new NotFoundException({ code: "STOCK_TAKE_NOT_FOUND", message: "Stock take not found" });
    const summary = summarizeStockTake(take.lines.map((l) => ({ expectedQty: l.expectedQty, countedQty: l.countedQty, costPrice: l.variant.costPrice })));
    return {
      ...take,
      lines: take.lines.map((l) => ({ ...l, variance: l.countedQty === null ? null : l.countedQty - l.expectedQty })),
      summary,
    };
  }

  async create(dto: CreateStockTakeDto, actor: AuthenticatedStaff) {
    const location = await this.prisma.stockLocation.findUnique({ where: { id: dto.locationId } });
    if (!location || !location.isActive) throw new BadRequestException({ code: "LOCATION_INVALID", message: "Choose an active stock location" });
    const open = await this.prisma.stockTake.findFirst({ where: { locationId: dto.locationId, status: "counting" }, select: { number: true } });
    if (open) throw new BadRequestException({ code: "STOCK_TAKE_OPEN", message: `Stock take ${open.number} is already counting at this location — apply or cancel it first` });

    const levels = await this.prisma.inventoryLevel.findMany({
      where: { locationId: dto.locationId, ...(dto.productIds?.length ? { variant: { productId: { in: dto.productIds } } } : {}) },
      select: { variantId: true, onHand: true },
    });
    if (levels.length === 0) throw new BadRequestException({ code: "NOTHING_TO_COUNT", message: "No variants to count at this location" });

    const take = await createWithDocumentNumber(
      "ST",
      async (head) => (await this.prisma.stockTake.findFirst({ where: { number: { startsWith: head } }, orderBy: { number: "desc" }, select: { number: true } }))?.number ?? null,
      (number) =>
        this.prisma.stockTake.create({
          data: { number, locationId: dto.locationId, note: dto.note ?? null, createdBy: actor.id, lines: { create: levels.map((l) => ({ variantId: l.variantId, expectedQty: l.onHand })) } },
        }),
    );
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "stock_take.create", entityType: "stock_take", entityId: take.id, after: { locationId: dto.locationId, lines: levels.length, productIds: dto.productIds ?? null } });
    return this.get(take.id);
  }

  private async assertCounting(id: string) {
    const take = await this.prisma.stockTake.findUnique({ where: { id }, select: { status: true, locationId: true } });
    if (!take) throw new NotFoundException({ code: "STOCK_TAKE_NOT_FOUND", message: "Stock take not found" });
    if (take.status !== "counting") throw new BadRequestException({ code: "STOCK_TAKE_CLOSED", message: "This stock take is no longer counting" });
    return take;
  }

  /** Sets counts from the count sheet (null clears a count). */
  async count(id: string, dto: CountLinesDto, actor: AuthenticatedStaff) {
    await this.assertCounting(id);
    await this.prisma.$transaction(
      dto.lines.map((line) =>
        this.prisma.stockTakeLine.updateMany({ where: { stockTakeId: id, variantId: line.variantId }, data: { countedQty: line.countedQty, countedAt: line.countedQty === null ? null : new Date() } }),
      ),
    );
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "stock_take.count", entityType: "stock_take", entityId: id, after: { lines: dto.lines.length } });
    return this.get(id);
  }

  /**
   * Scanner mode: each scan of a barcode/SKU adds `quantity` (default 1) to
   * that line's count. A variant that wasn't on the sheet (e.g. found on the
   * wrong shelf) is added with its current on-hand as the expected figure.
   */
  async scan(id: string, dto: ScanDto, actor: AuthenticatedStaff) {
    const take = await this.assertCounting(id);
    const variant = await this.prisma.productVariant.findFirst({ where: { OR: [{ barcode: dto.code }, { sku: dto.code }] }, select: { id: true, sku: true, product: { select: { title: true } } } });
    if (!variant) throw new NotFoundException({ code: "VARIANT_NOT_FOUND", message: `No product with barcode or SKU "${dto.code}"` });

    let line = await this.prisma.stockTakeLine.findUnique({ where: { stockTakeId_variantId: { stockTakeId: id, variantId: variant.id } } });
    if (!line) {
      const level = await this.prisma.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId: variant.id, locationId: take.locationId } }, select: { onHand: true } });
      line = await this.prisma.stockTakeLine.create({ data: { stockTakeId: id, variantId: variant.id, expectedQty: level?.onHand ?? 0 } });
    }
    const countedQty = Math.max(0, (line.countedQty ?? 0) + dto.quantity);
    const updated = await this.prisma.stockTakeLine.update({ where: { id: line.id }, data: { countedQty, countedAt: new Date() } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "stock_take.scan", entityType: "stock_take", entityId: id, after: { variantId: variant.id, quantity: dto.quantity, countedQty } });
    return { variantId: variant.id, sku: variant.sku, title: variant.product.title, expectedQty: updated.expectedQty, countedQty: updated.countedQty };
  }

  async apply(id: string, dto: ApplyStockTakeDto, actor: AuthenticatedStaff) {
    const movements: StockMovementResult[] = [];
    const adjustments: { variantId: string; variance: number; delta: number }[] = [];
    await this.prisma.$transaction(async (tx) => {
      // Claim it first so two people pressing "apply" can't both book movements.
      const { count } = await tx.stockTake.updateMany({ where: { id, status: "counting" }, data: { status: "applied", appliedBy: actor.id, appliedAt: new Date() } });
      if (count === 0) throw new BadRequestException({ code: "STOCK_TAKE_CLOSED", message: "This stock take is no longer counting" });
      const take = await tx.stockTake.findUniqueOrThrow({ where: { id }, include: { lines: true } });

      for (const line of take.lines) {
        const counted = line.countedQty ?? (dto.zeroUncounted ? 0 : null);
        if (counted === null) continue;
        if (line.countedQty === null) await tx.stockTakeLine.update({ where: { id: line.id }, data: { countedQty: 0, countedAt: new Date() } });
        if (counted === line.expectedQty) continue;
        const level = await tx.inventoryLevel.findUnique({ where: { variantId_locationId: { variantId: line.variantId, locationId: take.locationId } }, select: { onHand: true } });
        const { variance, delta } = stockTakeAdjustment(line.expectedQty, counted, level?.onHand ?? 0);
        adjustments.push({ variantId: line.variantId, variance, delta });
        if (delta === 0) continue;
        movements.push(
          await this.inventory.applyMovementTx(tx, {
            variantId: line.variantId,
            locationId: take.locationId,
            quantity: delta,
            reason: "stock_take",
            referenceType: "stock_take",
            referenceId: id,
            note: take.number,
            actor: actor.id,
          }),
        );
      }
    });
    await this.inventory.afterMovementsCommitted(movements);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "stock_take.apply", entityType: "stock_take", entityId: id, after: { zeroUncounted: dto.zeroUncounted, adjustments } });
    return this.get(id);
  }

  async cancel(id: string, actor: AuthenticatedStaff) {
    const { count } = await this.prisma.stockTake.updateMany({ where: { id, status: "counting" }, data: { status: "cancelled" } });
    if (count === 0) throw new BadRequestException({ code: "STOCK_TAKE_CLOSED", message: "This stock take is no longer counting" });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "stock_take.cancel", entityType: "stock_take", entityId: id });
    return this.get(id);
  }
}
