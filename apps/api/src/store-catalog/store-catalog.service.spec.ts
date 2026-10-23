import { describe, expect, it, vi } from "vitest";
import { StoreCatalogService } from "./store-catalog.service";

function makeMediaProviders() {
  return { resolveDriverForAsset: vi.fn() };
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
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never);

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
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never);

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
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never);

    // @ts-expect-error -- private method
    const totals = await service.getVariantAvailability(["v1", "v2"]);

    expect(totals.get("v1")).toBe(8);
    expect(totals.get("v2")).toBe(0);
  });

  it("returns an empty map without querying when given no variant ids", async () => {
    const prisma = { inventoryLevel: { findMany: vi.fn() } };
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never);

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
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never);

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
    const service = new StoreCatalogService(prisma as never, makeMediaProviders() as never);

    // @ts-expect-error -- private method
    const breadcrumb = await service.buildCategoryBreadcrumb("a");

    expect(breadcrumb.length).toBeLessThanOrEqual(2);
  });
});
