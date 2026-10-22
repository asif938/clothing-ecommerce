import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MediaUsageService } from "../media/media-usage.service";
import type { AuthenticatedStaff } from "../common/types";
import type { AddProductMediaDto, UpdateProductMediaDto } from "./dto";

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

@Injectable()
export class ProductMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mediaUsage: MediaUsageService,
  ) {}

  private async syncUsage(productId: string): Promise<void> {
    const rows = await this.prisma.productMedia.findMany({ where: { productId }, select: { mediaId: true } });
    await this.mediaUsage.sync("product", productId, rows.map((row) => row.mediaId));
  }

  async add(productId: string, dto: AddProductMediaDto, actor: AuthenticatedStaff) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new NotFoundException("Product not found");

    const position = dto.position ?? (await this.prisma.productMedia.count({ where: { productId } }));
    const entry = await this.prisma.productMedia.create({
      data: { productId, mediaId: dto.mediaId, optionValueId: dto.optionValueId ?? null, position, alt: toJsonInput(dto.alt) },
    });
    await this.syncUsage(productId);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_media.add", entityType: "product", entityId: productId, after: { mediaId: dto.mediaId } });
    return entry;
  }

  async update(productId: string, entryId: string, dto: UpdateProductMediaDto, actor: AuthenticatedStaff) {
    const existing = await this.prisma.productMedia.findUnique({ where: { id: entryId } });
    if (!existing || existing.productId !== productId) throw new NotFoundException("Product media entry not found");

    const entry = await this.prisma.productMedia.update({
      where: { id: entryId },
      data: {
        ...(dto.optionValueId !== undefined ? { optionValueId: dto.optionValueId } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.alt !== undefined ? { alt: toJsonInput(dto.alt) } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_media.update", entityType: "product", entityId: productId, after: { entryId } });
    return entry;
  }

  async remove(productId: string, entryId: string, actor: AuthenticatedStaff) {
    const existing = await this.prisma.productMedia.findUnique({ where: { id: entryId } });
    if (!existing || existing.productId !== productId) throw new NotFoundException("Product media entry not found");
    await this.prisma.productMedia.delete({ where: { id: entryId } });
    await this.syncUsage(productId);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_media.remove", entityType: "product", entityId: productId, before: { mediaId: existing.mediaId } });
  }
}
