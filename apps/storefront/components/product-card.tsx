import { PRODUCT_TILE_CLASS, PRODUCT_TILE_WRAPPER_CLASS, ProductTileActions, ProductTileContent } from "@clothing/blocks";
import { Link } from "../i18n/navigation";
import type { ProductCard as ProductCardData } from "../lib/store-api";

/**
 * Standard product card (docs/PROJECT_SPEC.md §4.4.3). Shares its look with
 * the CMS blocks via `ProductTileContent`, and its wishlist / quick-add
 * buttons via `ProductTileActions` (supplied by `ProductActionsProvider`).
 */
export function ProductCard({ product, locale }: { product: ProductCardData; locale: string }) {
  return (
    <div className={PRODUCT_TILE_WRAPPER_CLASS}>
      <Link href={`/p/${product.slug}`} className={PRODUCT_TILE_CLASS}>
        <ProductTileContent product={product} locale={locale} />
      </Link>
      <ProductTileActions product={{ id: product.id, slug: product.slug, title: product.title }} locale={locale} />
    </div>
  );
}
