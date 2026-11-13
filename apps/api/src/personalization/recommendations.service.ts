import { Injectable, Logger } from "@nestjs/common";
import type { ProductAffinityKind } from "@clothing/db";
import {
  aggregateCartAffinities,
  mergeRecommendationIds,
  rankForYou,
  scorePairs,
  tagSimilarity,
  tagTokens,
  viewedSeeds,
  type AffinityKind,
  type AffinityPair,
  type ForYouCandidateInfo,
  type ForYouSeed,
} from "@clothing/shared/personalization";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { CacheService } from "../cache/cache.service";
import { StoreCatalogService, type ProductCard } from "../store-catalog/store-catalog.service";
import { dhakaDayStart, dhakaParts } from "../common/dhaka-time";
import type { AuthenticatedStaff } from "../common/types";
import { VisualSearchService } from "./visual-search.service";

/** The nightly pass runs after this Dhaka hour (after RFM at 02:00), once per Dhaka day. */
const RUN_AFTER_HOUR = 3;
const MAX_PER_PRODUCT = 20;
/** A browsing "basket" bigger than this is more likely a crawler than a shopper. */
const MAX_VIEWED_PER_VISITOR = 60;
/** Browsing says less than buying. */
const KIND_WEIGHT: Record<AffinityKind, number> = { bought_together: 1, viewed_together: 0.6 };
const PURCHASE_SEED_WEIGHT = 1.2;
const SNAPSHOT_KEY = "recommendations:catalog";
const SNAPSHOT_TTL_SECONDS = 300;
export const PERSONALIZATION_CACHE_TAG = "personalization";
const SECTION_LIMIT = 8;

interface CatalogSnapshotRow {
  id: string;
  categoryId: string | null;
  salesCount: number;
  tokens: string[];
}

export interface ProductRecommendations {
  boughtTogether: ProductCard[];
  similar: ProductCard[];
}

/**
 * Personalized recommendations (docs/PROJECT_SPEC.md §16 M14). Item-to-item
 * affinities are computed once a night from orders ("bought together") and
 * first-party `view_item` events ("viewed together") into
 * `product_affinities`; every storefront read is then a cheap indexed
 * lookup plus in-memory ranking. Hand-picked `product_relations` always
 * come first. With `recommendations.enabled` off, only the hand-picked
 * relations are returned.
 */
@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  private lastRunDay: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly catalog: StoreCatalogService,
    private readonly visual: VisualSearchService,
  ) {}

  // ---------------------------------------------------------------------------
  // Nightly computation
  // ---------------------------------------------------------------------------

  async runIfDue(now = new Date()): Promise<void> {
    if (!(await this.settings.getValue<boolean>("recommendations.enabled"))) return;
    const parts = dhakaParts(now);
    if (parts.hour < RUN_AFTER_HOUR) return;
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    if (this.lastRunDay === day) return;
    // "Already ran today" survives restarts via the data itself (like RFM); the in-memory day also covers a run that found no pairs.
    const ranToday = await this.prisma.productAffinity.findFirst({ where: { computedAt: { gte: dhakaDayStart(now) } }, select: { id: true } });
    this.lastRunDay = day;
    if (ranToday) return;
    const result = await this.compute(now);
    this.logger.log(`Recommendations: ${result.bought_together} bought-together and ${result.viewed_together} viewed-together pairs`);
  }

  async compute(now = new Date()): Promise<Record<AffinityKind, number>> {
    const [windowDays, viewWindowDays, minSupport] = await Promise.all([
      this.settings.getValue<number>("recommendations.windowDays"),
      this.settings.getValue<number>("recommendations.viewWindowDays"),
      this.settings.getValue<number>("recommendations.minSupport"),
    ]);

    const orderBaskets = await this.prisma.$queryRaw<{ products: string[] }[]>`
      SELECT array_agg(DISTINCT v.product_id) AS products
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN product_variants v ON v.id = oi.variant_id
      WHERE o.created_at >= ${new Date(now.getTime() - windowDays * 86_400_000)}
        AND o.status::text NOT IN ('cancelled', 'expired', 'pending_payment')
      GROUP BY oi.order_id
      HAVING COUNT(DISTINCT v.product_id) > 1`;

    const viewBaskets = await this.prisma.$queryRaw<{ products: string[] }[]>`
      SELECT array_agg(DISTINCT payload->>'productId') AS products
      FROM analytics_events
      WHERE type = 'view_item' AND anonymous_id IS NOT NULL AND payload ? 'productId'
        AND created_at >= ${new Date(now.getTime() - viewWindowDays * 86_400_000)}
      GROUP BY anonymous_id
      HAVING COUNT(DISTINCT payload->>'productId') BETWEEN 2 AND ${MAX_VIEWED_PER_VISITOR}`;

    const sellable = new Set((await this.prisma.product.findMany({ where: { status: "active", deletedAt: null }, select: { id: true } })).map((p) => p.id));
    const clean = (rows: { products: string[] }[]) => rows.map((r) => r.products.filter((id) => sellable.has(id))).filter((b) => b.length > 1);

    const bought = scorePairs(clean(orderBaskets), { minSupport, maxPerProduct: MAX_PER_PRODUCT });
    const viewed = scorePairs(clean(viewBaskets), { minSupport, maxPerProduct: MAX_PER_PRODUCT, maxBasketSize: MAX_VIEWED_PER_VISITOR });
    await this.replace("bought_together", bought, now);
    await this.replace("viewed_together", viewed, now);
    this.cache.invalidateTag(PERSONALIZATION_CACHE_TAG);
    return { bought_together: bought.length, viewed_together: viewed.length };
  }

  private async replace(kind: ProductAffinityKind, pairs: AffinityPair[], now: Date): Promise<void> {
    const chunks: AffinityPair[][] = [];
    for (let i = 0; i < pairs.length; i += 1000) chunks.push(pairs.slice(i, i + 1000));
    await this.prisma.$transaction([
      this.prisma.productAffinity.deleteMany({ where: { kind } }),
      ...chunks.map((chunk) =>
        this.prisma.productAffinity.createMany({
          data: chunk.map((p) => ({ productId: p.productId, relatedProductId: p.relatedProductId, kind, score: p.score, support: p.support, computedAt: now })),
          skipDuplicates: true,
        }),
      ),
    ]);
  }

  async recompute(actor: AuthenticatedStaff) {
    const result = await this.compute();
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "recommendations.recompute", entityType: "product_affinity", entityId: "all", after: result });
    return result;
  }

  // ---------------------------------------------------------------------------
  // Storefront reads
  // ---------------------------------------------------------------------------

  private async enabled(): Promise<boolean> {
    return await this.settings.getValue<boolean>("recommendations.enabled");
  }

  /** Active products with what ranking needs, cached briefly (the free-tier in-memory cache). */
  private async snapshot(): Promise<Map<string, CatalogSnapshotRow>> {
    const cached = this.cache.get<Map<string, CatalogSnapshotRow>>(SNAPSHOT_KEY);
    if (cached) return cached;
    const rows = await this.prisma.product.findMany({
      where: { status: "active", deletedAt: null },
      select: { id: true, categoryId: true, salesCount: true, tags: true, title: true },
    });
    const map = new Map<string, CatalogSnapshotRow>();
    for (const row of rows) {
      const title = row.title as { bn?: string; en?: string } | null;
      map.set(row.id, { id: row.id, categoryId: row.categoryId, salesCount: row.salesCount, tokens: [...tagTokens([...row.tags, title?.en, title?.bn])] });
    }
    this.cache.set(SNAPSHOT_KEY, map, { ttlSeconds: SNAPSHOT_TTL_SECONDS, tags: [PERSONALIZATION_CACHE_TAG] });
    return map;
  }

  private async affinityMap(productIds: string[], kinds: AffinityKind[] = ["bought_together", "viewed_together"]): Promise<Map<string, { relatedProductId: string; score: number }[]>> {
    const map = new Map<string, { relatedProductId: string; score: number }[]>();
    if (productIds.length === 0) return map;
    const rows = await this.prisma.productAffinity.findMany({
      where: { productId: { in: productIds }, kind: { in: kinds } },
      orderBy: { score: "desc" },
      select: { productId: true, relatedProductId: true, kind: true, score: true },
    });
    for (const row of rows) {
      const list = map.get(row.productId) ?? [];
      const weighted = row.score * KIND_WEIGHT[row.kind];
      const existing = list.find((r) => r.relatedProductId === row.relatedProductId);
      if (existing) existing.score += weighted;
      else list.push({ relatedProductId: row.relatedProductId, score: weighted });
      map.set(row.productId, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.score - a.score);
    return map;
  }

  private async cards(ids: string[]): Promise<ProductCard[]> {
    if (ids.length === 0) return [];
    return await this.catalog.listProducts({ source: "manual", productIds: ids, limit: ids.length });
  }

  /** PDP: "frequently bought together" and "similar". */
  async forProduct(productId: string): Promise<ProductRecommendations> {
    const manual = await this.prisma.productRelation.findMany({ where: { productId }, orderBy: { position: "asc" }, select: { relatedProductId: true, type: true } });
    const manualTogether = manual.filter((r) => r.type === "complete_the_look" || r.type === "cross_sell").map((r) => r.relatedProductId);
    const manualSimilar = manual.filter((r) => r.type === "similar").map((r) => r.relatedProductId);

    if (!(await this.enabled())) {
      const [boughtTogether, similar] = await Promise.all([this.cards(manualTogether.slice(0, SECTION_LIMIT)), this.cards(manualSimilar.slice(0, SECTION_LIMIT))]);
      return { boughtTogether, similar };
    }

    const affinities = await this.affinityMap([productId], ["bought_together"]);
    const computedTogether = (affinities.get(productId) ?? []).map((r) => r.relatedProductId);
    const togetherIds = mergeRecommendationIds(productId, manualTogether, computedTogether, SECTION_LIMIT);
    const similarIds = mergeRecommendationIds(productId, manualSimilar, [...(await this.visual.similarTo(productId, SECTION_LIMIT * 2)), ...(await this.contentSimilar(productId))], SECTION_LIMIT * 2)
      .filter((id) => !togetherIds.includes(id))
      .slice(0, SECTION_LIMIT);
    const [boughtTogether, similar] = await Promise.all([this.cards(togetherIds), this.cards(similarIds)]);
    return { boughtTogether, similar };
  }

  /** Same category, ranked by shared title/tag words then popularity — the fallback when there's no visual index. */
  private async contentSimilar(productId: string): Promise<string[]> {
    const snapshot = await this.snapshot();
    const self = snapshot.get(productId);
    if (!self) return [];
    const mine = new Set(self.tokens);
    return [...snapshot.values()]
      .filter((p) => p.id !== productId && p.categoryId !== null && p.categoryId === self.categoryId)
      .map((p) => ({ id: p.id, score: tagSimilarity(mine, new Set(p.tokens)), sales: p.salesCount }))
      .sort((a, b) => b.score - a.score || b.sales - a.sales || a.id.localeCompare(b.id))
      .slice(0, SECTION_LIMIT * 2)
      .map((p) => p.id);
  }

  /** Cart: products often bought with what's already in the cart. */
  async forCart(productIds: string[]): Promise<ProductCard[]> {
    const ids = [...new Set(productIds)].slice(0, 30);
    if (ids.length === 0) return [];
    const manual = await this.prisma.productRelation.findMany({
      where: { productId: { in: ids }, type: { in: ["complete_the_look", "cross_sell", "upsell"] } },
      orderBy: { position: "asc" },
      select: { relatedProductId: true },
    });
    const inCart = new Set(ids);
    const manualIds = manual.map((r) => r.relatedProductId).filter((id) => !inCart.has(id));
    const computed = (await this.enabled()) ? aggregateCartAffinities(ids, await this.affinityMap(ids, ["bought_together"]), SECTION_LIMIT) : [];
    return await this.cards(mergeRecommendationIds(null, manualIds, computed, SECTION_LIMIT).filter((id) => !inCart.has(id)));
  }

  /**
   * "For you": seeds are the shopper's recently viewed products (sent by the
   * browser — only product ids, nothing personal) plus, when logged in,
   * what they bought recently. Without any seeds this is best sellers.
   */
  async forYou(viewedIds: string[], customerId: string | null, limit: number): Promise<{ products: ProductCard[]; personalized: boolean }> {
    const snapshot = await this.snapshot();
    const viewed = viewedIds.filter((id) => snapshot.has(id)).slice(0, 20);
    const seeds: ForYouSeed[] = viewedSeeds(viewed);
    let purchased: string[] = [];
    if (customerId) {
      const rows = await this.prisma.$queryRaw<{ product_id: string }[]>`
        SELECT DISTINCT v.product_id
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN product_variants v ON v.id = oi.variant_id
        WHERE o.customer_id = ${customerId} AND o.status::text NOT IN ('cancelled', 'expired')
          AND o.created_at >= ${new Date(Date.now() - 365 * 86_400_000)}
        LIMIT 30`;
      purchased = rows.map((r) => r.product_id);
      for (const id of purchased) if (snapshot.has(id) && !seeds.some((s) => s.productId === id)) seeds.push({ productId: id, weight: PURCHASE_SEED_WEIGHT });
    }

    const enabled = await this.enabled();
    const maxSales = Math.max(1, ...[...snapshot.values()].map((p) => p.salesCount));
    const info = new Map<string, ForYouCandidateInfo>([...snapshot.values()].map((p) => [p.id, { categoryId: p.categoryId, popularity: p.salesCount / maxSales }]));
    const exclude = new Set<string>(enabled && (await this.settings.getValue<boolean>("recommendations.excludePurchased")) ? purchased : []);

    const picks = rankForYou({
      seeds: enabled ? seeds : [],
      affinities: enabled ? await this.affinityMap(seeds.map((s) => s.productId)) : new Map(),
      info,
      exclude,
      limit,
    });
    return { products: await this.cards(picks.map((p) => p.productId)), personalized: enabled && seeds.length > 0 };
  }

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  async stats() {
    const rows = await this.prisma.$queryRaw<{ kind: AffinityKind; pairs: number; products: number; computed_at: Date | null }[]>`
      SELECT kind::text AS kind, COUNT(*)::int AS pairs, COUNT(DISTINCT product_id)::int AS products, MAX(computed_at) AS computed_at
      FROM product_affinities GROUP BY kind`;
    const activeProducts = await this.prisma.product.count({ where: { status: "active", deletedAt: null } });
    return {
      enabled: await this.enabled(),
      activeProducts,
      kinds: (["bought_together", "viewed_together"] as const).map((kind) => {
        const row = rows.find((r) => r.kind === kind);
        return { kind, pairs: row?.pairs ?? 0, products: row?.products ?? 0, computedAt: row?.computed_at ?? null };
      }),
    };
  }

  /** What a product page will show, with the raw scores behind it. */
  async preview(productId: string) {
    const affinities = await this.prisma.productAffinity.findMany({
      where: { productId },
      orderBy: [{ kind: "asc" }, { score: "desc" }],
      include: { relatedProduct: { select: { id: true, slug: true, title: true } } },
    });
    return {
      affinities: affinities.map((a) => ({ kind: a.kind, score: a.score, support: a.support, product: a.relatedProduct })),
      ...(await this.forProduct(productId)),
    };
  }
}
