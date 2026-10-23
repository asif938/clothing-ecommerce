import { t } from "@clothing/shared";
import { Link } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import type { ProductCard as ProductCardData } from "../lib/store-api";

/** Standard product card (docs/PROJECT_SPEC.md §4.4.3 names 3 card variants; only "standard" is built this milestone — hover-image/quick-add are a presentation-only follow-up, not a data-shape change). */
export function ProductCard({ product, locale }: { product: ProductCardData; locale: string }) {
  return (
    <Link href={`/p/${product.slug}`} className="group flex flex-col gap-2">
      <div className="aspect-[3/4] overflow-hidden rounded-theme bg-muted">
        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- see apps/storefront/components/header.tsx
          <img src={product.imageUrl} alt={t(product.title, locale as "bn" | "en")} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
        )}
      </div>
      <span className="truncate text-sm text-surface-foreground">{t(product.title, locale as "bn" | "en")}</span>
      <span className="flex items-center gap-2 text-sm font-medium text-surface-foreground">
        {formatBdt(product.priceFrom)}
        {product.compareAtFrom && <span className="text-xs text-surface-foreground/50 line-through">{formatBdt(product.compareAtFrom)}</span>}
      </span>
    </Link>
  );
}
