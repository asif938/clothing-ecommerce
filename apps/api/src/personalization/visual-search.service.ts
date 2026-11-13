import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import sharp from "sharp";
import { Prisma, type Media } from "@clothing/db";
import type { AiOutput } from "@clothing/shared/ai";
import {
  combinedScore,
  computeVisualVector,
  tagSimilarity,
  tagTokens,
  VISUAL_HEIGHT,
  VISUAL_VECTOR_VERSION,
  VISUAL_WIDTH,
  visualSimilarity,
} from "@clothing/shared/personalization";
import type { AiImageInput } from "@clothing/shared/providers";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import { CacheService } from "../cache/cache.service";
import { MediaProvidersService } from "../media/media-providers.service";
import type { MediaVariantMap } from "../media/media-driver";
import { assertSafeUpload, sniffImageMime } from "../media/media-sniff";
import { AiService } from "../ai/ai.service";
import { StoreCatalogService, type ProductCard } from "../store-catalog/store-catalog.service";
import type { AuthenticatedStaff } from "../common/types";

/** Images per product that get indexed (the first few gallery shots cover front/back/detail). */
const IMAGES_PER_PRODUCT = 3;
const INDEX_BATCH = 12;
const AI_TAG_BATCH = 3;
const AI_IMAGE_EDGE_PX = 768;
const INDEX_CACHE_KEY = "visual:index";
const INDEX_CACHE_TTL_SECONDS = 300;
const VISUAL_CACHE_TAG = "visual-index";
/** Results below this score are noise rather than "similar". */
const MIN_SCORE = 0.25;
const AI_STOP_CODES = new Set(["AI_DISABLED", "AI_FEATURE_DISABLED", "AI_NO_PROVIDER", "AI_BUDGET_EXCEEDED"]);

interface IndexedProduct {
  productId: string;
  vectors: number[][];
  tokens: Set<string>;
}

export interface VisualSearchResult {
  products: (ProductCard & { score: number })[];
  /** What the AI saw in the photo, when AI vision ran. */
  tags: AiOutput<"visual_tags"> | null;
  indexedProducts: number;
}

type VisualTags = AiOutput<"visual_tags">;

function tagWords(tags: VisualTags | null | undefined): string[] {
  if (!tags) return [];
  return [tags.garment, ...tags.colors, tags.pattern ?? "", ...(tags.style ?? []), ...tags.keywords];
}

/**
 * Visual search (docs/PROJECT_SPEC.md §16 M14 "image upload → similar
 * products via AI embeddings/vision"). A background sweep turns the first
 * few gallery images of every active product into a small local feature
 * vector (`computeVisualVector` — colour + silhouette, no provider needed),
 * and optionally AI vision tags. A shopper's photo gets the same treatment
 * and is ranked against the index in memory. No vector database: the index
 * is a few hundred numbers per product, cached for five minutes.
 */
@Injectable()
export class VisualSearchService {
  private readonly logger = new Logger(VisualSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly mediaProviders: MediaProvidersService,
    private readonly ai: AiService,
    private readonly catalog: StoreCatalogService,
  ) {}

  // ---------------------------------------------------------------------------
  // Indexing
  // ---------------------------------------------------------------------------

  private async download(media: Media): Promise<Buffer> {
    const driver = await this.mediaProviders.resolveDriverForAsset(media);
    return await driver.downloadOriginal({ storageKey: media.storageKey, externalId: media.externalId, resourceType: media.resourceType, variants: media.variants as MediaVariantMap | null });
  }

  /** Decodes any supported image into the fixed-size RGB buffer the feature extractor expects. */
  async vectorFor(image: Buffer): Promise<number[]> {
    const { data, info } = await sharp(image).rotate().resize(VISUAL_WIDTH, VISUAL_HEIGHT, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return computeVisualVector(data, info.width, info.height, info.channels);
  }

  private async aiImage(image: Buffer): Promise<AiImageInput> {
    const jpeg = await sharp(image).rotate().resize({ width: AI_IMAGE_EDGE_PX, height: AI_IMAGE_EDGE_PX, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    return { mediaType: "image/jpeg", base64: jpeg.toString("base64") };
  }

  /** One scheduler tick: index up to `INDEX_BATCH` images, then AI-tag a few if that's switched on. */
  async indexSweep(): Promise<{ indexed: number; tagged: number }> {
    if (!(await this.settings.getValue<boolean>("visualSearch.enabled"))) return { indexed: 0, tagged: 0 };

    const pending = await this.prisma.$queryRaw<{ product_id: string; media_id: string }[]>`
      SELECT ranked.product_id, ranked.media_id FROM (
        SELECT pm.product_id, pm.media_id, ROW_NUMBER() OVER (PARTITION BY pm.product_id ORDER BY pm.position, pm.id) AS rn
        FROM product_media pm
        JOIN products p ON p.id = pm.product_id AND p.status::text = 'active' AND p.deleted_at IS NULL
        JOIN media m ON m.id = pm.media_id AND m.kind::text = 'image' AND m.deleted_at IS NULL
      ) ranked
      LEFT JOIN product_visual_features f ON f.product_id = ranked.product_id AND f.media_id = ranked.media_id
      WHERE ranked.rn <= ${IMAGES_PER_PRODUCT}
        AND (f.id IS NULL OR f.version <> ${VISUAL_VECTOR_VERSION} OR (f.error IS NOT NULL AND f.computed_at < NOW() - INTERVAL '1 day'))
      ORDER BY ranked.product_id
      LIMIT ${INDEX_BATCH}`;

    let indexed = 0;
    for (const row of pending) {
      const media = await this.prisma.media.findUnique({ where: { id: row.media_id } });
      if (!media) continue;
      let vector: number[] = [];
      let error: string | null = null;
      try {
        vector = await this.vectorFor(await this.download(media));
        indexed++;
      } catch (err) {
        error = (err instanceof Error ? err.message : "Unknown error").slice(0, 500);
        this.logger.warn(`Visual index failed for media ${media.id}: ${error}`);
      }
      await this.prisma.productVisualFeature.upsert({
        where: { productId_mediaId: { productId: row.product_id, mediaId: row.media_id } },
        create: { productId: row.product_id, mediaId: row.media_id, version: VISUAL_VECTOR_VERSION, vector, error },
        update: { version: VISUAL_VECTOR_VERSION, vector, error, computedAt: new Date() },
      });
    }

    const tagged = await this.aiTagSweep();
    if (indexed > 0 || tagged > 0) this.cache.invalidateTag(VISUAL_CACHE_TAG);
    return { indexed, tagged };
  }

  /** AI vision tags for each product's main image — only with both AI switches on; stops quietly on budget/config errors. */
  private async aiTagSweep(): Promise<number> {
    const [useAi, indexCatalog] = await Promise.all([this.settings.getValue<boolean>("visualSearch.useAi"), this.settings.getValue<boolean>("visualSearch.aiIndexCatalog")]);
    if (!useAi || !indexCatalog) return 0;

    const rows = await this.prisma.$queryRaw<{ id: string; product_id: string; media_id: string }[]>`
      SELECT f.id, f.product_id, f.media_id FROM product_visual_features f
      JOIN (SELECT DISTINCT ON (product_id) product_id, media_id FROM product_media ORDER BY product_id, position, id) first_image
        ON first_image.product_id = f.product_id AND first_image.media_id = f.media_id
      WHERE f.ai_tagged_at IS NULL AND f.error IS NULL
      LIMIT ${AI_TAG_BATCH}`;

    let tagged = 0;
    for (const row of rows) {
      const media = await this.prisma.media.findUnique({ where: { id: row.media_id } });
      if (!media) continue;
      try {
        const result = await this.ai.generate({ feature: "visual_tags", variables: {}, images: [await this.aiImage(await this.download(media))], actor: null, entity: { type: "product", id: row.product_id } });
        await this.prisma.productVisualFeature.update({ where: { id: row.id }, data: { aiTags: result.output as Prisma.InputJsonValue, aiTaggedAt: new Date() } });
        tagged++;
      } catch (err) {
        const code = err instanceof HttpException ? (err.getResponse() as { code?: string } | string) : null;
        if (code && typeof code === "object" && code.code && AI_STOP_CODES.has(code.code)) return tagged;
        // Any other failure: mark it tagged-without-tags so one bad image can't burn budget every minute.
        await this.prisma.productVisualFeature.update({ where: { id: row.id }, data: { aiTaggedAt: new Date() } });
        this.logger.warn(`AI visual tags failed for product ${row.product_id}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }
    return tagged;
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  private async loadIndex(): Promise<IndexedProduct[]> {
    const cached = this.cache.get<IndexedProduct[]>(INDEX_CACHE_KEY);
    if (cached) return cached;
    const rows = await this.prisma.productVisualFeature.findMany({
      where: { version: VISUAL_VECTOR_VERSION, error: null, product: { status: "active", deletedAt: null } },
      select: { productId: true, vector: true, aiTags: true, product: { select: { tags: true, title: true, category: { select: { name: true } } } } },
    });
    const byProduct = new Map<string, IndexedProduct>();
    for (const row of rows) {
      const entry = byProduct.get(row.productId) ?? { productId: row.productId, vectors: [], tokens: new Set<string>() };
      if (row.vector.length > 0) entry.vectors.push(row.vector);
      const title = row.product.title as { bn?: string; en?: string } | null;
      const category = row.product.category?.name as { bn?: string; en?: string } | null | undefined;
      for (const token of tagTokens([...row.product.tags, title?.en, title?.bn, category?.en, ...tagWords(row.aiTags as VisualTags | null)])) entry.tokens.add(token);
      byProduct.set(row.productId, entry);
    }
    const index = [...byProduct.values()].filter((p) => p.vectors.length > 0);
    this.cache.set(INDEX_CACHE_KEY, index, { ttlSeconds: INDEX_CACHE_TTL_SECONDS, tags: [VISUAL_CACHE_TAG] });
    return index;
  }

  private rank(index: IndexedProduct[], query: number[][], queryTokens: Set<string> | null, excludeId: string | null): { productId: string; score: number }[] {
    const scored: { productId: string; score: number }[] = [];
    for (const product of index) {
      if (product.productId === excludeId) continue;
      let best = 0;
      for (const q of query) for (const v of product.vectors) best = Math.max(best, visualSimilarity(q, v));
      const score = combinedScore(best, queryTokens && queryTokens.size > 0 ? tagSimilarity(queryTokens, product.tokens) : null);
      if (score >= MIN_SCORE) scored.push({ productId: product.productId, score });
    }
    return scored.sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId));
  }

  /** Fixed one-hour window per visitor, in the in-memory cache (same free-tier trade-off as everything else cached there). */
  private takeRateToken(visitorKey: string, perHour: number): void {
    const key = `visual:rate:${visitorKey}`;
    const now = Date.now();
    const entry = this.cache.get<{ count: number; resetAt: number }>(key) ?? { count: 0, resetAt: now + 3_600_000 };
    if (entry.count >= perHour) {
      throw new HttpException({ code: "VISUAL_SEARCH_RATE_LIMITED", message: "Too many photo searches — please try again a little later." }, HttpStatus.TOO_MANY_REQUESTS);
    }
    entry.count++;
    this.cache.set(key, entry, { ttlSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) });
  }

  async search(file: { buffer: Buffer; mimetype: string } | undefined, visitorKey: string, options: { enforceEnabled: boolean } = { enforceEnabled: true }): Promise<VisualSearchResult> {
    if (options.enforceEnabled && !(await this.settings.getValue<boolean>("visualSearch.enabled"))) {
      throw new BadRequestException({ code: "VISUAL_SEARCH_DISABLED", message: "Search by photo is turned off." });
    }
    if (!file || file.buffer.length === 0) throw new BadRequestException({ code: "NO_IMAGE", message: "Please choose a photo." });
    assertSafeUpload(file.buffer, file.mimetype);
    if (!sniffImageMime(file.buffer)) throw new BadRequestException({ code: "NOT_AN_IMAGE", message: "Please upload a JPEG, PNG, WebP or GIF photo." });
    this.takeRateToken(visitorKey, await this.settings.getValue<number>("visualSearch.perVisitorPerHour"));

    let vector: number[];
    try {
      vector = await this.vectorFor(file.buffer);
    } catch {
      throw new BadRequestException({ code: "UNREADABLE_IMAGE", message: "We couldn't read that photo — try another one." });
    }

    let tags: VisualTags | null = null;
    if ((await this.settings.getValue<boolean>("visualSearch.useAi")) && (await this.settings.getValue<boolean>("ai.enabled"))) {
      try {
        const result = await this.ai.generate({ feature: "visual_tags", variables: {}, images: [await this.aiImage(file.buffer)], actor: null, entity: { type: "visual_search", id: "query" } });
        tags = result.output;
      } catch (err) {
        // AI is an enhancement here — budget exhausted or provider down still returns pixel-based results.
        this.logger.warn(`Visual search AI tags skipped: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    const index = await this.loadIndex();
    const maxResults = await this.settings.getValue<number>("visualSearch.maxResults");
    const ranked = this.rank(index, [vector], tags ? tagTokens(tagWords(tags)) : null, null).slice(0, maxResults);
    const cards = await this.catalog.listProducts({ source: "manual", productIds: ranked.map((r) => r.productId), limit: ranked.length });
    const scoreById = new Map(ranked.map((r) => [r.productId, r.score]));
    return { products: cards.map((c) => ({ ...c, score: scoreById.get(c.id) ?? 0 })), tags, indexedProducts: index.length };
  }

  /** "Similar" on a product page: other products whose photos look most like this one's. Empty until the product is indexed. */
  async similarTo(productId: string, limit: number): Promise<string[]> {
    const index = await this.loadIndex();
    const self = index.find((p) => p.productId === productId);
    if (!self) return [];
    return this.rank(index, self.vectors, self.tokens, productId)
      .slice(0, limit)
      .map((r) => r.productId);
  }

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  async status() {
    const [enabled, useAi, aiIndexCatalog, activeProducts, indexedProducts, images, errors, aiTagged] = await Promise.all([
      this.settings.getValue<boolean>("visualSearch.enabled"),
      this.settings.getValue<boolean>("visualSearch.useAi"),
      this.settings.getValue<boolean>("visualSearch.aiIndexCatalog"),
      this.prisma.product.count({ where: { status: "active", deletedAt: null } }),
      this.prisma.productVisualFeature.groupBy({ by: ["productId"], where: { version: VISUAL_VECTOR_VERSION, error: null } }).then((g) => g.length),
      this.prisma.productVisualFeature.count({ where: { version: VISUAL_VECTOR_VERSION, error: null } }),
      this.prisma.productVisualFeature.count({ where: { error: { not: null } } }),
      this.prisma.productVisualFeature.count({ where: { aiTags: { not: Prisma.DbNull } } }),
    ]);
    return { enabled, useAi, aiIndexCatalog, activeProducts, indexedProducts, images, errors, aiTagged, version: VISUAL_VECTOR_VERSION };
  }

  async reindex(actor: AuthenticatedStaff): Promise<{ cleared: number }> {
    const result = await this.prisma.productVisualFeature.deleteMany({});
    this.cache.invalidateTag(VISUAL_CACHE_TAG);
    await this.audit.record({ actorType: "staff", actorId: actor.id, action: "visual_search.reindex", entityType: "product_visual_feature", entityId: "all", after: { cleared: result.count } });
    return { cleared: result.count };
  }
}
