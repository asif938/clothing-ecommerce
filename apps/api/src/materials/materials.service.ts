import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { MaterialMovementReason, Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { isUniqueViolation } from "../common/document-number";
import { nextCostPrice } from "../inventory/stock-math";
import type { AuthenticatedStaff } from "../common/types";
import type { AdjustMaterialDto, CreateMaterialDto, ListMaterialsQueryDto, ReceiveMaterialDto, UpdateMaterialDto } from "./dto";

export interface MaterialMovementInput {
  materialId: string;
  /** Positive adds stock, negative removes it. */
  delta: number;
  reason: MaterialMovementReason;
  unitCost?: number | null;
  referenceType?: string;
  referenceId?: string;
  note?: string | null;
  actor?: string | null;
}

/**
 * Raw materials and their stock ledger (docs/PROJECT_SPEC.md §8.2 Inventory
 * "materials & BOM", §16 M17). Every change to `onHand` goes through
 * `applyMovementTx`, which writes the ledger row in the same transaction and
 * refuses to take stock below zero — so the ledger always explains the
 * balance (the same discipline as finished-goods stock, M2).
 */
@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async list(query: ListMaterialsQueryDto) {
    const materials = await this.prisma.material.findMany({
      where: {
        ...(query.includeInactive === "true" ? {} : { isActive: true }),
        ...(query.q ? { OR: [{ sku: { contains: query.q, mode: "insensitive" } }, { name: { path: ["en"], string_contains: query.q } }, { name: { path: ["bn"], string_contains: query.q } }] } : {}),
      },
      include: { supplier: { select: { id: true, name: true } }, _count: { select: { bomItems: true } } },
      orderBy: [{ isActive: "desc" }, { sku: "asc" }],
      take: 500,
    });
    const rows = materials.map(({ _count, ...m }) => ({ ...m, bomLineCount: _count.bomItems, low: m.reorderPoint > 0 && m.onHand <= m.reorderPoint, stockValue: m.onHand * m.costPrice }));
    return query.lowStock === "true" ? rows.filter((r) => r.low) : rows;
  }

  async get(id: string) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true } },
        movements: { orderBy: { createdAt: "desc" }, take: 100 },
        bomItems: { include: { product: { select: { id: true, title: true } }, variant: { select: { id: true, sku: true } } }, take: 200 },
      },
    });
    if (!material) throw new NotFoundException({ code: "MATERIAL_NOT_FOUND", message: "Material not found" });
    return material;
  }

  private async assertSupplier(supplierId: string | null | undefined) {
    if (!supplierId) return;
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { isActive: true } });
    if (!supplier?.isActive) throw new BadRequestException({ code: "SUPPLIER_INVALID", message: "Choose an active supplier" });
  }

  async create(dto: CreateMaterialDto, actor: AuthenticatedStaff) {
    await this.assertSupplier(dto.supplierId);
    try {
      const material = await this.prisma.$transaction(async (tx) => {
        const created = await tx.material.create({
          data: { sku: dto.sku, name: dto.name, unit: dto.unit, costPrice: dto.costPrice, reorderPoint: dto.reorderPoint, supplierId: dto.supplierId ?? null, notes: dto.notes ?? null },
        });
        if (dto.openingQuantity > 0) {
          await this.applyMovementTx(tx, { materialId: created.id, delta: dto.openingQuantity, reason: "opening", unitCost: dto.costPrice, note: "Opening stock", actor: actor.id });
        }
        return created;
      });
      await this.audit.record({ actorType: "staff", actorId: actor.id, action: "material.create", entityType: "material", entityId: material.id, after: { sku: material.sku, openingQuantity: dto.openingQuantity } });
      return this.get(material.id);
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException({ code: "MATERIAL_SKU_TAKEN", message: "A material with this SKU already exists" });
      throw error;
    }
  }

  async update(id: string, dto: UpdateMaterialDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    await this.assertSupplier(dto.supplierId);
    await this.prisma.material.update({ where: { id }, data: dto });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "material.update", entityType: "material", entityId: id, before: { name: before.name, costPrice: before.costPrice, reorderPoint: before.reorderPoint, isActive: before.isActive }, after: dto });
    return this.get(id);
  }

  /** A material that was never used is deleted; one with history or BOM lines is only deactivated. */
  async remove(id: string, actor: AuthenticatedStaff) {
    const material = await this.get(id);
    const inUse = material.bomItems.length > 0 || material.movements.filter((m) => m.reason !== "opening").length > 0;
    if (inUse) {
      await this.prisma.material.update({ where: { id }, data: { isActive: false } });
      await this.audit.record({ actorType: "staff", actorId: actor.id, action: "material.deactivate", entityType: "material", entityId: id });
      return { deleted: false, deactivated: true };
    }
    await this.prisma.material.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "material.delete", entityType: "material", entityId: id, before: { sku: material.sku } });
    return { deleted: true, deactivated: false };
  }

  /**
   * Books a delivery of material: stock goes up and the unit cost is blended
   * per `procurement.costMethod` (same setting as finished goods).
   */
  async receive(id: string, dto: ReceiveMaterialDto, actor: AuthenticatedStaff) {
    const costMethod = await this.settings.getValue<"weighted_average" | "last_cost" | "none">("procurement.costMethod");
    await this.prisma.$transaction(async (tx) => {
      const material = await tx.material.findUnique({ where: { id }, select: { onHand: true, costPrice: true, isActive: true } });
      if (!material) throw new NotFoundException({ code: "MATERIAL_NOT_FOUND", message: "Material not found" });
      if (!material.isActive) throw new BadRequestException({ code: "MATERIAL_INACTIVE", message: "This material is inactive" });
      const cost = nextCostPrice(costMethod, material.onHand, material.costPrice, dto.quantity, dto.unitCost) ?? material.costPrice;
      if (cost !== material.costPrice) await tx.material.update({ where: { id }, data: { costPrice: cost } });
      await this.applyMovementTx(tx, { materialId: id, delta: dto.quantity, reason: "purchase_receive", unitCost: dto.unitCost, note: dto.note ?? null, actor: actor.id });
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "material.receive", entityType: "material", entityId: id, after: dto });
    return this.get(id);
  }

  async adjust(id: string, dto: AdjustMaterialDto, actor: AuthenticatedStaff) {
    await this.prisma.$transaction((tx) => this.applyMovementTx(tx, { materialId: id, delta: dto.delta, reason: "adjustment", note: dto.note, actor: actor.id }));
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "material.adjust", entityType: "material", entityId: id, after: dto });
    return this.get(id);
  }

  /** The only writer of `onHand`. Throws `MATERIAL_SHORTAGE` rather than going negative. */
  async applyMovementTx(tx: Prisma.TransactionClient, input: MaterialMovementInput): Promise<{ onHandAfter: number }> {
    if (input.delta === 0) throw new BadRequestException({ code: "ZERO_MOVEMENT", message: "A stock movement can't be zero" });
    if (input.delta < 0) {
      const { count } = await tx.material.updateMany({ where: { id: input.materialId, onHand: { gte: -input.delta } }, data: { onHand: { increment: input.delta } } });
      if (count === 0) {
        const exists = await tx.material.findUnique({ where: { id: input.materialId }, select: { onHand: true } });
        if (!exists) throw new NotFoundException({ code: "MATERIAL_NOT_FOUND", message: "Material not found" });
        throw new BadRequestException({ code: "MATERIAL_SHORTAGE", message: "Not enough material in stock", details: { materialId: input.materialId, onHand: exists.onHand, needed: -input.delta } });
      }
    } else {
      const { count } = await tx.material.updateMany({ where: { id: input.materialId }, data: { onHand: { increment: input.delta } } });
      if (count === 0) throw new NotFoundException({ code: "MATERIAL_NOT_FOUND", message: "Material not found" });
    }
    const { onHand } = await tx.material.findUniqueOrThrow({ where: { id: input.materialId }, select: { onHand: true } });
    await tx.materialMovement.create({
      data: {
        materialId: input.materialId,
        delta: input.delta,
        onHandAfter: onHand,
        unitCost: input.unitCost ?? null,
        reason: input.reason,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        note: input.note ?? null,
        actor: input.actor ?? null,
      },
    });
    return { onHandAfter: onHand };
  }
}
