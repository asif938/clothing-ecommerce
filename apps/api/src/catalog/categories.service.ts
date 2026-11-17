import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { slugify, uniqueSlug, t } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MediaUsageService } from "../media/media-usage.service";
import { MediaProvidersService } from "../media/media-providers.service";
import type { MediaVariantMap } from "../media/media-driver";
import { getMediaUrl } from "@clothing/shared/media";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateCategoryDto, UpdateCategoryDto } from "./dto";

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

const ENTITY_TYPE = "category";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mediaUsage: MediaUsageService,
    private readonly mediaProviders: MediaProvidersService,
  ) {}

  /** Every category, with a thumbnail URL for its own image so the admin list can show it. */
  async list() {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    const imageIds = categories.map((c) => c.imageMediaId).filter((id): id is string => !!id);
    const images = imageIds.length > 0 ? await this.prisma.media.findMany({ where: { id: { in: imageIds }, deletedAt: null } }) : [];
    const urlById = new Map<string, string>();
    for (const media of images) {
      const driver = await this.mediaProviders.resolveDriverForAsset(media);
      const ref = driver.toMediaRef({ ...media, variants: media.variants as MediaVariantMap | null });
      urlById.set(media.id, getMediaUrl(ref, { width: 240 }));
    }
    return categories.map((category) => ({ ...category, imageUrl: category.imageMediaId ? urlById.get(category.imageMediaId) ?? null : null }));
  }

  async get(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category || category.deletedAt) throw new NotFoundException("Category not found");
    return category;
  }

  private async resolveSlug(name: unknown, requested: string | undefined, selfId?: string): Promise<string> {
    const localizedName = name as Parameters<typeof t>[0];
    const base = slugify(requested ?? t(localizedName, "en") ?? "", slugify(t(localizedName, "bn") ?? "")) || "category";
    return await uniqueSlug(slugify(base), async (candidate) => {
      const existing = await this.prisma.category.findUnique({ where: { slug: candidate } });
      return !!existing && existing.id !== selfId;
    });
  }

  private async assertNoCycle(id: string, newParentId: string | null): Promise<void> {
    if (!newParentId) return;
    if (newParentId === id) throw new BadRequestException({ code: "CATEGORY_CYCLE", message: "A category cannot be its own parent" });
    let current: string | null = newParentId;
    const seen = new Set<string>();
    while (current) {
      if (current === id) throw new BadRequestException({ code: "CATEGORY_CYCLE", message: "Cannot move a category under its own descendant" });
      if (seen.has(current)) break;
      seen.add(current);
      const parent: { parentId: string | null } | null = await this.prisma.category.findUnique({ where: { id: current }, select: { parentId: true } });
      current = parent?.parentId ?? null;
    }
  }

  async create(dto: CreateCategoryDto, actor: AuthenticatedStaff) {
    const slug = await this.resolveSlug(dto.name, dto.slug);
    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug,
        parentId: dto.parentId ?? null,
        description: toJsonInput(dto.description),
        imageMediaId: dto.imageMediaId ?? null,
        bannerMediaId: dto.bannerMediaId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        seoTitle: toJsonInput(dto.seoTitle),
        seoDescription: toJsonInput(dto.seoDescription),
        sizeChartId: dto.sizeChartId ?? null,
        attributeIds: dto.attributeIds ?? [],
      },
    });
    await this.mediaUsage.sync(ENTITY_TYPE, category.id, [category.imageMediaId, category.bannerMediaId]);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "category.create", entityType: ENTITY_TYPE, entityId: category.id, after: { name: dto.name, slug } });
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);

    if (dto.parentId !== undefined) await this.assertNoCycle(id, dto.parentId);
    // Slug only changes on an explicit rename — renaming the title alone
    // must not silently break existing links into this category.
    const slug = dto.slug !== undefined ? await this.resolveSlug(dto.name ?? before.name, dto.slug, id) : undefined;

    const category = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.description !== undefined ? { description: toJsonInput(dto.description) } : {}),
        ...(dto.imageMediaId !== undefined ? { imageMediaId: dto.imageMediaId } : {}),
        ...(dto.bannerMediaId !== undefined ? { bannerMediaId: dto.bannerMediaId } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.seoTitle !== undefined ? { seoTitle: toJsonInput(dto.seoTitle) } : {}),
        ...(dto.seoDescription !== undefined ? { seoDescription: toJsonInput(dto.seoDescription) } : {}),
        ...(dto.sizeChartId !== undefined ? { sizeChartId: dto.sizeChartId } : {}),
        ...(dto.attributeIds !== undefined ? { attributeIds: dto.attributeIds } : {}),
      },
    });
    await this.mediaUsage.sync(ENTITY_TYPE, category.id, [category.imageMediaId, category.bannerMediaId]);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "category.update", entityType: ENTITY_TYPE, entityId: id, before: { name: before.name, slug: before.slug }, after: { name: category.name, slug: category.slug } });
    return category;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const [childCount, productCount] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id, deletedAt: null } }),
      this.prisma.product.count({ where: { categoryId: id, deletedAt: null } }),
    ]);
    if (childCount > 0 || productCount > 0) {
      throw new BadRequestException({ code: "CATEGORY_IN_USE", message: "Move or remove its subcategories and products first" });
    }
    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.mediaUsage.clear(ENTITY_TYPE, id);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "category.delete", entityType: ENTITY_TYPE, entityId: id, before: { name: before.name } });
  }
}
