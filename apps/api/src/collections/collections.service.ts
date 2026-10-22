import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { slugify, uniqueSlug, t } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MediaUsageService } from "../media/media-usage.service";
import type { AuthenticatedStaff } from "../common/types";
import { buildProductWhereFromRules, type CollectionRules } from "./collection-rules";
import type { AddCollectionProductDto, CreateCollectionDto, ReorderCollectionProductsDto, UpdateCollectionDto } from "./dto";

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

const ENTITY_TYPE = "collection";

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mediaUsage: MediaUsageService,
  ) {}

  async list() {
    return await this.prisma.collection.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  }

  async get(id: string) {
    const collection = await this.prisma.collection.findUnique({ where: { id } });
    if (!collection || collection.deletedAt) throw new NotFoundException("Collection not found");
    return collection;
  }

  async getWithProducts(id: string) {
    const collection = await this.get(id);
    if (collection.type === "manual") {
      const items = await this.prisma.collectionProduct.findMany({ where: { collectionId: id }, orderBy: { position: "asc" }, include: { product: true } });
      return { ...collection, products: items.map((item) => item.product) };
    }
    if (!collection.rules) return { ...collection, products: [] };
    const products = await this.prisma.product.findMany({ where: buildProductWhereFromRules(collection.rules as unknown as CollectionRules), take: 200 });
    return { ...collection, products };
  }

  async previewCount(rules: CollectionRules) {
    const count = await this.prisma.product.count({ where: buildProductWhereFromRules(rules) });
    return { count };
  }

  private async resolveSlug(name: unknown, requested: string | undefined, selfId?: string): Promise<string> {
    const localizedName = name as Parameters<typeof t>[0];
    const base = slugify(requested ?? t(localizedName, "en") ?? "", slugify(t(localizedName, "bn") ?? "")) || "collection";
    return await uniqueSlug(slugify(base), async (candidate) => {
      const existing = await this.prisma.collection.findUnique({ where: { slug: candidate } });
      return !!existing && existing.id !== selfId;
    });
  }

  async create(dto: CreateCollectionDto, actor: AuthenticatedStaff) {
    const slug = await this.resolveSlug(dto.name, dto.slug);
    const collection = await this.prisma.collection.create({
      data: {
        name: dto.name,
        slug,
        description: toJsonInput(dto.description),
        imageMediaId: dto.imageMediaId ?? null,
        bannerMediaId: dto.bannerMediaId ?? null,
        type: dto.type ?? "manual",
        rules: toJsonInput(dto.rules),
        sortMode: dto.sortMode ?? "manual",
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ?? null,
        endsAt: dto.endsAt ?? null,
        seoTitle: toJsonInput(dto.seoTitle),
        seoDescription: toJsonInput(dto.seoDescription),
      },
    });
    await this.mediaUsage.sync(ENTITY_TYPE, collection.id, [collection.imageMediaId, collection.bannerMediaId]);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "collection.create", entityType: ENTITY_TYPE, entityId: collection.id, after: { name: dto.name, slug } });
    return collection;
  }

  async update(id: string, dto: UpdateCollectionDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    const slug = dto.slug !== undefined ? await this.resolveSlug(dto.name ?? before.name, dto.slug, id) : undefined;

    const collection = await this.prisma.collection.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(dto.description !== undefined ? { description: toJsonInput(dto.description) } : {}),
        ...(dto.imageMediaId !== undefined ? { imageMediaId: dto.imageMediaId } : {}),
        ...(dto.bannerMediaId !== undefined ? { bannerMediaId: dto.bannerMediaId } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.rules !== undefined ? { rules: toJsonInput(dto.rules) } : {}),
        ...(dto.sortMode !== undefined ? { sortMode: dto.sortMode } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt } : {}),
        ...(dto.seoTitle !== undefined ? { seoTitle: toJsonInput(dto.seoTitle) } : {}),
        ...(dto.seoDescription !== undefined ? { seoDescription: toJsonInput(dto.seoDescription) } : {}),
      },
    });
    await this.mediaUsage.sync(ENTITY_TYPE, collection.id, [collection.imageMediaId, collection.bannerMediaId]);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "collection.update", entityType: ENTITY_TYPE, entityId: id, before: { name: before.name }, after: { name: collection.name } });
    return collection;
  }

  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    await this.prisma.collection.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.mediaUsage.clear(ENTITY_TYPE, id);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "collection.delete", entityType: ENTITY_TYPE, entityId: id, before: { name: before.name } });
  }

  async addProduct(collectionId: string, dto: AddCollectionProductDto, actor: AuthenticatedStaff) {
    const collection = await this.get(collectionId);
    if (collection.type !== "manual") throw new BadRequestException({ code: "NOT_MANUAL", message: "Only manual collections take explicit product membership" });

    const position = dto.position ?? (await this.prisma.collectionProduct.count({ where: { collectionId } }));
    const entry = await this.prisma.collectionProduct.upsert({
      where: { collectionId_productId: { collectionId, productId: dto.productId } },
      create: { collectionId, productId: dto.productId, position },
      update: { position },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "collection_product.add", entityType: ENTITY_TYPE, entityId: collectionId, after: { productId: dto.productId } });
    return entry;
  }

  async removeProduct(collectionId: string, productId: string, actor: AuthenticatedStaff) {
    await this.prisma.collectionProduct.delete({ where: { collectionId_productId: { collectionId, productId } } }).catch(() => {
      throw new NotFoundException("Not in this collection");
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "collection_product.remove", entityType: ENTITY_TYPE, entityId: collectionId, before: { productId } });
  }

  /** Drag-sort (docs/PROJECT_SPEC.md §8.2 "manual (drag-sort products)"). */
  async reorderProducts(collectionId: string, dto: ReorderCollectionProductsDto, actor: AuthenticatedStaff) {
    await this.get(collectionId);
    await this.prisma.$transaction(
      dto.productIds.map((productId, position) =>
        this.prisma.collectionProduct.update({ where: { collectionId_productId: { collectionId, productId } }, data: { position } }),
      ),
    );
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "collection_product.reorder", entityType: ENTITY_TYPE, entityId: collectionId, after: { order: dto.productIds } });
  }
}
