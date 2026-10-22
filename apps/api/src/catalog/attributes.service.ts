import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { slugify, uniqueSlug, t } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MediaUsageService } from "../media/media-usage.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateAttributeDto, CreateAttributeValueDto, UpdateAttributeDto, UpdateAttributeValueDto } from "./dto";

@Injectable()
export class AttributesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mediaUsage: MediaUsageService,
  ) {}

  async list() {
    return await this.prisma.attribute.findMany({ orderBy: [{ sortOrder: "asc" }], include: { values: { orderBy: [{ sortOrder: "asc" }] } } });
  }

  async get(id: string) {
    const attribute = await this.prisma.attribute.findUnique({ where: { id }, include: { values: { orderBy: [{ sortOrder: "asc" }] } } });
    if (!attribute) throw new NotFoundException("Attribute not found");
    return attribute;
  }

  async create(dto: CreateAttributeDto, actor: AuthenticatedStaff) {
    const existing = await this.prisma.attribute.findUnique({ where: { code: dto.code } });
    if (existing) throw new BadRequestException({ code: "ATTRIBUTE_CODE_TAKEN", message: `Attribute code "${dto.code}" already exists` });

    const attribute = await this.prisma.attribute.create({
      data: { code: dto.code, name: dto.name, type: dto.type, isFilterable: dto.isFilterable ?? true, isVisibleOnPdp: dto.isVisibleOnPdp ?? true, sortOrder: dto.sortOrder ?? 0 },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "attribute.create", entityType: "attribute", entityId: attribute.id, after: { code: dto.code, type: dto.type } });
    return attribute;
  }

  async update(id: string, dto: UpdateAttributeDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const attribute = await this.prisma.attribute.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.isFilterable !== undefined ? { isFilterable: dto.isFilterable } : {}),
        ...(dto.isVisibleOnPdp !== undefined ? { isVisibleOnPdp: dto.isVisibleOnPdp } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "attribute.update", entityType: "attribute", entityId: id, before: { name: before.name }, after: { name: attribute.name } });
    return attribute;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const usageCount = await this.prisma.productAttributeValue.count({ where: { attributeId: id } });
    if (usageCount > 0) throw new BadRequestException({ code: "ATTRIBUTE_IN_USE", message: "Remove it from products first" });
    await this.prisma.attribute.delete({ where: { id } });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "attribute.delete", entityType: "attribute", entityId: id, before: { code: before.code } });
  }

  async createValue(attributeId: string, dto: CreateAttributeValueDto, actor: AuthenticatedStaff) {
    await this.get(attributeId); // 404s if the attribute doesn't exist
    const base = slugify(dto.slug ?? t(dto.value, "en") ?? "", slugify(t(dto.value, "bn") ?? "")) || "value";
    const slug = await uniqueSlug(slugify(base), async (candidate) => {
      const existing = await this.prisma.attributeValue.findUnique({ where: { attributeId_slug: { attributeId, slug: candidate } } });
      return !!existing;
    });
    const value = await this.prisma.attributeValue.create({
      data: { attributeId, value: dto.value, slug, colorHex: dto.colorHex ?? null, imageMediaId: dto.imageMediaId ?? null, sortOrder: dto.sortOrder ?? 0 },
    });
    await this.mediaUsage.sync("attribute_value", value.id, [value.imageMediaId]);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "attribute_value.create", entityType: "attribute_value", entityId: value.id, after: { attributeId, slug } });
    return value;
  }

  async updateValue(attributeId: string, valueId: string, dto: UpdateAttributeValueDto, actor: AuthenticatedStaff) {
    const existing = await this.prisma.attributeValue.findUnique({ where: { id: valueId } });
    if (!existing || existing.attributeId !== attributeId) throw new NotFoundException("Attribute value not found");

    const value = await this.prisma.attributeValue.update({
      where: { id: valueId },
      data: {
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.colorHex !== undefined ? { colorHex: dto.colorHex } : {}),
        ...(dto.imageMediaId !== undefined ? { imageMediaId: dto.imageMediaId } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    await this.mediaUsage.sync("attribute_value", value.id, [value.imageMediaId]);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "attribute_value.update", entityType: "attribute_value", entityId: valueId, before: { value: existing.value }, after: { value: value.value } });
    return value;
  }

  async removeValue(attributeId: string, valueId: string, actor: AuthenticatedStaff) {
    const existing = await this.prisma.attributeValue.findUnique({ where: { id: valueId } });
    if (!existing || existing.attributeId !== attributeId) throw new NotFoundException("Attribute value not found");
    const usageCount = await this.prisma.productAttributeValue.count({ where: { attributeValueId: valueId } });
    if (usageCount > 0) throw new BadRequestException({ code: "ATTRIBUTE_VALUE_IN_USE", message: "Remove it from products first" });
    await this.prisma.attributeValue.delete({ where: { id: valueId } });
    await this.mediaUsage.clear("attribute_value", valueId);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "attribute_value.delete", entityType: "attribute_value", entityId: valueId, before: { value: existing.value } });
  }
}
