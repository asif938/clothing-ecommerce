import { discountPercent, formatTilePrice, ProductTileActions } from "@clothing/blocks";
import { t } from "@clothing/shared";
import { Link } from "../i18n/navigation";
import type { ProductCard as ProductCardData } from "../lib/store-api";

/**
 * "List" view of a listing: small photo on the left (with the same heart and
 * quick-add buttons as a card), name and price on the right — more products
 * per screen, easy to compare prices.
 */
export function ProductListRow({ product, locale }: { product: ProductCardData; locale: string }) {
  const title = t(product.title, locale as "bn" | "en");
  const percent = discountPercent(product.priceFrom, product.compareAtFrom);
  const href = `/p/${product.slug}`;
  return (
    <div className="flex gap-4 border-b border-border pb-4">
      <div className="relative w-28 shrink-0 sm:w-32">
        <Link href={href} tabIndex={-1} aria-hidden="true" className="block aspect-[3/4] overflow-hidden rounded-theme bg-muted">
          {product.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- see apps/storefront/components/header.tsx
            <img src={product.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          )}
        </Link>
        <ProductTileActions product={{ id: product.id, slug: product.slug, title: product.title }} locale={locale} />
      </div>
      <Link href={href} className="group flex min-w-0 flex-1 flex-col gap-2 py-1">
        <span className="line-clamp-3 text-[15px] leading-snug text-surface-foreground transition-colors group-hover:text-brand">{title}</span>
        <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-surface-foreground">
          {formatTilePrice(product.priceFrom)}
          {product.compareAtFrom !== null && product.compareAtFrom > product.priceFrom && (
            <span className="text-xs font-normal text-surface-foreground/45 line-through">{formatTilePrice(product.compareAtFrom)}</span>
          )}
          {percent !== null && <span className="rounded-[2px] bg-brand px-1.5 py-0.5 text-[11px] font-medium leading-4 text-brand-foreground">−{percent}%</span>}
        </span>
      </Link>
    </div>
  );
}
