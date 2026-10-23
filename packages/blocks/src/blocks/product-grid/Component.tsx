import { t } from "@clothing/shared";
import type { BlockComponentProps } from "../../registry.ts";
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

function formatBdt(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString("en-US")}`;
}

export async function ProductGridBlock({ props, locale }: BlockComponentProps<ProductGridProps>) {
  const query = new URLSearchParams({ source: props.source, limit: String(props.limit) });
  if (props.sourceId) query.set("sourceId", props.sourceId);
  if (props.productIds?.length) query.set("productIds", props.productIds.join(","));

  const products = await storeApiGet<ProductCard[]>(`/store/catalog/products?${query.toString()}`);
  if (!products || products.length === 0) return null;

  return (
    <section className="px-6 py-10">
      {props.heading && <h2 className="mb-4 text-center text-2xl font-semibold text-surface-foreground">{t(props.heading, locale as "bn" | "en")}</h2>}
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {products.map((product) => (
          <a key={product.id} href={`/p/${product.slug}`} className="group flex flex-col gap-2">
            <div className="aspect-[3/4] overflow-hidden rounded-theme bg-muted">
              {product.imageUrl && (
                <img src={product.imageUrl} alt={t(product.title, locale as "bn" | "en")} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              )}
            </div>
            <span className="truncate text-sm text-surface-foreground">{t(product.title, locale as "bn" | "en")}</span>
            <span className="flex items-center gap-2 text-sm font-medium text-surface-foreground">
              {formatBdt(product.priceFrom)}
              {product.compareAtFrom && <span className="text-xs text-surface-foreground/50 line-through">{formatBdt(product.compareAtFrom)}</span>}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
