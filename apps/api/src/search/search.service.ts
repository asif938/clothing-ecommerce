import { Injectable } from "@nestjs/common";
import { Prisma, type Media } from "@clothing/db";
import { getMediaUrl } from "@clothing/shared/media";
import { PrismaService } from "../prisma/prisma.service";
import { MediaProvidersService } from "../media/media-providers.service";
import type { MediaVariantMap } from "../media/media-driver";
import { buildTsQuery } from "./search-query";
import type { SearchQueryDto } from "./dto";

interface RankedRow {
  id: string;
}

const CARD_IMAGE_WIDTH = 480;

/**
 * Store-facing product search (docs/PROJECT_SPEC.md §16 M2): Postgres FTS
 * on `search_document` (trigger-maintained, 'simple' config — see
 * migration.sql) with the Banglish synonym expansion from
 * `search-query.ts`, plus `pg_trgm` similarity as a typo-tolerant fallback.
 * `search_document` is `Unsupported("tsvector")` in schema.prisma, so it's
 * invisible to the normal Prisma client — ranking runs as a raw query that
 * returns ids only, then a normal `findMany` loads the full, typed rows in
 * that order. Not exercised against a live Postgres in this environment
 * (no DB available here, see docs/PROGRESS.md) — `search-query.spec.ts`
 * covers the part that doesn't need one.
 *
 * Returns the same card shape (`StoreCatalogService`'s `ProductCard`) as
 * every other public listing endpoint — the storefront's search results
 * page is just another product grid.
 */
@Injectable()
export class SearchService {
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

  /**
   * Ids of every live product matching `q`, best match first, capped at
   * `limit`. Used by the catalog listing (`/shop?q=`), which applies its own
   * filters, facets and paging on top. Returns null when the query has no
   * searchable words (the listing then ignores it).
   */
  async rankedProductIds(q: string, limit = 1000): Promise<string[] | null> {
    const synonyms = await this.prisma.searchSynonym.findMany();
    const tsquery = buildTsQuery(q, synonyms);
    if (!tsquery) return null;
    const rows = await this.prisma.$queryRaw<RankedRow[]>`
      SELECT "id" FROM "products"
      WHERE "deleted_at" IS NULL AND "status" = 'active'
      AND (
        "search_document" @@ to_tsquery('simple', ${tsquery})
        OR similarity(COALESCE("title"->>'en', ''), ${q}) > 0.3
        OR similarity(COALESCE("title"->>'bn', ''), ${q}) > 0.3
      )
      ORDER BY ts_rank_cd("search_document", to_tsquery('simple', ${tsquery})) DESC NULLS LAST, "sales_count" DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => row.id);
  }

  async search(query: SearchQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const synonyms = await this.prisma.searchSynonym.findMany();
    const tsquery = buildTsQuery(query.q, synonyms);
    if (!tsquery) return { data: [], meta: { page, pageSize, total: 0 } };

    const whereSql = Prisma.sql`
      "deleted_at" IS NULL AND "status" = 'active'
      AND (
        "search_document" @@ to_tsquery('simple', ${tsquery})
        OR similarity(COALESCE("title"->>'en', ''), ${query.q}) > 0.3
        OR similarity(COALESCE("title"->>'bn', ''), ${query.q}) > 0.3
      )
    `;

    const rows = await this.prisma.$queryRaw<RankedRow[]>`
      SELECT "id" FROM "products"
      WHERE ${whereSql}
      ORDER BY ts_rank_cd("search_document", to_tsquery('simple', ${tsquery})) DESC NULLS LAST, "sales_count" DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `;
    const totalRows = await this.prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM "products" WHERE ${whereSql}`;

    const ids = rows.map((row) => row.id);
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: { variants: { select: { price: true, compareAtPrice: true } }, media: { take: 1, orderBy: { position: "asc" }, include: { media: true } } },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    const ordered = ids.map((id) => byId.get(id)).filter((product): product is NonNullable<typeof product> => !!product);

    const data = await Promise.all(
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

    return { data, meta: { page, pageSize, total: Number(totalRows[0]?.count ?? 0) } };
  }
}
