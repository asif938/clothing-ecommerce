import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { AddBundleItemDto, UpdateBundleItemDto } from "./dto";

/** §16 M10 "shop-the-look bundles" — one `BundleItem` row per component variant, scoped to a bundle-type `Product` (not enforced here; the admin UI only shows this tab for `productType === "bundle"`, same soft-enforcement pattern as every other product-editor tab). */
@Injectable()
export class BundleItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(bundleProductId: string) {
    return this.prisma.bundleItem.findMany({
      where: { bundleProductId },
      orderBy: { position: "asc" },
      include: { componentProduct: { select: { title: true, slug: true } }, componentVariant: { select: { sku: true, price: true, optionValueIds: true, isActive: true } } },
    });
  }

  async add(bundleProductId: string, dto: AddBundleItemDto, actor: AuthenticatedStaff) {
    if (dto.componentProductId === bundleProductId) throw new BadRequestException({ code: "SELF_REFERENCE", message: "A bundle cannot contain itself" });
    const variant = await this.prisma.productVariant.findUnique({ where: { id: dto.componentVariantId } });
    if (!variant || variant.productId !== dto.componentProductId) throw new NotFoundException("Variant not found for that product");

    const item = await this.prisma.bundleItem.create({
      data: { bundleProductId, componentProductId: dto.componentProductId, componentVariantId: dto.componentVariantId, quantity: dto.quantity ?? 1, position: dto.position ?? 0 },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "bundle_item.add", entityType: "product", entityId: bundleProductId, after: { componentVariantId: dto.componentVariantId } });
    return item;
  }

  async update(bundleProductId: string, itemId: string, dto: UpdateBundleItemDto, actor: AuthenticatedStaff) {
    const existing = await this.prisma.bundleItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.bundleProductId !== bundleProductId) throw new NotFoundException("Bundle item not found");
    const item = await this.prisma.bundleItem.update({ where: { id: itemId }, data: { ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}), ...(dto.position !== undefined ? { position: dto.position } : {}) } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "bundle_item.update", entityType: "product", entityId: bundleProductId, after: dto });
    return item;
  }

  async remove(bundleProductId: string, itemId: string, actor: AuthenticatedStaff) {
    const existing = await this.prisma.bundleItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.bundleProductId !== bundleProductId) throw new NotFoundException("Bundle item not found");
    await this.prisma.bundleItem.delete({ where: { id: itemId } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "bundle_item.remove", entityType: "product", entityId: bundleProductId, before: { componentVariantId: existing.componentVariantId } });
  }
}
