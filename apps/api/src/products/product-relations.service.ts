import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedStaff } from "../common/types";
import type { AddProductRelationDto } from "./dto";

@Injectable()
export class ProductRelationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async add(productId: string, dto: AddProductRelationDto, actor: AuthenticatedStaff) {
    if (dto.relatedProductId === productId) throw new BadRequestException({ code: "SELF_RELATION", message: "A product cannot relate to itself" });
    const [product, related] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } }),
      this.prisma.product.findUnique({ where: { id: dto.relatedProductId }, select: { id: true } }),
    ]);
    if (!product || !related) throw new NotFoundException("Product not found");

    const relation = await this.prisma.productRelation.upsert({
      where: { productId_relatedProductId_type: { productId, relatedProductId: dto.relatedProductId, type: dto.type } },
      create: { productId, relatedProductId: dto.relatedProductId, type: dto.type, position: dto.position ?? 0 },
      update: { position: dto.position ?? 0 },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_relation.add", entityType: "product", entityId: productId, after: { relatedProductId: dto.relatedProductId, type: dto.type } });
    return relation;
  }

  async remove(productId: string, relationId: string, actor: AuthenticatedStaff) {
    const existing = await this.prisma.productRelation.findUnique({ where: { id: relationId } });
    if (!existing || existing.productId !== productId) throw new NotFoundException("Relation not found");
    await this.prisma.productRelation.delete({ where: { id: relationId } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_relation.remove", entityType: "product", entityId: productId, before: { relatedProductId: existing.relatedProductId } });
  }
}
