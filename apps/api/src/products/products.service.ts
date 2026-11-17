import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type ProductStatus } from "@clothing/db";
import { slugify, uniqueSlug, t } from "@clothing/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MediaUsageService } from "../media/media-usage.service";
import type { AuthenticatedStaff } from "../common/types";
import type { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from "./dto";

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

export const PRODUCT_INCLUDE = {
  category: true,
  sizeChart: true,
  additionalCategories: { include: { category: true } },
  attributeValues: { include: { attribute: true, attributeValue: true } },
  options: { orderBy: { position: "asc" as const }, include: { values: { orderBy: { position: "asc" as const } }, sizeSystem: true } },
  variants: { orderBy: { position: "asc" as const } },
  media: { orderBy: { position: "asc" as const }, include: { media: true } },
  relationsFrom: { orderBy: { position: "asc" as const }, include: { relatedProduct: true } },
} satisfies Prisma.ProductInclude;

/** Entity type for `media_usages` rows covering a product's gallery — synced from ProductMediaService, not here (one media row can be used by several ProductMedia entries). */
const ENTITY_TYPE = "product";

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mediaUsage: MediaUsageService,
  ) {}

  async list(query: ListProductsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.q
        ? { OR: [{ title: { path: ["en"], string_contains: query.q } }, { title: { path: ["bn"], string_contains: query.q } }, { tags: { has: query.q } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: true, variants: { select: { id: true, price: true, isActive: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
    if (!product || product.deletedAt) throw new NotFoundException("Product not found");
    return product;
  }

  private async resolveSlug(title: unknown, requested: string | undefined, selfId?: string): Promise<string> {
    const localizedTitle = title as Parameters<typeof t>[0];
    const base = slugify(requested ?? t(localizedTitle, "en") ?? "", slugify(t(localizedTitle, "bn") ?? "")) || "product";
    return await uniqueSlug(slugify(base), async (candidate) => {
      const existing = await this.prisma.product.findUnique({ where: { slug: candidate } });
      return !!existing && existing.id !== selfId;
    });
  }

  private async syncAdditionalCategories(productId: string, categoryIds: string[] | undefined): Promise<void> {
    if (categoryIds === undefined) return;
    await this.prisma.productCategory.deleteMany({ where: { productId } });
    for (const categoryId of categoryIds) {
      await this.prisma.productCategory.create({ data: { productId, categoryId } });
    }
  }

  private async syncAttributeValues(productId: string, values: CreateProductDto["attributeValues"]): Promise<void> {
    if (values === undefined) return;
    await this.prisma.productAttributeValue.deleteMany({ where: { productId } });
    for (const value of values) {
      await this.prisma.productAttributeValue.create({
        data: { productId, attributeId: value.attributeId, attributeValueId: value.attributeValueId ?? null, valueText: value.valueText ?? null, valueNumber: value.valueNumber ?? null },
      });
    }
  }

  async create(dto: CreateProductDto, actor: AuthenticatedStaff) {
    const slug = await this.resolveSlug(dto.title, dto.slug);
    const product = await this.prisma.product.create({
      data: {
        title: dto.title,
        slug,
        subtitle: toJsonInput(dto.subtitle),
        description: toJsonInput(dto.description),
        shortDescription: toJsonInput(dto.shortDescription),
        categoryId: dto.categoryId ?? null,
        brandLabel: toJsonInput(dto.brandLabel),
        tags: dto.tags ?? [],
        status: dto.status ?? "draft",
        publishedAt: dto.publishedAt ?? null,
        unpublishAt: dto.unpublishAt ?? null,
        productType: dto.productType ?? "standard",
        sizeChartId: dto.sizeChartId ?? null,
        careInstructions: toJsonInput(dto.careInstructions),
        fabric: toJsonInput(dto.fabric),
        modelInfo: toJsonInput(dto.modelInfo),
        videoUrl: dto.videoUrl ?? null,
        seoTitle: toJsonInput(dto.seoTitle),
        seoDescription: toJsonInput(dto.seoDescription),
        isFeatured: dto.isFeatured ?? false,
        sortWeight: dto.sortWeight ?? 0,
        requiresShipping: dto.requiresShipping ?? true,
        weightGramsDefault: dto.weightGramsDefault ?? null,
        hsCode: dto.hsCode ?? null,
        preorderReleaseDate: dto.preorderReleaseDate ?? null,
        preorderLimit: dto.preorderLimit ?? null,
        bundleDiscountType: dto.bundleDiscountType ?? "none",
        bundleDiscountValue: dto.bundleDiscountValue ?? null,
      },
    });
    await this.syncAdditionalCategories(product.id, dto.additionalCategoryIds);
    await this.syncAttributeValues(product.id, dto.attributeValues);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product.create", entityType: ENTITY_TYPE, entityId: product.id, after: { title: dto.title, slug } });
    return await this.get(product.id);
  }

  async update(id: string, dto: UpdateProductDto, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    await this.snapshotVersion(before, actor.id);

    const slug = dto.slug !== undefined ? await this.resolveSlug(dto.title ?? before.title, dto.slug, id) : undefined;

    await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(dto.subtitle !== undefined ? { subtitle: toJsonInput(dto.subtitle) } : {}),
        ...(dto.description !== undefined ? { description: toJsonInput(dto.description) } : {}),
        ...(dto.shortDescription !== undefined ? { shortDescription: toJsonInput(dto.shortDescription) } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.brandLabel !== undefined ? { brandLabel: toJsonInput(dto.brandLabel) } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.publishedAt !== undefined ? { publishedAt: dto.publishedAt } : {}),
        ...(dto.unpublishAt !== undefined ? { unpublishAt: dto.unpublishAt } : {}),
        ...(dto.productType !== undefined ? { productType: dto.productType } : {}),
        ...(dto.sizeChartId !== undefined ? { sizeChartId: dto.sizeChartId } : {}),
        ...(dto.careInstructions !== undefined ? { careInstructions: toJsonInput(dto.careInstructions) } : {}),
        ...(dto.fabric !== undefined ? { fabric: toJsonInput(dto.fabric) } : {}),
        ...(dto.modelInfo !== undefined ? { modelInfo: toJsonInput(dto.modelInfo) } : {}),
        ...(dto.videoUrl !== undefined ? { videoUrl: dto.videoUrl } : {}),
        ...(dto.seoTitle !== undefined ? { seoTitle: toJsonInput(dto.seoTitle) } : {}),
        ...(dto.seoDescription !== undefined ? { seoDescription: toJsonInput(dto.seoDescription) } : {}),
        ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
        ...(dto.sortWeight !== undefined ? { sortWeight: dto.sortWeight } : {}),
        ...(dto.requiresShipping !== undefined ? { requiresShipping: dto.requiresShipping } : {}),
        ...(dto.weightGramsDefault !== undefined ? { weightGramsDefault: dto.weightGramsDefault } : {}),
        ...(dto.hsCode !== undefined ? { hsCode: dto.hsCode } : {}),
        ...(dto.preorderReleaseDate !== undefined ? { preorderReleaseDate: dto.preorderReleaseDate } : {}),
        ...(dto.preorderLimit !== undefined ? { preorderLimit: dto.preorderLimit } : {}),
        ...(dto.bundleDiscountType !== undefined ? { bundleDiscountType: dto.bundleDiscountType } : {}),
        ...(dto.bundleDiscountValue !== undefined ? { bundleDiscountValue: dto.bundleDiscountValue } : {}),
      },
    });
    await this.syncAdditionalCategories(id, dto.additionalCategoryIds);
    await this.syncAttributeValues(id, dto.attributeValues);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product.update", entityType: ENTITY_TYPE, entityId: id, before: { title: before.title }, after: { title: dto.title ?? before.title } });
    return await this.get(id);
  }

  /** Soft delete (golden rule, §8.1 "deletes are soft where possible"). */
  async remove(id: string, actor: AuthenticatedStaff) {
    const before = await this.get(id);
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date(), status: "archived" } });
    await this.mediaUsage.clear(ENTITY_TYPE, id);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product.delete", entityType: ENTITY_TYPE, entityId: id, before: { title: before.title } });
  }

  /**
   * Soft-deletes each product through `remove` — the same media-usage
   * cleanup and one audit entry per product as a single delete. One product
   * failing (e.g. already gone) doesn't stop the rest; failures come back
   * by id so the list can say which ones were left.
   */
  async removeMany(ids: string[], actor: AuthenticatedStaff): Promise<{ deleted: number; failed: { id: string; message: string }[] }> {
    let deleted = 0;
    const failed: { id: string; message: string }[] = [];
    for (const id of new Set(ids)) {
      try {
        await this.remove(id, actor);
        deleted += 1;
      } catch (error) {
        failed.push({ id, message: error instanceof Error ? error.message : "Delete failed" });
      }
    }
    return { deleted, failed };
  }

  async snapshotVersion(product: { id: string }, createdBy: string): Promise<void> {
    // Round-trip through JSON so Date objects etc. become plain JSON-safe
    // values before they hit the Json column (Prisma's Json input type
    // requires that; it won't serialize a Date for you).
    const snapshot = JSON.parse(JSON.stringify(product)) as Prisma.InputJsonValue;
    await this.prisma.productVersion.create({ data: { productId: product.id, snapshot, createdBy } });
  }

  async listVersions(productId: string) {
    return await this.prisma.productVersion.findMany({ where: { productId }, orderBy: { createdAt: "desc" }, take: 50 });
  }

  async restoreVersion(productId: string, versionId: string, actor: AuthenticatedStaff) {
    const version = await this.prisma.productVersion.findUnique({ where: { id: versionId } });
    if (!version || version.productId !== productId) throw new NotFoundException("Version not found");

    const current = await this.get(productId);
    await this.snapshotVersion(current, actor.id);

    const snapshot = version.snapshot as Record<string, unknown>;
    await this.prisma.product.update({
      where: { id: productId },
      data: {
        // `title` is required (never DbNull) — the snapshot always had one.
        title: (snapshot.title ?? {}) as Prisma.InputJsonValue,
        subtitle: toJsonInput(snapshot.subtitle),
        description: toJsonInput(snapshot.description),
        shortDescription: toJsonInput(snapshot.shortDescription),
        seoTitle: toJsonInput(snapshot.seoTitle),
        seoDescription: toJsonInput(snapshot.seoDescription),
        tags: Array.isArray(snapshot.tags) ? (snapshot.tags as string[]) : [],
      },
    });
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "product.version.restore", entityType: ENTITY_TYPE, entityId: productId, after: { versionId } });
    return await this.get(productId);
  }

  /**
   * Recurring sweep (registered on SchedulerService, docs/PROJECT_SPEC.md
   * §5.3 "scheduled/published_at/unpublish_at"): flips `scheduled` products
   * live once `publishedAt` arrives, and takes `active` products down once
   * `unpublishAt` arrives. Runs every tick (SchedulerService.runDueTasks) —
   * cheap, idempotent, no job row of its own.
   */
  async runPublishSweep(): Promise<void> {
    const now = new Date();
    const toPublish = await this.prisma.product.updateMany({
      where: { status: "scheduled", publishedAt: { lte: now }, deletedAt: null },
      data: { status: "active" as ProductStatus },
    });
    const toUnpublish = await this.prisma.product.updateMany({
      where: { status: "active", unpublishAt: { lte: now }, deletedAt: null },
      data: { status: "archived" as ProductStatus },
    });
    if (toPublish.count > 0 || toUnpublish.count > 0) {
      await this.audit.record({ actorType: "system", action: "product.publish_sweep", entityType: ENTITY_TYPE, after: { published: toPublish.count, unpublished: toUnpublish.count } });
    }
  }
}
