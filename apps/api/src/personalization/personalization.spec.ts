import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { CacheService } from "../cache/cache.service";
import { RecommendationsService } from "./recommendations.service";
import { VisualSearchService } from "./visual-search.service";

function settingsWith(values: Record<string, unknown>) {
  return { getValue: vi.fn((key: string) => Promise.resolve(values[key])) };
}

const card = (id: string) => ({ id, slug: id, title: { en: id }, imageUrl: null, priceFrom: 100_00, compareAtFrom: null });
const catalog = { listProducts: vi.fn(({ productIds }: { productIds: string[] }) => Promise.resolve(productIds.map(card))) };

const products = [
  { id: "shirt", categoryId: "tops", salesCount: 5, tags: ["cotton"], title: { en: "Blue cotton shirt" } },
  { id: "tee", categoryId: "tops", salesCount: 50, tags: ["cotton"], title: { en: "Cotton tee" } },
  { id: "polo", categoryId: "tops", salesCount: 1, tags: [], title: { en: "Polo" } },
  { id: "chino", categoryId: "bottoms", salesCount: 20, tags: [], title: { en: "Chino" } },
  { id: "belt", categoryId: "acc", salesCount: 2, tags: [], title: { en: "Belt" } },
];

function makeRecommendations(settings: Record<string, unknown> = {}, extra: { relations?: unknown[]; affinities?: unknown[]; purchased?: string[] } = {}) {
  const prisma = {
    productRelation: { findMany: vi.fn(() => Promise.resolve(extra.relations ?? [])) },
    productAffinity: {
      findMany: vi.fn(({ where }: { where: { productId: { in: string[] }; kind: { in: string[] } } }) =>
        Promise.resolve(((extra.affinities ?? []) as { productId: string; kind: string }[]).filter((a) => where.productId.in.includes(a.productId) && where.kind.in.includes(a.kind))),
      ),
      findFirst: vi.fn(() => Promise.resolve(null)),
      deleteMany: vi.fn(() => "delete"),
      createMany: vi.fn(() => "create"),
    },
    product: { findMany: vi.fn(() => Promise.resolve(products)) },
    $queryRaw: vi.fn(() => Promise.resolve((extra.purchased ?? []).map((product_id) => ({ product_id })))),
    $transaction: vi.fn(() => Promise.resolve([])),
  };
  const visual = { similarTo: vi.fn(() => Promise.resolve([])) };
  const service = new RecommendationsService(
    prisma as never,
    settingsWith({ "recommendations.enabled": true, "recommendations.excludePurchased": true, ...settings }) as never,
    { record: vi.fn() } as never,
    new CacheService(),
    catalog as never,
    visual as never,
  );
  return { prisma, visual, service };
}

describe("RecommendationsService", () => {
  it("puts hand-picked relations first, then computed bought-together, and keeps similar distinct", async () => {
    const { service, visual } = makeRecommendations(
      {},
      {
        relations: [
          { relatedProductId: "belt", type: "complete_the_look" },
          { relatedProductId: "polo", type: "similar" },
        ],
        affinities: [
          { productId: "shirt", relatedProductId: "chino", kind: "bought_together", score: 0.8 },
          { productId: "shirt", relatedProductId: "belt", kind: "bought_together", score: 0.5 },
        ],
      },
    );
    visual.similarTo.mockResolvedValueOnce(["chino", "tee"] as never);
    const result = await service.forProduct("shirt");
    expect(result.boughtTogether.map((p) => p.id)).toEqual(["belt", "chino"]);
    // "chino" is already in bought-together, so similar = manual polo, visual tee, then same-category content matches.
    expect(result.similar.map((p) => p.id)).toEqual(["polo", "tee"]);
  });

  it("returns only hand-picked relations when switched off", async () => {
    const { service, prisma } = makeRecommendations({ "recommendations.enabled": false }, { relations: [{ relatedProductId: "belt", type: "cross_sell" }] });
    const result = await service.forProduct("shirt");
    expect(result.boughtTogether.map((p) => p.id)).toEqual(["belt"]);
    expect(result.similar).toEqual([]);
    expect(prisma.productAffinity.findMany).not.toHaveBeenCalled();
  });

  it("recommends for a cart without repeating cart items", async () => {
    const { service } = makeRecommendations(
      {},
      {
        affinities: [
          { productId: "shirt", relatedProductId: "chino", kind: "bought_together", score: 0.6 },
          { productId: "shirt", relatedProductId: "tee", kind: "bought_together", score: 0.9 },
          { productId: "tee", relatedProductId: "chino", kind: "bought_together", score: 0.6 },
        ],
      },
    );
    expect((await service.forCart(["shirt", "tee"])).map((p) => p.id)).toEqual(["chino"]);
  });

  it("personalises 'for you' from views and purchases, hiding what was bought", async () => {
    const { service } = makeRecommendations(
      {},
      {
        affinities: [
          { productId: "shirt", relatedProductId: "chino", kind: "viewed_together", score: 0.9 },
          { productId: "belt", relatedProductId: "polo", kind: "bought_together", score: 0.4 },
        ],
        purchased: ["belt"],
      },
    );
    const result = await service.forYou(["shirt", "unknown-id"], "cust_1", 3);
    expect(result.personalized).toBe(true);
    // chino (viewed with the shirt) and polo (bought with the belt, same category as the shirt) lead; popularity alone ranks below them.
    expect(result.products.slice(0, 2).map((p) => p.id).sort()).toEqual(["chino", "polo"]);
    expect(result.products.map((p) => p.id)).not.toContain("belt");
    expect(result.products.map((p) => p.id)).not.toContain("shirt");
  });

  it("falls back to best sellers for a new visitor", async () => {
    const { service } = makeRecommendations();
    const result = await service.forYou([], null, 2);
    expect(result).toMatchObject({ personalized: false });
    expect(result.products.map((p) => p.id)).toEqual(["tee", "chino"]);
  });

  it("computes pairs from sellable products only and replaces each kind in one transaction", async () => {
    const { service, prisma } = makeRecommendations({ "recommendations.windowDays": 180, "recommendations.viewWindowDays": 30, "recommendations.minSupport": 1 });
    prisma.$queryRaw
      .mockResolvedValueOnce([{ products: ["shirt", "chino"] }, { products: ["shirt", "deleted-product"] }] as never)
      .mockResolvedValueOnce([] as never);
    const result = await service.compute(new Date("2026-11-13T00:00:00Z"));
    expect(result).toEqual({ bought_together: 2, viewed_together: 0 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    const created = (prisma.productAffinity.createMany.mock.calls as unknown as [{ data: { productId: string; relatedProductId: string }[] }][])[0]![0];
    expect(created.data.map((d) => `${d.productId}>${d.relatedProductId}`).sort()).toEqual(["chino>shirt", "shirt>chino"]);
  });

  it("runs the nightly pass once per Dhaka day, after 03:00", async () => {
    const { service, prisma } = makeRecommendations({ "recommendations.windowDays": 180, "recommendations.viewWindowDays": 30, "recommendations.minSupport": 2 });
    await service.runIfDue(new Date("2026-11-12T20:00:00Z")); // 02:00 Dhaka
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    await service.runIfDue(new Date("2026-11-12T22:00:00Z")); // 04:00 Dhaka
    await service.runIfDue(new Date("2026-11-12T23:00:00Z"));
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2); // one compute = two basket queries
  });
});

async function photo(rgb: [number, number, number], box: [number, number, number, number]): Promise<Buffer> {
  const [left, top, width, height] = box;
  const garment = await sharp({ create: { width, height, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).png().toBuffer();
  return await sharp({ create: { width: 300, height: 400, channels: 3, background: { r: 250, g: 250, b: 250 } } })
    .composite([{ input: garment, left, top }])
    .jpeg()
    .toBuffer();
}

function makeVisual(settings: Record<string, unknown> = {}, rows: unknown[] = []) {
  const prisma = {
    productVisualFeature: { findMany: vi.fn(() => Promise.resolve(rows)) },
  };
  const ai = { generate: vi.fn(() => Promise.reject(new Error("should not be called"))) };
  const service = new VisualSearchService(
    prisma as never,
    settingsWith({ "visualSearch.enabled": true, "visualSearch.useAi": false, "ai.enabled": false, "visualSearch.maxResults": 10, "visualSearch.perVisitorPerHour": 2, ...settings }) as never,
    { record: vi.fn() } as never,
    new CacheService(),
    {} as never,
    ai as never,
    catalog as never,
  );
  return { prisma, ai, service };
}

function featureRow(productId: string, vector: number[], title: string) {
  return { productId, vector, aiTags: null, product: { tags: [], title: { en: title }, category: { name: { en: "Tops" } } } };
}

describe("VisualSearchService", () => {
  it("finds the product that looks like the uploaded photo", async () => {
    const { service: indexer } = makeVisual();
    const redShirt = await indexer.vectorFor(await photo([200, 20, 30], [60, 60, 180, 220]));
    const blueShirt = await indexer.vectorFor(await photo([20, 40, 200], [60, 60, 180, 220]));
    const redPants = await indexer.vectorFor(await photo([200, 20, 30], [110, 120, 80, 270]));

    const { service } = makeVisual({}, [featureRow("red-shirt", redShirt, "Red shirt"), featureRow("blue-shirt", blueShirt, "Blue shirt"), featureRow("red-pants", redPants, "Red pants")]);
    const upload = await photo([190, 25, 35], [70, 70, 170, 210]);
    const result = await service.search({ buffer: upload, mimetype: "image/jpeg" }, "visitor:a");
    expect(result.products[0]!.id).toBe("red-shirt");
    expect(result.products[0]!.score).toBeGreaterThan(result.products[result.products.length - 1]!.score);
    expect(result.tags).toBeNull();
    expect(result.indexedProducts).toBe(3);
  });

  it("refuses SVG/markup and non-images, and rate-limits per visitor", async () => {
    const { service } = makeVisual();
    await expect(service.search({ buffer: Buffer.from("<svg onload='x'></svg>"), mimetype: "image/png" }, "visitor:b")).rejects.toBeDefined();
    await expect(service.search({ buffer: Buffer.from("hello world, not an image"), mimetype: "image/png" }, "visitor:b")).rejects.toMatchObject({ status: 400 });
    const ok = { buffer: await photo([10, 10, 10], [50, 50, 100, 100]), mimetype: "image/jpeg" };
    await service.search(ok, "visitor:c");
    await service.search(ok, "visitor:c");
    await expect(service.search(ok, "visitor:c")).rejects.toMatchObject({ status: 429 });
  });

  it("is refused on the storefront while switched off, but staff can test", async () => {
    const { service } = makeVisual({ "visualSearch.enabled": false });
    const ok = { buffer: await photo([10, 10, 10], [50, 50, 100, 100]), mimetype: "image/jpeg" };
    await expect(service.search(ok, "visitor:d")).rejects.toMatchObject({ response: { code: "VISUAL_SEARCH_DISABLED" } });
    await expect(service.search(ok, "staff:1", { enforceEnabled: false })).resolves.toMatchObject({ indexedProducts: 0 });
  });

  it("keeps working when AI vision fails", async () => {
    const { service, ai } = makeVisual({ "visualSearch.useAi": true, "ai.enabled": true });
    const ok = { buffer: await photo([10, 10, 10], [50, 50, 100, 100]), mimetype: "image/jpeg" };
    await expect(service.search(ok, "visitor:e")).resolves.toMatchObject({ tags: null });
    expect(ai.generate).toHaveBeenCalledTimes(1);
  });

  it("ranks look-alikes for a product page, never the product itself", async () => {
    const { service: indexer } = makeVisual();
    const red = await indexer.vectorFor(await photo([200, 20, 30], [60, 60, 180, 220]));
    const blue = await indexer.vectorFor(await photo([20, 40, 200], [60, 60, 180, 220]));
    const { service } = makeVisual({}, [featureRow("a", red, "A"), featureRow("b", red, "B"), featureRow("c", blue, "C")]);
    const similar = await service.similarTo("a", 5);
    expect(similar[0]).toBe("b");
    expect(similar).not.toContain("a");
    expect(await service.similarTo("not-indexed", 5)).toEqual([]);
  });
});
