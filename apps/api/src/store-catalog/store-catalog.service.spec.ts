import { describe, expect, it, vi } from "vitest";
import { StoreCatalogService } from "./store-catalog.service";

function makeMediaProviders() {
  return { resolveDriverForAsset: vi.fn() };
}

function makeSearch() {
  return { rankedProductIds: vi.fn() };
}

function makeCache() {
  return { get: vi.fn(), set: vi.fn(), delete: vi.fn(), invalidateTag: vi.fn() };
}

describe("StoreCatalogService price-sorted listing", () => {
  it("sorts by ascending min variant price and paginates the sorted order", async () => {
    const candidates = [
      { id: "p1", variants: [{ price: 30000 }] },
      { id: "p2", variants: [{ price: 10000 }, { price: 15000 }] },
      { id: "p3", variants: [{ price: 20000 }] },
    ];
    const rows = [
      { id: "p2", slug: "p2", title: {}, variants: [{ price: 10000, compareAtPrice: null }], media: [] },
      { id: "p1", slug: "p1", title: {}, variants: [{ price: 30000, compareAtPrice: null }], media: [] },
      { id: "p3", slug: "p3", title: {}, variants: [{ price: 20000, compareAtPrice: null }], media: [] },
    ];
    const prisma = {
      product: {
        findMany: vi.fn(({ where }: { where: { id?: { in: string[] } } }) => {
          if (where.id) return Promise.resolve(rows.filter((r) => where.id!.in.includes(r.id)));
          return Promise.resolve(candidates);
        }),
      },
    };
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never, makeCache() as never, makeSearch() as never);

    // @ts-expect-error -- private method, exercised directly for the core sort/paginate correctness
    const result = await service.listPriceSorted({}, "price_asc", 1, 2);

    expect(result.total).toBe(3);
    expect(result.products.map((p: { id: string }) => p.id)).toEqual(["p2", "p3"]); // 10000, then 20000 — p1 (30000) is page 2
  });

  it("sorts descending when requested", async () => {
    const candidates = [{ id: "p1", variants: [{ price: 10000 }] }, { id: "p2", variants: [{ price: 30000 }] }];
    const prisma = {
      product: {
        findMany: vi.fn(({ where }: { where: { id?: { in: string[] } } }) =>
          Promise.resolve(where.id ? candidates.filter((c) => where.id!.in.includes(c.id)).map((c) => ({ ...c, slug: c.id, title: {}, media: [] })) : candidates),
        ),
      },
    };
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never, makeCache() as never, makeSearch() as never);

    // @ts-expect-error -- private method
    const result = await service.listPriceSorted({}, "price_desc", 1, 10);

    expect(result.products.map((p: { id: string }) => p.id)).toEqual(["p2", "p1"]);
  });
});

describe("StoreCatalogService.getVariantAvailability", () => {
  it("sums available stock across every online-fulfilling location, per variant", async () => {
    const prisma = {
      inventoryLevel: {
        findMany: vi.fn(() =>
          Promise.resolve([
            { variantId: "v1", available: 5 },
            { variantId: "v1", available: 3 },
            { variantId: "v2", available: 0 },
          ]),
        ),
      },
    };
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never, makeCache() as never, makeSearch() as never);

    // @ts-expect-error -- private method
    const totals = await service.getVariantAvailability(["v1", "v2"]);

    expect(totals.get("v1")).toBe(8);
    expect(totals.get("v2")).toBe(0);
  });

  it("returns an empty map without querying when given no variant ids", async () => {
    const prisma = { inventoryLevel: { findMany: vi.fn() } };
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never, makeCache() as never, makeSearch() as never);

    // @ts-expect-error -- private method
    const totals = await service.getVariantAvailability([]);

    expect(totals.size).toBe(0);
    expect(prisma.inventoryLevel.findMany).not.toHaveBeenCalled();
  });
});

describe("StoreCatalogService.buildCategoryBreadcrumb", () => {
  it("walks the parent chain and returns it root-first", async () => {
    const categories: Record<string, { id: string; slug: string; name: unknown; parentId: string | null }> = {
      root: { id: "root", slug: "men", name: {}, parentId: null },
      mid: { id: "mid", slug: "panjabi", name: {}, parentId: "root" },
      leaf: { id: "leaf", slug: "cotton-panjabi", name: {}, parentId: "mid" },
    };
    const prisma = { category: { findUnique: vi.fn(({ where: { id } }: { where: { id: string } }) => Promise.resolve(categories[id] ?? null)) } };
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never, makeCache() as never, makeSearch() as never);

    // @ts-expect-error -- private method
    const breadcrumb = await service.buildCategoryBreadcrumb("leaf");

    expect(breadcrumb.map((c: { slug: string }) => c.slug)).toEqual(["men", "panjabi", "cotton-panjabi"]);
  });

  it("stops instead of looping forever if the parent chain somehow cycles", async () => {
    const categories: Record<string, { id: string; slug: string; name: unknown; parentId: string | null }> = {
      a: { id: "a", slug: "a", name: {}, parentId: "b" },
      b: { id: "b", slug: "b", name: {}, parentId: "a" },
    };
    const prisma = { category: { findUnique: vi.fn(({ where: { id } }: { where: { id: string } }) => Promise.resolve(categories[id] ?? null)) } };
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never, makeCache() as never, makeSearch() as never);

    // @ts-expect-error -- private method
    const breadcrumb = await service.buildCategoryBreadcrumb("a");

    expect(breadcrumb.length).toBeLessThanOrEqual(2);
  });
});

describe("StoreCatalogService.listCategories image fallback", () => {
  function setup(productMedia: unknown) {
    const prisma = {
      category: {
        findMany: vi.fn(({ where }: { where: { id?: unknown; parentId?: string } }) =>
          Promise.resolve(
            where.parentId
              ? [{ id: "child" }]
              : [
                  { id: "own", slug: "own", name: {}, imageMediaId: "m-own" },
                  { id: "bare", slug: "bare", name: {}, imageMediaId: null },
                ],
          ),
        ),
      },
      media: { findMany: vi.fn(() => Promise.resolve([{ id: "m-own", variants: null }])) },
      product: { findFirst: vi.fn(() => Promise.resolve(productMedia)) },
    };
    const driver = { toMediaRef: vi.fn((m: { id: string }) => ({ url: `https://img/${m.id}`, variants: null })) };
    const mediaProviders = { resolveDriverForAsset: vi.fn(() => Promise.resolve(driver)) };
    const service = new StoreCatalogService(prisma as never, mediaProviders as never, makeCache() as never, makeSearch() as never);
    return { service, prisma };
  }

  it("uses a product photo from the category (or its sub-categories) when the category has no image", async () => {
    const { service, prisma } = setup({ media: [{ media: { id: "m-product", variants: null } }] });

    const cards = await service.listCategories(["own", "bare"]);

    expect(cards.map((c) => c.imageUrl)).toEqual([expect.stringContaining("m-own"), expect.stringContaining("m-product")]);
    expect(prisma.product.findFirst).toHaveBeenCalledTimes(1);
    const where = (prisma.product.findFirst.mock.calls[0] as unknown as [{ where: { OR: { categoryId: { in: string[] } }[] } }])[0].where;
    expect(where.OR[0]!.categoryId.in).toEqual(["bare", "child"]);
  });

  it("returns no image when the category has no products with photos either", async () => {
    const { service } = setup(null);
    const cards = await service.listCategories(["bare"]);
    expect(cards[0]!.imageUrl).toBeNull();
  });
});

describe("StoreCatalogService.listFeaturedReviews", () => {
  function setup(rows: unknown[]) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const prisma = { review: { findMany } };
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never, makeCache() as never, makeSearch() as never);
    return { service, findMany };
  }

  const row = {
    id: "r1",
    rating: 5,
    title: "Lovely",
    body: "Soft fabric",
    mediaUrls: ["https://cdn.example/r1.jpg"],
    orderItemId: "oi1",
    createdAt: new Date("2026-11-01T00:00:00Z"),
    customer: { name: "Rahim Uddin Khan" },
    product: { id: "p1", slug: "panjabi", title: { en: "Panjabi" }, media: [] },
  };

  it("only reads approved reviews of live products at or above the minimum rating", async () => {
    const { service, findMany } = setup([]);
    await service.listFeaturedReviews({ sort: "recent", minRating: 4, limit: 6 });
    const args = findMany.mock.calls[0]![0] as { where: Record<string, unknown>; take: number };
    expect(args.where).toMatchObject({ status: "approved", rating: { gte: 4 }, product: { deletedAt: null, status: "active" } });
    expect(args.where).not.toHaveProperty("mediaUrls");
    expect(args.take).toBe(6);
  });

  it("filters to photo reviews and orders top-rated by rating first", async () => {
    const { service, findMany } = setup([]);
    await service.listFeaturedReviews({ sort: "with_photos", minRating: 1, limit: 3 });
    expect((findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where).toMatchObject({ mediaUrls: { isEmpty: false } });
    await service.listFeaturedReviews({ sort: "top_rated", minRating: 1, limit: 3 });
    expect((findMany.mock.calls[1]![0] as { orderBy: unknown[] }).orderBy[0]).toEqual({ rating: "desc" });
  });

  it("masks the reviewer's name and marks verified purchases", async () => {
    const { service } = setup([row, { ...row, id: "r2", orderItemId: null, customer: null, mediaUrls: [] }]);
    const [first, second] = await service.listFeaturedReviews({ sort: "recent", minRating: 4, limit: 6 });
    expect(first).toMatchObject({ authorName: "Rahim K.", verified: true, photoUrl: "https://cdn.example/r1.jpg", product: { slug: "panjabi", imageUrl: null } });
    expect(first).not.toHaveProperty("customer");
    expect(second).toMatchObject({ authorName: null, verified: false, photoUrl: null });
  });
});

describe("StoreCatalogService.listForListing search and filters", () => {
  const cachedFacets = { attributes: [], categories: [], priceRange: null };

  function setup(opts: { ranked?: string[] | null; matching?: string[] } = {}) {
    const rows = ["p1", "p2", "p3"].map((id) => ({ id, slug: id, title: {}, variants: [{ price: 1000, compareAtPrice: null }], media: [] }));
    const findMany = vi.fn((args: { where: unknown; select?: unknown }) => {
      if (args.select) return Promise.resolve((opts.matching ?? ["p1", "p2", "p3"]).map((id) => ({ id })));
      const where = args.where as { id?: { in: string[] } };
      return Promise.resolve(where.id ? rows.filter((r) => where.id!.in.includes(r.id)) : rows);
    });
    const prisma = {
      product: { findMany, count: vi.fn().mockResolvedValue(3) },
      category: {
        findMany: vi.fn().mockResolvedValue([
          { id: "men", parentId: null, name: {}, slug: "men", sortOrder: 0 },
          { id: "panjabi", parentId: "men", name: {}, slug: "panjabi", sortOrder: 0 },
        ]),
      },
    };
    const cache = { get: vi.fn((key: string) => (key.startsWith("facets:") ? cachedFacets : undefined)), set: vi.fn(), delete: vi.fn(), invalidateTag: vi.fn() };
    const search = { rankedProductIds: vi.fn().mockResolvedValue(opts.ranked ?? null) };
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never, cache as never, search as never);
    return { service, findMany, search };
  }

  it("orders search results by relevance and drops ones the filters exclude", async () => {
    const { service, search } = setup({ ranked: ["p3", "p1", "p2"], matching: ["p1", "p3"] });
    const result = await service.listForListing({ q: "panjabi", sort: "relevance", page: 1, pageSize: 24, inStockOnly: false, onSale: false });
    expect(search.rankedProductIds).toHaveBeenCalledWith("panjabi");
    expect(result.data.map((p) => p.id)).toEqual(["p3", "p1"]);
    expect(result.meta.total).toBe(2);
  });

  it("matches sub-categories of a chosen category and filters on sale", async () => {
    const { service, findMany } = setup();
    await service.listForListing({ categoryIds: "men", sort: "newest", page: 1, pageSize: 24, inStockOnly: false, onSale: true });
    const where = JSON.stringify(findMany.mock.calls[0]![0].where);
    expect(where).toContain('"categoryId":{"in":["men","panjabi"]}');
    expect(where).toContain('"compareAtPrice":{"not":null}');
  });

  it("ignores search when the query has no searchable words", async () => {
    const { service, findMany } = setup({ ranked: null });
    await service.listForListing({ q: "!!", sort: "relevance", page: 1, pageSize: 24, inStockOnly: false, onSale: false });
    expect(JSON.stringify(findMany.mock.calls[0]![0].where)).not.toContain('"id":{"in"');
  });
});

describe("StoreCatalogService category page scope", () => {
  it("includes products in sub-categories", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      product: { findMany, count: vi.fn().mockResolvedValue(0) },
      category: { findMany: vi.fn().mockResolvedValue([{ id: "women", parentId: null }, { id: "saree", parentId: "women" }, { id: "men", parentId: null }]) },
    };
    const cache = { get: vi.fn((key: string) => (key.startsWith("facets:") ? { attributes: [], categories: [], priceRange: null } : undefined)), set: vi.fn(), delete: vi.fn(), invalidateTag: vi.fn() };
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never, cache as never, makeSearch() as never);
    await service.listForListing({ categoryId: "women", sort: "newest", page: 1, pageSize: 24, inStockOnly: false, onSale: false });
    expect(JSON.stringify(findMany.mock.calls[0]![0].where)).toContain('"categoryId":{"in":["women","saree"]}');
  });
});
