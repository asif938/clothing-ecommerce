import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import { MaterialsService } from "./materials.service";
import { effectiveBom, findShortages, totalRequirements, unitMaterialCost, type BomLineInput, type ProductionLine } from "./bom";
import type { RequirementsDto, SetBomDto } from "./dto";

type Db = Prisma.TransactionClient | PrismaService;

export interface ConsumeInput {
  /** Finished units received on the production order. */
  lines: { variantId: string; quantity: number }[];
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  /** When true, consume what is available instead of failing on a shortage. */
  allowShortage: boolean;
  actor: string;
}

/**
 * Bills of materials (docs/PROJECT_SPEC.md §16 M17): what each product (or a
 * single variant of it) consumes, what a production run needs, and — when
 * `procurement.materials.autoConsume` is on — deducting materials as
 * finished goods are received on a production order.
 */
@Injectable()
export class BomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly materials: MaterialsService,
  ) {}

  private async bomFor(db: Db, productIds: string[]): Promise<Map<string, BomLineInput[]>> {
    const items = await db.bomItem.findMany({ where: { productId: { in: productIds } }, select: { productId: true, variantId: true, materialId: true, quantity: true, wastagePercent: true } });
    const byProduct = new Map<string, BomLineInput[]>();
    for (const item of items) byProduct.set(item.productId, [...(byProduct.get(item.productId) ?? []), item]);
    return byProduct;
  }

  /** A product's BOM lines, plus the material cost of one finished unit for each variant. */
  async get(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, title: true, variants: { select: { id: true, sku: true, costPrice: true, isActive: true }, orderBy: { sku: "asc" } } },
    });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
    const lines = await this.prisma.bomItem.findMany({ where: { productId }, include: { material: { select: { id: true, sku: true, name: true, unit: true, costPrice: true, onHand: true } } }, orderBy: { createdAt: "asc" } });
    const costByMaterial = new Map(lines.map((l) => [l.materialId, l.material.costPrice]));
    const variantCosts = product.variants.map((variant) => {
      const materialCost = unitMaterialCost(effectiveBom(lines, variant.id), costByMaterial);
      return { variantId: variant.id, sku: variant.sku, isActive: variant.isActive, costPrice: variant.costPrice, materialCost, hasBom: effectiveBom(lines, variant.id).length > 0 };
    });
    return { product: { id: product.id, title: product.title }, lines, variants: variantCosts };
  }

  /** Replaces the whole BOM of a product. */
  async set(productId: string, dto: SetBomDto, actor: AuthenticatedStaff) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, variants: { select: { id: true } } } });
    if (!product) throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
    const variantIds = new Set(product.variants.map((v) => v.id));
    for (const line of dto.lines) {
      if (line.variantId !== null && !variantIds.has(line.variantId)) throw new BadRequestException({ code: "VARIANT_NOT_ON_PRODUCT", message: "A BOM line points at a variant that isn't on this product", details: { variantId: line.variantId } });
    }
    const materialIds = [...new Set(dto.lines.map((l) => l.materialId))];
    const found = await this.prisma.material.count({ where: { id: { in: materialIds }, isActive: true } });
    if (found !== materialIds.length) throw new BadRequestException({ code: "MATERIAL_INVALID", message: "Every BOM line needs an active material" });

    await this.prisma.$transaction(async (tx) => {
      await tx.bomItem.deleteMany({ where: { productId } });
      if (dto.lines.length > 0) await tx.bomItem.createMany({ data: dto.lines.map((l) => ({ productId, variantId: l.variantId, materialId: l.materialId, quantity: l.quantity, wastagePercent: l.wastagePercent, note: l.note ?? null })) });
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "bom.set", entityType: "product", entityId: productId, after: { lines: dto.lines } });
    return this.get(productId);
  }

  private async loadProduction(db: Db, items: { variantId: string; quantity: number }[]) {
    const variants = await db.productVariant.findMany({ where: { id: { in: items.map((i) => i.variantId) } }, select: { id: true, sku: true, productId: true } });
    if (variants.length !== items.length) throw new BadRequestException({ code: "VARIANT_NOT_FOUND", message: "One or more variants no longer exist" });
    const productById = new Map(variants.map((v) => [v.id, v]));
    const lines: ProductionLine[] = items.map((i) => ({ variantId: i.variantId, productId: productById.get(i.variantId)!.productId, units: i.quantity }));
    const bomByProduct = await this.bomFor(db, [...new Set(lines.map((l) => l.productId))]);
    return { lines, bomByProduct, skuById: new Map(variants.map((v) => [v.id, v.sku])) };
  }

  /** What a production run needs versus what's in stock, per material. */
  async requirements(dto: RequirementsDto) {
    return this.requirementsFor(this.prisma, dto.items);
  }

  async requirementsForPurchaseOrder(purchaseOrderId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: { id: true, number: true, type: true, items: { select: { variantId: true, qtyOrdered: true, qtyReceived: true } } } });
    if (!po) throw new NotFoundException({ code: "PURCHASE_ORDER_NOT_FOUND", message: "Purchase order not found" });
    const remaining = po.items.map((i) => ({ variantId: i.variantId, quantity: Math.max(0, i.qtyOrdered - i.qtyReceived) })).filter((i) => i.quantity > 0);
    if (remaining.length === 0) return { ...(await this.requirementsFor(this.prisma, [])), purchaseOrder: { id: po.id, number: po.number, type: po.type } };
    return { ...(await this.requirementsFor(this.prisma, remaining)), purchaseOrder: { id: po.id, number: po.number, type: po.type } };
  }

  private async requirementsFor(db: Db, items: { variantId: string; quantity: number }[]) {
    if (items.length === 0) return { rows: [], missingBom: [] as string[], totals: { shortMaterials: 0, estimatedCost: 0 } };
    const { lines, bomByProduct, skuById } = await this.loadProduction(db, items);
    const needed = totalRequirements(lines, bomByProduct);
    const materials = await db.material.findMany({ where: { id: { in: [...needed.keys()] } }, select: { id: true, sku: true, name: true, unit: true, onHand: true, costPrice: true } });
    const onHand = new Map(materials.map((m) => [m.id, m.onHand]));
    const shortById = new Map(findShortages(needed, onHand).map((s) => [s.materialId, s.short]));
    const rows = materials
      .map((m) => ({ materialId: m.id, sku: m.sku, name: m.name, unit: m.unit, needed: needed.get(m.id) ?? 0, onHand: m.onHand, short: shortById.get(m.id) ?? 0, estimatedCost: (needed.get(m.id) ?? 0) * m.costPrice }))
      .sort((a, b) => b.short - a.short || a.sku.localeCompare(b.sku));
    const missingBom = lines.filter((l) => effectiveBom(bomByProduct.get(l.productId) ?? [], l.variantId).length === 0).map((l) => skuById.get(l.variantId) ?? l.variantId);
    return { rows, missingBom, totals: { shortMaterials: rows.filter((r) => r.short > 0).length, estimatedCost: rows.reduce((a, r) => a + r.estimatedCost, 0) } };
  }

  /**
   * Deducts the BOM's materials for finished units just received on a
   * production order. Runs inside the receiving transaction, so a shortage
   * (unless `allowShortage`) rolls the whole receipt back. Variants with no
   * BOM consume nothing — they are reported so the caller can mention it.
   */
  async consumeForProductionTx(tx: Prisma.TransactionClient, input: ConsumeInput): Promise<{ consumed: { materialId: string; quantity: number }[]; shortages: { materialId: string; short: number }[]; withoutBom: string[] }> {
    const { lines, bomByProduct, skuById } = await this.loadProduction(tx, input.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })));
    const needed = totalRequirements(lines, bomByProduct);
    const withoutBom = lines.filter((l) => effectiveBom(bomByProduct.get(l.productId) ?? [], l.variantId).length === 0).map((l) => skuById.get(l.variantId) ?? l.variantId);
    if (needed.size === 0) return { consumed: [], shortages: [], withoutBom };

    const materials = await tx.material.findMany({ where: { id: { in: [...needed.keys()] } }, select: { id: true, sku: true, onHand: true } });
    const onHand = new Map(materials.map((m) => [m.id, m.onHand]));
    const shortages = findShortages(needed, onHand);
    if (shortages.length > 0 && !input.allowShortage) {
      const skuByMaterial = new Map(materials.map((m) => [m.id, m.sku]));
      throw new BadRequestException({
        code: "MATERIAL_SHORTAGE",
        message: "Not enough raw material for this receipt — restock the materials, or tick \"allow material shortage\" to consume what is available",
        details: { shortages: shortages.map((s) => ({ ...s, sku: skuByMaterial.get(s.materialId) })) },
      });
    }

    const consumed: { materialId: string; quantity: number }[] = [];
    for (const [materialId, qty] of needed) {
      const take = Math.min(qty, Math.max(0, onHand.get(materialId) ?? 0));
      if (take <= 0) continue;
      await this.materials.applyMovementTx(tx, {
        materialId,
        delta: -take,
        reason: "production_consume",
        referenceType: "purchase_order",
        referenceId: input.purchaseOrderId,
        note: take < qty ? `${input.purchaseOrderNumber} (short by ${qty - take})` : input.purchaseOrderNumber,
        actor: input.actor,
      });
      consumed.push({ materialId, quantity: take });
    }
    return { consumed, shortages: shortages.map((s) => ({ materialId: s.materialId, short: s.short })), withoutBom };
  }
}
