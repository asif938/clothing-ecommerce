import { Injectable } from "@nestjs/common";
import { Prisma } from "@clothing/db";
import { PrismaService } from "../prisma/prisma.service";
import { buildTsQuery } from "./search-query";
import type { SearchQueryDto } from "./dto";

interface RankedRow {
  id: string;
}

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
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

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
      include: { category: true, variants: { select: { id: true, price: true, compareAtPrice: true }, take: 1 }, media: { take: 1, include: { media: true } } },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    const data = ids.map((id) => byId.get(id)).filter((product): product is NonNullable<typeof product> => !!product);

    return { data, meta: { page, pageSize, total: Number(totalRows[0]?.count ?? 0) } };
  }
}
