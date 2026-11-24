import { t } from "@clothing/shared";

/** The few fields a product tile needs — a subset of the storefront's product-card payload. */
export interface ProductTileData {
  title: { bn?: string; en?: string };
  imageUrl: string | null;
  /** Poisha (golden rule 3). */
  priceFrom: number;
  compareAtFrom: number | null;
}

export function formatTilePrice(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString("en-US")}`;
}

/** Whole-number percent off, or null when the compare-at price isn't actually higher. Derived from the two server prices, never typed by hand. */
export function discountPercent(priceFrom: number, compareAtFrom: number | null): number | null {
  if (compareAtFrom === null || compareAtFrom <= priceFrom || compareAtFrom <= 0) return null;
  const percent = Math.round((1 - priceFrom / compareAtFrom) * 100);
  return percent >= 1 ? percent : null;
}

/** Class for the box around a tile's link and its action buttons (`ProductTileActions`), which sit over the photo. Buttons can't go inside the link itself. */
export const PRODUCT_TILE_WRAPPER_CLASS = "relative";

/** Class for the link that wraps a tile's content (blocks use a plain `<a>`, the storefront's catalog uses its locale-aware `Link`). */
export const PRODUCT_TILE_CLASS = "group flex flex-col gap-3";

/**
 * Inside of a product tile: a 3:4 photo plate with an optional percent-off tag,
 * a two-line title and the price. The photo eases in slowly on hover; there is
 * deliberately nothing else moving.
 */
export function ProductTileContent({ product, locale, lazy = true }: { product: ProductTileData; locale: string; lazy?: boolean }) {
  const title = t(product.title, locale as "bn" | "en");
  const percent = discountPercent(product.priceFrom, product.compareAtFrom);
  return (
    <>
      <div className="relative aspect-[3/4] overflow-hidden rounded-theme bg-muted">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={title}
            loading={lazy ? "lazy" : undefined}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        )}
        {percent !== null && (
          <span className="absolute left-2 top-2 rounded-[2px] bg-brand px-1.5 py-0.5 text-[11px] font-medium leading-4 text-brand-foreground sm:left-3 sm:top-3 sm:px-2 sm:text-xs">−{percent}%</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="line-clamp-2 min-h-[2.5em] text-[13px] leading-[1.25] text-surface-foreground transition-colors group-hover:text-brand sm:text-sm">{title}</span>
        <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-surface-foreground">
          {formatTilePrice(product.priceFrom)}
          {product.compareAtFrom !== null && product.compareAtFrom > product.priceFrom && (
            <span className="text-xs font-normal text-surface-foreground/45 line-through">{formatTilePrice(product.compareAtFrom)}</span>
          )}
        </span>
      </div>
    </>
  );
}
