/**
 * Recommendation maths (docs/PROJECT_SPEC.md §16 M14 "personalized
 * recommendations ('for you', frequently bought together from order
 * data)"). Pure functions — the API feeds them baskets from orders and
 * browsing sessions and stores the result in `product_affinities`.
 */

export const AFFINITY_KINDS = ["bought_together", "viewed_together"] as const;
export type AffinityKind = (typeof AFFINITY_KINDS)[number];

export interface AffinityPair {
  productId: string;
  relatedProductId: string;
  /** 0–1, cosine similarity of the two products' basket sets. */
  score: number;
  /** Baskets that contain both. */
  support: number;
}

export interface PairScoreOptions {
  minSupport: number;
  /** Keep only the strongest N related products per product. */
  maxPerProduct: number;
  /** Baskets larger than this are trimmed (a 40-item wholesale order says little about pairs). */
  maxBasketSize?: number;
}

/**
 * Item-to-item co-occurrence: for every product pair seen together in at
 * least `minSupport` baskets, score = co / sqrt(countA × countB) (cosine).
 * Cosine rather than raw counts so best sellers don't become everyone's
 * "bought together"; rather than lift so tiny counts don't produce
 * enormous scores. Output is directional (A→B and B→A both present) and
 * capped per product, strongest first, ties broken by support then id.
 */
export function scorePairs(baskets: readonly (readonly string[])[], options: PairScoreOptions): AffinityPair[] {
  const maxBasket = options.maxBasketSize ?? 20;
  const itemCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();

  for (const raw of baskets) {
    const basket = [...new Set(raw)].sort().slice(0, maxBasket);
    for (const item of basket) itemCounts.set(item, (itemCounts.get(item) ?? 0) + 1);
    for (let i = 0; i < basket.length; i++) {
      for (let j = i + 1; j < basket.length; j++) {
        const key = `${basket[i]}\u0000${basket[j]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const byProduct = new Map<string, AffinityPair[]>();
  const push = (pair: AffinityPair) => {
    const list = byProduct.get(pair.productId) ?? [];
    list.push(pair);
    byProduct.set(pair.productId, list);
  };
  for (const [key, co] of pairCounts) {
    if (co < options.minSupport) continue;
    const [a, b] = key.split("\u0000") as [string, string];
    const score = co / Math.sqrt((itemCounts.get(a) ?? co) * (itemCounts.get(b) ?? co));
    const rounded = Math.round(score * 10_000) / 10_000;
    push({ productId: a, relatedProductId: b, score: rounded, support: co });
    push({ productId: b, relatedProductId: a, score: rounded, support: co });
  }

  const result: AffinityPair[] = [];
  for (const list of byProduct.values()) {
    list.sort((x, y) => y.score - x.score || y.support - x.support || x.relatedProductId.localeCompare(y.relatedProductId));
    result.push(...list.slice(0, options.maxPerProduct));
  }
  return result;
}

export interface ForYouSeed {
  productId: string;
  /** Recent views weigh less than purchases; the most recent view weighs most. */
  weight: number;
}

export interface ForYouCandidateInfo {
  categoryId: string | null;
  /** Normalised 0–1 popularity (e.g. sales count / max sales count). */
  popularity: number;
}

export interface ForYouInput {
  seeds: ForYouSeed[];
  /** Related products per seed, any kind; `kindWeight` already applied to `score`. */
  affinities: Map<string, { relatedProductId: string; score: number }[]>;
  info: Map<string, ForYouCandidateInfo>;
  exclude: Set<string>;
  limit: number;
}

export interface ForYouPick {
  productId: string;
  score: number;
  /** The seed that contributed most — lets the UI say "because you viewed …". */
  becauseOf: string | null;
}

/** How much a candidate gains for sharing a category with the shopper's seeds (per seed weight share). */
const CATEGORY_BOOST = 0.15;
/** Popularity only breaks ties and fills gaps — it must never outrank a real affinity. */
const POPULARITY_WEIGHT = 0.05;

/**
 * "For you": every seed votes for its related products (seed weight ×
 * affinity score); candidates in the shopper's favourite categories get a
 * small boost; popularity breaks ties. Seeds themselves and anything in
 * `exclude` (purchased, already in cart…) never come back. Candidates are
 * only products that appear in `info` (i.e. currently sellable).
 */
export function rankForYou(input: ForYouInput): ForYouPick[] {
  const totalSeedWeight = input.seeds.reduce((sum, s) => sum + s.weight, 0) || 1;
  const seedIds = new Set(input.seeds.map((s) => s.productId));

  const categoryShare = new Map<string, number>();
  for (const seed of input.seeds) {
    const category = input.info.get(seed.productId)?.categoryId;
    if (category) categoryShare.set(category, (categoryShare.get(category) ?? 0) + seed.weight / totalSeedWeight);
  }

  const scores = new Map<string, { score: number; best: number; becauseOf: string | null }>();
  for (const seed of input.seeds) {
    for (const related of input.affinities.get(seed.productId) ?? []) {
      const contribution = seed.weight * related.score;
      const entry = scores.get(related.relatedProductId) ?? { score: 0, best: 0, becauseOf: null };
      entry.score += contribution;
      if (contribution > entry.best) {
        entry.best = contribution;
        entry.becauseOf = seed.productId;
      }
      scores.set(related.relatedProductId, entry);
    }
  }

  const picks: ForYouPick[] = [];
  for (const [productId, candidate] of input.info) {
    if (seedIds.has(productId) || input.exclude.has(productId)) continue;
    const affinity = scores.get(productId);
    const categoryBoost = candidate.categoryId ? (categoryShare.get(candidate.categoryId) ?? 0) * CATEGORY_BOOST : 0;
    const score = (affinity?.score ?? 0) / totalSeedWeight + categoryBoost + candidate.popularity * POPULARITY_WEIGHT;
    if (score <= 0) continue;
    picks.push({ productId, score: Math.round(score * 1_000_000) / 1_000_000, becauseOf: affinity?.becauseOf ?? null });
  }
  picks.sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId));
  return picks.slice(0, input.limit);
}

/** Seeds from a recently-viewed list (most recent first): weight decays 1, 0.85, 0.72… so today's browsing leads. */
export function viewedSeeds(productIds: readonly string[], baseWeight = 1, decay = 0.85): ForYouSeed[] {
  const seen = new Set<string>();
  const seeds: ForYouSeed[] = [];
  for (const id of productIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    seeds.push({ productId: id, weight: Math.round(baseWeight * Math.pow(decay, seeds.length) * 1000) / 1000 });
  }
  return seeds;
}

/** Hand-picked relations first (staff intent wins), then computed ones, de-duplicated, never the product itself. */
export function mergeRecommendationIds(selfId: string | null, manual: readonly string[], computed: readonly string[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>(selfId ? [selfId] : []);
  for (const id of [...manual, ...computed]) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * "Frequently bought together" for a whole cart: each cart line's related
 * products are summed (so an item that pairs with two cart lines ranks
 * above one that pairs with one); cart items never come back.
 */
export function aggregateCartAffinities(cartProductIds: readonly string[], affinities: Map<string, { relatedProductId: string; score: number }[]>, limit: number): string[] {
  const inCart = new Set(cartProductIds);
  const totals = new Map<string, number>();
  for (const id of inCart) {
    for (const related of affinities.get(id) ?? []) {
      if (inCart.has(related.relatedProductId)) continue;
      totals.set(related.relatedProductId, (totals.get(related.relatedProductId) ?? 0) + related.score);
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id]) => id);
}
