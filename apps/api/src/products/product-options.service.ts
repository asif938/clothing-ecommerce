import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MediaUsageService } from "../media/media-usage.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateProductOptionDto, CreateProductOptionValueDto, UpdateProductOptionDto, UpdateProductOptionValueDto } from "./dto";

@Injectable()
export class ProductOptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mediaUsage: MediaUsageService,
  ) {}

  private async assertProductExists(productId: string): Promise<void> {
    const exists = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!exists) throw new NotFoundException("Product not found");
  }

  async createOption(productId: string, dto: CreateProductOptionDto, actor: AuthenticatedStaff) {
    await this.assertProductExists(productId);
    const option = await this.prisma.productOption.create({
      data: {
        productId,
        name: dto.name,
        type: dto.type,
        sizeSystemId: dto.sizeSystemId ?? null,
        position: dto.position ?? 0,
        values: {
          create: (dto.values ?? []).map((value, index) => ({
            value: value.value,
            colorHex: value.colorHex ?? null,
            swatchImageMediaId: value.swatchImageMediaId ?? null,
            position: value.position ?? index,
          })),
        },
      },
      include: { values: true },
    });
    for (const value of option.values) {
      if (value.swatchImageMediaId) await this.mediaUsage.sync("product_option_value", value.id, [value.swatchImageMediaId]);
    }
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_option.create", entityType: "product_option", entityId: option.id, after: { productId, name: dto.name } });
    return option;
  }

  async updateOption(productId: string, optionId: string, dto: UpdateProductOptionDto, actor: AuthenticatedStaff) {
    const existing = await this.prisma.productOption.findUnique({ where: { id: optionId } });
    if (!existing || existing.productId !== productId) throw new NotFoundException("Option not found");

    const option = await this.prisma.productOption.update({
      where: { id: optionId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.sizeSystemId !== undefined ? { sizeSystemId: dto.sizeSystemId } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_option.update", entityType: "product_option", entityId: optionId, before: { name: existing.name }, after: { name: option.name } });
    return option;
  }

  async removeOption(productId: string, optionId: string, actor: AuthenticatedStaff) {
    const existing = await this.prisma.productOption.findUnique({ where: { id: optionId }, include: { values: true } });
    if (!existing || existing.productId !== productId) throw new NotFoundException("Option not found");

    const usedInVariant = await this.prisma.productVariant.findFirst({
      where: { productId, optionValueIds: { hasSome: existing.values.map((v) => v.id) } },
    });
    if (usedInVariant) throw new BadRequestException({ code: "OPTION_IN_USE", message: "Remove the variants using this option first" });

    await this.prisma.productOption.delete({ where: { id: optionId } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_option.delete", entityType: "product_option", entityId: optionId, before: { name: existing.name } });
  }

  async createValue(productId: string, optionId: string, dto: CreateProductOptionValueDto, actor: AuthenticatedStaff) {
    const option = await this.prisma.productOption.findUnique({ where: { id: optionId } });
    if (!option || option.productId !== productId) throw new NotFoundException("Option not found");

    const value = await this.prisma.productOptionValue.create({
      data: { productOptionId: optionId, value: dto.value, colorHex: dto.colorHex ?? null, swatchImageMediaId: dto.swatchImageMediaId ?? null, position: dto.position ?? 0 },
    });
    await this.mediaUsage.sync("product_option_value", value.id, [value.swatchImageMediaId]);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_option_value.create", entityType: "product_option_value", entityId: value.id, after: { optionId } });
    return value;
  }

  async updateValue(productId: string, optionId: string, valueId: string, dto: UpdateProductOptionValueDto, actor: AuthenticatedStaff) {
    const existing = await this.prisma.productOptionValue.findUnique({ where: { id: valueId } });
    if (!existing || existing.productOptionId !== optionId) throw new NotFoundException("Option value not found");

    const value = await this.prisma.productOptionValue.update({
      where: { id: valueId },
      data: {
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.colorHex !== undefined ? { colorHex: dto.colorHex } : {}),
        ...(dto.swatchImageMediaId !== undefined ? { swatchImageMediaId: dto.swatchImageMediaId } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
      },
    });
    await this.mediaUsage.sync("product_option_value", value.id, [value.swatchImageMediaId]);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_option_value.update", entityType: "product_option_value", entityId: valueId, before: { value: existing.value }, after: { value: value.value } });
    return value;
  }

  async removeValue(productId: string, optionId: string, valueId: string, actor: AuthenticatedStaff) {
    const existing = await this.prisma.productOptionValue.findUnique({ where: { id: valueId } });
    if (!existing || existing.productOptionId !== optionId) throw new NotFoundException("Option value not found");

    const usedInVariant = await this.prisma.productVariant.findFirst({ where: { productId, optionValueIds: { has: valueId } } });
    if (usedInVariant) throw new BadRequestException({ code: "OPTION_VALUE_IN_USE", message: "Remove the variants using this value first" });

    await this.prisma.productOptionValue.delete({ where: { id: valueId } });
    await this.mediaUsage.clear("product_option_value", valueId);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product_option_value.delete", entityType: "product_option_value", entityId: valueId, before: { value: existing.value } });
  }
}
