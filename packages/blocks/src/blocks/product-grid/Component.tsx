import { t } from "@clothing/shared";
import { PRODUCT_TILE_CLASS, ProductTileContent } from "../../product-tile.tsx";
import type { BlockComponentProps } from "../../registry.ts";
import { SectionHeading } from "../../section-heading.tsx";
import { storeApiGet } from "../../store-api.ts";
import type { ProductGridProps } from "./schema.ts";

interface ProductCard {
  id: string;
  slug: string;
  title: { bn?: string; en?: string };
  imageUrl: string | null;
  priceFrom: number;
  compareAtFrom: number | null;
}

export async function ProductGridBlock({ props, locale }: BlockComponentProps<ProductGridProps>) {
  const query = new URLSearchParams({ source: props.source, limit: String(props.limit) });
  if (props.sourceId) query.set("sourceId", props.sourceId);
  if (props.productIds?.length) query.set("productIds", props.productIds.join(","));

  const products = await storeApiGet<ProductCard[]>(`/store/catalog/products?${query.toString()}`);
  if (!products || products.length === 0) return null;

  return (
    <section className="px-4 py-12 sm:px-8 sm:py-20">
      {props.heading && <SectionHeading>{t(props.heading, locale as "bn" | "en")}</SectionHeading>}
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 sm:gap-y-12 md:grid-cols-4">
        {products.map((product) => (
          <a key={product.id} href={`${locale === "en" ? "/en" : ""}/p/${product.slug}`} className={PRODUCT_TILE_CLASS}>
            <ProductTileContent product={product} locale={locale} />
          </a>
        ))}
      </div>
    </section>
  );
}
