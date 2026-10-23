import { Injectable } from "@nestjs/common";
import { Prisma, type Media } from "@clothing/db";
import { getMediaUrl } from "@clothing/shared/media";
import { PrismaService } from "../prisma/prisma.service";
import { MediaProvidersService } from "../media/media-providers.service";
import type { MediaVariantMap } from "../media/media-driver";

const CARD_IMAGE_WIDTH = 480;

export interface CategoryCard {
  id: string;
  slug: string;
  name: unknown;
  imageUrl: string | null;
}

export interface ProductCard {
  id: string;
  slug: string;
  title: unknown;
  imageUrl: string | null;
  priceFrom: number;
  compareAtFrom: number | null;
}

export interface ListProductsQuery {
  source: "manual" | "category" | "collection" | "tag" | "new_arrivals" | "best_sellers" | "on_sale";
  sourceId?: string;
  productIds?: string[];
  limit: number;
}

/**
 * Minimal public read endpoints the CMS block system needs
 * (`category_tiles`, `product_grid` — docs/PROJECT_SPEC.md §9.1) to show
 * live catalog data on the home page. This is deliberately NOT the full
 * filterable/faceted storefront catalog experience (facets, sort,
 * pagination) — that's Milestone 4's job; this only returns card-sized
 * data for a block to render.
 */
@Injectable()
export class StoreCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaProviders: MediaProvidersService,
  ) {}

  private async resolveImageUrl(media: Media | null): Promise<string | null> {
    if (!media) return null;
    const driver = await this.mediaProviders.resolveDriverForAsset(media);
    const ref = driver.toMediaRef({ ...media, variants: media.variants as MediaVariantMap | null });
    return getMediaUrl(ref, { width: CARD_IMAGE_WIDTH });
  }

  async listCategories(ids: string[]): Promise<CategoryCard[]> {
    if (ids.length === 0) return [];
    const categories = await this.prisma.category.findMany({
      where: { id: { in: ids }, isActive: true, deletedAt: null },
    });
    const imageIds = categories.map((c) => c.imageMediaId).filter((id): id is string => !!id);
    const images = imageIds.length > 0 ? await this.prisma.media.findMany({ where: { id: { in: imageIds } } }) : [];
    const imageById = new Map(images.map((m) => [m.id, m]));

    // Preserve the order the block author chose, not insertion order.
    const byId = new Map(categories.map((c) => [c.id, c]));
    const ordered = ids.map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c);

    return await Promise.all(
      ordered.map(async (category) => ({
        id: category.id,
        slug: category.slug,
        name: category.name,
        imageUrl: await this.resolveImageUrl(category.imageMediaId ? imageById.get(category.imageMediaId) ?? null : null),
      })),
    );
  }

  async listProducts(query: ListProductsQuery): Promise<ProductCard[]> {
    const where = await this.buildProductWhere(query);
    if (!where) return [];

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.source === "best_sellers" ? { salesCount: "desc" } : query.source === "new_arrivals" ? { createdAt: "desc" } : { createdAt: "desc" };

    const products = await this.prisma.product.findMany({
      where,
      orderBy,
      take: query.limit,
      include: { variants: { select: { price: true, compareAtPrice: true } }, media: { take: 1, orderBy: { position: "asc" }, include: { media: true } } },
    });

    // Manual source: return in the author's chosen order, not query order.
    const ordered = query.source === "manual" && query.productIds ? this.reorderByIds(products, query.productIds) : products;

    return await Promise.all(
      ordered.map(async (product) => {
        const prices = product.variants.map((v) => v.price);
        const compareAtPrices = product.variants.map((v) => v.compareAtPrice).filter((p): p is number => p !== null);
        return {
          id: product.id,
          slug: product.slug,
          title: product.title,
          imageUrl: await this.resolveImageUrl(product.media[0]?.media ?? null),
          priceFrom: prices.length > 0 ? Math.min(...prices) : 0,
          compareAtFrom: compareAtPrices.length > 0 ? Math.min(...compareAtPrices) : null,
        };
      }),
    );
  }

  private reorderByIds<T extends { id: string }>(items: T[], ids: string[]): T[] {
    const byId = new Map(items.map((item) => [item.id, item]));
    return ids.map((id) => byId.get(id)).filter((item): item is T => !!item);
  }

  private async buildProductWhere(query: ListProductsQuery): Promise<Prisma.ProductWhereInput | null> {
    const base: Prisma.ProductWhereInput = { deletedAt: null, status: "active" };
    switch (query.source) {
      case "manual":
        return query.productIds && query.productIds.length > 0 ? { ...base, id: { in: query.productIds } } : null;
      case "category":
        return query.sourceId ? { ...base, categoryId: query.sourceId } : null;
      case "collection": {
        if (!query.sourceId) return null;
        const collection = await this.prisma.collection.findUnique({ where: { id: query.sourceId } });
        if (!collection) return null;
        if (collection.type === "manual") {
          const rows = await this.prisma.collectionProduct.findMany({ where: { collectionId: query.sourceId }, select: { productId: true } });
          return { ...base, id: { in: rows.map((r) => r.productId) } };
        }
        // Automatic collections are evaluated by CollectionsModule's rule
        // builder, not duplicated here — a product_grid sourced from one
        // falls back to new arrivals rather than re-implementing it.
        return { ...base };
      }
      case "tag":
        return query.sourceId ? { ...base, tags: { has: query.sourceId } } : null;
      case "on_sale":
        // Approximation: any variant with a compare-at price set is treated
        // as on sale (the normal usage of that field) rather than a
        // column-to-column comparison query — see docs/DECISIONS.md.
        return { ...base, variants: { some: { compareAtPrice: { not: null } } } };
      case "new_arrivals":
      case "best_sellers":
        return base;
    }
  }
}
