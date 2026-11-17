import { PRODUCT_TILE_CLASS, ProductTileContent } from "@clothing/blocks";
import { Link } from "../i18n/navigation";
import type { ProductCard as ProductCardData } from "../lib/store-api";

/** Standard product card (docs/PROJECT_SPEC.md §4.4.3 names 3 card variants; only "standard" is built this milestone — hover-image/quick-add are a presentation-only follow-up, not a data-shape change). Shares its look with the CMS blocks via `ProductTileContent`. */
export function ProductCard({ product, locale }: { product: ProductCardData; locale: string }) {
  return (
    <Link href={`/p/${product.slug}`} className={PRODUCT_TILE_CLASS}>
      <ProductTileContent product={product} locale={locale} />
    </Link>
  );
}
