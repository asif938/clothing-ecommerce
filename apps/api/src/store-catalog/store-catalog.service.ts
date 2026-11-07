import { Injectable } from "@nestjs/common";
import { Prisma, type Media } from "@clothing/db";
import { getMediaUrl } from "@clothing/shared/media";
import { PrismaService } from "../prisma/prisma.service";
import { MediaProvidersService } from "../media/media-providers.service";
import { CacheService } from "../cache/cache.service";
import type { MediaVariantMap } from "../media/media-driver";
import type { ListingQuery } from "./dto";

const CARD_IMAGE_WIDTH = 480;
const PDP_IMAGE_WIDTH = 1200;
// §13.1 "facet counts cached per category". A short TTL rather than
// precise invalidation on every product/category mutation — this is the
// free-tier in-memory cache (lost on restart, single-process, no
// cross-instance sharing, see CacheService), so a minute of staleness on
// a facet count is an acceptable trade for not having to hook facet-cache
// invalidation into every place a product's price/attributes/stock can
// change.
const FACETS_CACHE_TTL_SECONDS = 60;

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
    private readonly cache: CacheService,
  ) {}

  private async resolveImageUrl(media: Media | null, width: number = CARD_IMAGE_WIDTH): Promise<string | null> {
    if (!media) return null;
    const driver = await this.mediaProviders.resolveDriverForAsset(media);
    const ref = driver.toMediaRef({ ...media, variants: media.variants as MediaVariantMap | null });
    return getMediaUrl(ref, { width });
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

  // -------------------------------------------------------------------------
  // Category detail + breadcrumb
  // -------------------------------------------------------------------------

  async getCategoryBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category || category.deletedAt || !category.isActive) return null;
    const [imageUrl, bannerUrl, breadcrumb] = await Promise.all([
      this.resolveImageUrlById(category.imageMediaId),
      this.resolveImageUrlById(category.bannerMediaId),
      this.buildCategoryBreadcrumb(category.id),
    ]);
    return { ...category, imageUrl, bannerUrl, breadcrumb };
  }

  async getCollectionBySlug(slug: string) {
    const collection = await this.prisma.collection.findUnique({ where: { slug } });
    if (!collection || collection.deletedAt || !collection.isActive) return null;
    const now = new Date();
    if ((collection.startsAt && collection.startsAt > now) || (collection.endsAt && collection.endsAt < now)) return null;
    const [imageUrl, bannerUrl] = await Promise.all([this.resolveImageUrlById(collection.imageMediaId), this.resolveImageUrlById(collection.bannerMediaId)]);
    return { ...collection, imageUrl, bannerUrl };
  }

  private async resolveImageUrlById(mediaId: string | null): Promise<string | null> {
    if (!mediaId) return null;
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    return await this.resolveImageUrl(media);
  }

  /** Root-first ancestor chain, for breadcrumbs and BreadcrumbList structured data (§13.2). */
  private async buildCategoryBreadcrumb(categoryId: string): Promise<{ id: string; slug: string; name: unknown }[]> {
    const chain: { id: string; slug: string; name: unknown }[] = [];
    let currentId: string | null = categoryId;
    const seen = new Set<string>();
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const category: { id: string; slug: string; name: unknown; parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { id: true, slug: true, name: true, parentId: true },
      });
      if (!category) break;
      chain.unshift({ id: category.id, slug: category.slug, name: category.name });
      currentId = category.parentId;
    }
    return chain;
  }

  // -------------------------------------------------------------------------
  // Filterable/faceted listing (category or collection page, §16 M4)
  // -------------------------------------------------------------------------

  async listForListing(query: ListingQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;

    const scope = await this.buildListingScope(query);
    if (!scope) return { data: [], meta: { page, pageSize, total: 0 }, facets: { attributes: [], priceRange: null } };

    const where = this.applyListingFilters(scope, query);

    const [{ products, total }, facets] = await Promise.all([
      query.sort === "price_asc" || query.sort === "price_desc"
        ? this.listPriceSorted(where, query.sort, page, pageSize)
        : this.listOrdered(where, this.listingOrderBy(query.sort), page, pageSize),
      this.computeFacetsCached(query, scope),
    ]);

    const data = await Promise.all(
      products.map(async (product) => {
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

    return { data, meta: { page, pageSize, total }, facets };
  }

  private async listOrdered(where: Prisma.ProductWhereInput, orderBy: Prisma.ProductOrderByWithRelationInput, page: number, pageSize: number) {
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { variants: { select: { price: true, compareAtPrice: true } }, media: { take: 1, orderBy: { position: "asc" }, include: { media: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { products, total };
  }

  /**
   * Price-sorted listing. Prisma's `orderBy` can't sort a parent query by a
   * related list's MIN/MAX (only `_count` is supported there), and this
   * listing's `where` is built dynamically (attribute/price/stock filters),
   * so a hand-written raw-SQL equivalent would have to duplicate all of
   * that. Instead: load every matching product's id + variant prices
   * (bounded by the same `where`), sort by min price in memory, paginate
   * the id list, then fetch just that page's full rows. Fine at the
   * free-tier/single-category scale this is built for; a real search
   * engine's sort would be the answer at catalog sizes where it isn't.
   */
  private async listPriceSorted(where: Prisma.ProductWhereInput, sort: "price_asc" | "price_desc", page: number, pageSize: number) {
    const candidates = await this.prisma.product.findMany({ where, select: { id: true, variants: { select: { price: true } } } });
    const withMinPrice = candidates.map((p) => ({ id: p.id, minPrice: p.variants.length > 0 ? Math.min(...p.variants.map((v) => v.price)) : 0 }));
    withMinPrice.sort((a, b) => (sort === "price_asc" ? a.minPrice - b.minPrice : b.minPrice - a.minPrice));

    const pageIds = withMinPrice.slice((page - 1) * pageSize, page * pageSize).map((p) => p.id);
    const rows = await this.prisma.product.findMany({
      where: { id: { in: pageIds } },
      include: { variants: { select: { price: true, compareAtPrice: true } }, media: { take: 1, orderBy: { position: "asc" }, include: { media: true } } },
    });
    return { products: this.reorderByIds(rows, pageIds), total: withMinPrice.length };
  }

  /** The category/collection/tag scope alone — shared by the listing query and the facet-count query (facets never re-filter by the attribute they're counting, so a shopper can still broaden a selection). */
  private async buildListingScope(query: ListingQuery): Promise<Prisma.ProductWhereInput | null> {
    const base: Prisma.ProductWhereInput = { deletedAt: null, status: "active" };
    if (query.categoryId) return { ...base, categoryId: query.categoryId };
    if (query.collectionId) {
      const collection = await this.prisma.collection.findUnique({ where: { id: query.collectionId } });
      if (!collection) return null;
      if (collection.type === "manual") {
        const rows = await this.prisma.collectionProduct.findMany({ where: { collectionId: query.collectionId }, select: { productId: true } });
        return { ...base, id: { in: rows.map((r) => r.productId) } };
      }
      return base;
    }
    if (query.tag) return { ...base, tags: { has: query.tag } };
    return base;
  }

  private applyListingFilters(scope: Prisma.ProductWhereInput, query: ListingQuery): Prisma.ProductWhereInput {
    const and: Prisma.ProductWhereInput[] = [scope];

    for (const [attributeId, valueIds] of Object.entries(query.attributes ?? {})) {
      and.push({ attributeValues: { some: { attributeId, attributeValueId: { in: valueIds } } } });
    }

    if (query.priceMin !== undefined || query.priceMax !== undefined) {
      and.push({
        variants: {
          some: {
            price: { ...(query.priceMin !== undefined ? { gte: query.priceMin } : {}), ...(query.priceMax !== undefined ? { lte: query.priceMax } : {}) },
          },
        },
      });
    }

    // Approximate "in stock" as "has an active variant" — a real on-hand
    // check needs an inventory join per variant; deferred, see docs/DECISIONS.md.
    if (query.inStockOnly) and.push({ variants: { some: { isActive: true } } });

    return { AND: and };
  }

  /** `price_asc`/`price_desc` are handled by `listPriceSorted` instead — Prisma's `orderBy` can't sort by a related list's min/max. */
  private listingOrderBy(sort: ListingQuery["sort"]): Prisma.ProductOrderByWithRelationInput {
    switch (sort) {
      case "newest":
        return { createdAt: "desc" };
      case "bestselling":
        return { salesCount: "desc" };
      default:
        return { sortWeight: "desc" };
    }
  }

  /** Cache key is the scope identity alone (category/collection/tag id) — the same facet counts serve every shopper browsing that same listing regardless of their own filter selections (facets never re-filter by themselves, see `buildListingScope`). */
  private async computeFacetsCached(query: ListingQuery, scope: Prisma.ProductWhereInput) {
    const key = `facets:${query.categoryId ?? ""}:${query.collectionId ?? ""}:${query.tag ?? ""}`;
    const cached = this.cache.get<Awaited<ReturnType<typeof this.computeFacets>>>(key);
    if (cached) return cached;
    const facets = await this.computeFacets(scope);
    this.cache.set(key, facets, { ttlSeconds: FACETS_CACHE_TTL_SECONDS, tags: ["facets"] });
    return facets;
  }

  /**
   * Attribute facet counts, scoped to the category/collection/tag alone
   * (not the shopper's current attribute selections, so broadening a
   * filter is always possible) — a deliberately simple facet model, not a
   * real search engine's per-facet "count if this were also selected"
   * logic. Price range is the scope's min/max variant price.
   */
  private async computeFacets(scope: Prisma.ProductWhereInput) {
    const [attributeCounts, priceAgg] = await Promise.all([
      this.prisma.productAttributeValue.groupBy({
        by: ["attributeId", "attributeValueId"],
        where: { attributeValueId: { not: null }, product: scope },
        _count: { _all: true },
      }),
      this.prisma.productVariant.aggregate({ where: { product: scope }, _min: { price: true }, _max: { price: true } }),
    ]);

    const attributeValueIds = attributeCounts.map((c) => c.attributeValueId).filter((id): id is string => !!id);
    const [attributes, values] = await Promise.all([
      this.prisma.attribute.findMany({ where: { id: { in: [...new Set(attributeCounts.map((c) => c.attributeId))] } } }),
      this.prisma.attributeValue.findMany({ where: { id: { in: attributeValueIds } } }),
    ]);
    const attributeById = new Map(attributes.map((a) => [a.id, a]));
    const valueById = new Map(values.map((v) => [v.id, v]));

    const byAttribute = new Map<string, { attributeId: string; attributeName: unknown; values: { valueId: string; label: unknown; count: number }[] }>();
    for (const row of attributeCounts) {
      if (!row.attributeValueId) continue;
      const attribute = attributeById.get(row.attributeId);
      const value = valueById.get(row.attributeValueId);
      if (!attribute || !value) continue;
      const entry = byAttribute.get(row.attributeId) ?? { attributeId: row.attributeId, attributeName: attribute.name, values: [] };
      entry.values.push({ valueId: row.attributeValueId, label: value.value, count: row._count._all });
      byAttribute.set(row.attributeId, entry);
    }

    return {
      attributes: [...byAttribute.values()],
      priceRange: priceAgg._min.price !== null ? { min: priceAgg._min.price, max: priceAgg._max.price } : null,
    };
  }

  // -------------------------------------------------------------------------
  // Product detail (PDP, §7.4)
  // -------------------------------------------------------------------------

  async getProductBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        sizeChart: true,
        attributeValues: { include: { attribute: true, attributeValue: true } },
        options: { orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" } }, sizeSystem: true } },
        variants: { orderBy: { position: "asc" } },
        media: { orderBy: { position: "asc" }, include: { media: true } },
        relationsFrom: { include: { relatedProduct: { include: { variants: { select: { price: true, compareAtPrice: true } }, media: { take: 1, include: { media: true } } } } } },
        bundleItems: { orderBy: { position: "asc" }, include: { componentProduct: { include: { media: { take: 1, include: { media: true } } } }, componentVariant: true } },
      },
    });
    if (!product || product.deletedAt || product.status !== "active") return null;

    const [breadcrumb, mediaUrls, availability, swatchUrls] = await Promise.all([
      product.category ? this.buildCategoryBreadcrumb(product.category.id) : Promise.resolve([]),
      Promise.all(product.media.map((m) => this.resolveImageUrl(m.media, PDP_IMAGE_WIDTH))),
      this.getVariantAvailability(product.variants.map((v) => v.id)),
      Promise.all(
        product.options.flatMap((o) => o.values).map(async (v) => [v.id, await this.resolveImageUrlById(v.swatchImageMediaId)] as const),
      ),
    ]);
    const swatchUrlById = new Map(swatchUrls);

    const relations: Record<string, ProductCard[]> = {};
    for (const relation of product.relationsFrom) {
      const related = relation.relatedProduct;
      const prices = related.variants.map((v) => v.price);
      const card: ProductCard = {
        id: related.id,
        slug: related.slug,
        title: related.title,
        imageUrl: await this.resolveImageUrl(related.media[0]?.media ?? null),
        priceFrom: prices.length > 0 ? Math.min(...prices) : 0,
        compareAtFrom: null,
      };
      (relations[relation.type] ??= []).push(card);
    }

    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      subtitle: product.subtitle,
      description: product.description,
      shortDescription: product.shortDescription,
      tags: product.tags,
      productType: product.productType,
      // §16 M10 — preorders bypass the normal availability clamp entirely
      // (see `CartPricingService`), so the PDP shows this instead of relying
      // on the `variants[*].available` flags below, which still reflect
      // real on-hand stock. Bundle components carry their own real price/
      // availability so "add the look" can show a real combined total.
      preorderReleaseDate: product.preorderReleaseDate,
      preorderLimit: product.preorderLimit,
      bundleDiscountType: product.bundleDiscountType,
      bundleDiscountValue: product.bundleDiscountValue,
      bundleItems:
        product.productType === "bundle"
          ? await Promise.all(
              product.bundleItems.map(async (item) => ({
                id: item.id,
                quantity: item.quantity,
                product: { id: item.componentProduct.id, slug: item.componentProduct.slug, title: item.componentProduct.title },
                variant: {
                  id: item.componentVariant.id,
                  sku: item.componentVariant.sku,
                  optionValueIds: item.componentVariant.optionValueIds,
                  price: item.componentVariant.price,
                  isActive: item.componentVariant.isActive,
                },
                imageUrl: await this.resolveImageUrl(item.componentProduct.media[0]?.media ?? null),
              })),
            )
          : [],
      careInstructions: product.careInstructions,
      fabric: product.fabric,
      modelInfo: product.modelInfo,
      videoUrl: product.videoUrl,
      requiresShipping: product.requiresShipping,
      ratingAvg: product.ratingAvg,
      ratingCount: product.ratingCount,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      category: product.category ? { id: product.category.id, slug: product.category.slug, name: product.category.name } : null,
      breadcrumb,
      sizeChart: product.sizeChart,
      attributes: product.attributeValues
        .filter((av) => av.attribute.isVisibleOnPdp)
        .map((av) => ({ attributeId: av.attributeId, name: av.attribute.name, value: av.attributeValue?.value ?? av.valueText ?? av.valueNumber })),
      options: product.options.map((option) => ({
        id: option.id,
        name: option.name,
        type: option.type,
        sizeSystem: option.sizeSystem,
        values: option.values.map((value) => ({ id: value.id, value: value.value, colorHex: value.colorHex, swatchImageUrl: swatchUrlById.get(value.id) ?? null })),
      })),
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        barcode: variant.barcode,
        optionValueIds: variant.optionValueIds,
        price: variant.price,
        compareAtPrice: variant.compareAtPrice,
        weightGrams: variant.weightGrams,
        isActive: variant.isActive,
        available: variant.isActive && (availability.get(variant.id) ?? 0) > 0,
        lowStock: variant.isActive && (availability.get(variant.id) ?? 0) > 0 && (availability.get(variant.id) ?? 0) <= 5,
      })),
      media: product.media.map((m, index) => ({ id: m.id, url: mediaUrls[index] ?? null, alt: m.alt, optionValueId: m.optionValueId })),
      relations,
    };
  }

  /** Sum of `available` (on_hand - reserved) across every online-fulfilling location, per variant. */
  private async getVariantAvailability(variantIds: string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    const levels = await this.prisma.inventoryLevel.findMany({
      where: { variantId: { in: variantIds }, location: { fulfillsOnline: true } },
      select: { variantId: true, available: true },
    });
    const totals = new Map<string, number>();
    for (const level of levels) totals.set(level.variantId, (totals.get(level.variantId) ?? 0) + level.available);
    return totals;
  }

  // -------------------------------------------------------------------------
  // Instant search suggestions (§7.2 "instant suggestions with product
  // thumbnails, categories, popular searches")
  // -------------------------------------------------------------------------

  async suggest(q: string) {
    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: { deletedAt: null, status: "active", OR: [{ title: { path: ["en"], string_contains: q } }, { title: { path: ["bn"], string_contains: q } }] },
        take: 5,
        include: { media: { take: 1, orderBy: { position: "asc" }, include: { media: true } }, variants: { select: { price: true }, take: 1 } },
      }),
      this.prisma.category.findMany({
        where: { isActive: true, deletedAt: null, OR: [{ name: { path: ["en"], string_contains: q } }, { name: { path: ["bn"], string_contains: q } }] },
        take: 3,
      }),
    ]);

    return {
      products: await Promise.all(
        products.map(async (p) => ({ id: p.id, slug: p.slug, title: p.title, imageUrl: await this.resolveImageUrl(p.media[0]?.media ?? null), price: p.variants[0]?.price ?? null })),
      ),
      categories: categories.map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
    };
  }
}
