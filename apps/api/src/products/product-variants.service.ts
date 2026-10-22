import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { slugify } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { InventoryService } from "../inventory/inventory.service";
import type { AuthenticatedStaff } from "../common/types";
import type { BulkUpdateVariantsDto, UpdateVariantDto } from "./dto";
import { generateVariantCombinations } from "./variant-matrix";

@Injectable()
export class ProductVariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  private async uniqueSku(base: string): Promise<string> {
    let candidate = base;
    let suffix = 2;
    while (await this.prisma.productVariant.findUnique({ where: { sku: candidate } })) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  /**
   * "Options & variant matrix generator" (docs/PROJECT_SPEC.md §8.2
   * Catalog): builds every combination of the product's current options'
   * values that doesn't already have a variant, and creates it. Existing
   * variants (and their price/stock/barcode) are left untouched — this is
   * additive, so re-running it after adding a new color only creates the
   * new combinations. Zero options → exactly one ("free size") variant.
   */
  async generateMatrix(productId: string, actor: AuthenticatedStaff) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { options: { orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" } } } }, variants: true },
    });
    if (!product) throw new NotFoundException("Product not found");

    const combinations = generateVariantCombinations(product.options.map((option) => ({ id: option.id, values: option.values })));
    const existingSets = product.variants.map((variant) => new Set(variant.optionValueIds));
    const toCreate = combinations.filter((combo) => !existingSets.some((set) => set.size === combo.length && combo.every((id) => set.has(id))));

    const skuBase = slugify(product.slug).toUpperCase();
    const created = [];
    for (const [index, combo] of toCreate.entries()) {
      const sku = await this.uniqueSku(`${skuBase}-${product.variants.length + index + 1}`);
      const variant = await this.prisma.productVariant.create({
        data: { productId, sku, optionValueIds: combo, price: 0, position: product.variants.length + index, isActive: true },
      });
      await this.inventory.ensureLevelsForVariant(variant.id);
      created.push(variant);
    }

    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_variant.generate_matrix", entityType: "product", entityId: productId, after: { createdCount: created.length } });
    return await this.prisma.productVariant.findMany({ where: { productId }, orderBy: { position: "asc" } });
  }

  async update(productId: string, variantId: string, dto: UpdateVariantDto, actor: AuthenticatedStaff) {
    const existing = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!existing || existing.productId !== productId) throw new NotFoundException("Variant not found");

    if (dto.sku && dto.sku !== existing.sku) {
      const taken = await this.prisma.productVariant.findUnique({ where: { sku: dto.sku } });
      if (taken) throw new BadRequestException({ code: "SKU_TAKEN", message: `SKU "${dto.sku}" is already in use` });
    }
    if (dto.barcode && dto.barcode !== existing.barcode) {
      const taken = await this.prisma.productVariant.findUnique({ where: { barcode: dto.barcode } });
      if (taken) throw new BadRequestException({ code: "BARCODE_TAKEN", message: `Barcode "${dto.barcode}" is already in use` });
    }

    const variant = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.compareAtPrice !== undefined ? { compareAtPrice: dto.compareAtPrice } : {}),
        ...(dto.costPrice !== undefined ? { costPrice: dto.costPrice } : {}),
        ...(dto.weightGrams !== undefined ? { weightGrams: dto.weightGrams } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_variant.update", entityType: "product_variant", entityId: variantId, before: { price: existing.price }, after: { price: variant.price } });
    return variant;
  }

  /** "Bulk-fill column" (docs/PROJECT_SPEC.md §8.2) — set one field across several variants at once, e.g. the same price for every size of a color. */
  async bulkUpdate(productId: string, dto: BulkUpdateVariantsDto, actor: AuthenticatedStaff) {
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: dto.variantIds }, productId } });
    if (variants.length !== dto.variantIds.length) throw new BadRequestException({ code: "VARIANT_NOT_FOUND", message: "One or more variants don't belong to this product" });

    switch (dto.field) {
      case "price":
        await this.prisma.productVariant.updateMany({ where: { id: { in: dto.variantIds } }, data: { price: dto.value } });
        break;
      case "compareAtPrice":
        await this.prisma.productVariant.updateMany({ where: { id: { in: dto.variantIds } }, data: { compareAtPrice: dto.value } });
        break;
      case "costPrice":
        await this.prisma.productVariant.updateMany({ where: { id: { in: dto.variantIds } }, data: { costPrice: dto.value } });
        break;
      case "weightGrams":
        await this.prisma.productVariant.updateMany({ where: { id: { in: dto.variantIds } }, data: { weightGrams: dto.value } });
        break;
      case "isActive":
        await this.prisma.productVariant.updateMany({ where: { id: { in: dto.variantIds } }, data: { isActive: dto.value } });
        break;
    }
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_variant.bulk_update", entityType: "product", entityId: productId, after: { field: dto.field, value: dto.value, count: variants.length } });
    return await this.prisma.productVariant.findMany({ where: { id: { in: dto.variantIds } } });
  }

  async remove(productId: string, variantId: string, actor: AuthenticatedStaff) {
    const existing = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!existing || existing.productId !== productId) throw new NotFoundException("Variant not found");
    await this.prisma.productVariant.delete({ where: { id: variantId } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_variant.delete", entityType: "product_variant", entityId: variantId, before: { sku: existing.sku } });
  }
}
