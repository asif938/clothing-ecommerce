import { t } from "@clothing/shared";
import { CatalogFilters, PriceRangeDisplay } from "./catalog-filters";
import { Pagination } from "./pagination";
import { ProductCard } from "./product-card";
import type { CategoryBreadcrumbEntry, ListingResult, LocalizedTextLike } from "../lib/store-api";
import { Link } from "../i18n/navigation";

interface CatalogListingProps {
  heading: LocalizedTextLike;
  description: LocalizedTextLike | null;
  breadcrumb: CategoryBreadcrumbEntry[];
  breadcrumbBasePath: string;
  listing: ListingResult;
  basePath: string;
  searchParams: URLSearchParams;
  locale: string;
}

/** Shared by `/c/[...slug]` and `/collections/[slug]` — same grid/filter/sort/pagination shape over either scope (docs/PROJECT_SPEC.md §7.3). */
export function CatalogListing({ heading, description, breadcrumb, breadcrumbBasePath, listing, basePath, searchParams, locale }: CatalogListingProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      {breadcrumb.length > 0 && (
        <nav className="mb-4 flex flex-wrap gap-1 text-xs text-surface-foreground/50" aria-label="Breadcrumb">
          <Link href="/">{locale === "bn" ? "হোম" : "Home"}</Link>
          {breadcrumb.map((entry) => (
            <span key={entry.id}>
              {" "}
              / <Link href={`${breadcrumbBasePath}/${entry.slug}`}>{t(entry.name, locale as "bn" | "en")}</Link>
            </span>
          ))}
        </nav>
      )}
      <h1 className="text-2xl font-semibold text-surface-foreground">{t(heading, locale as "bn" | "en")}</h1>
      {description && <p className="mt-2 max-w-2xl text-sm text-surface-foreground/70">{t(description, locale as "bn" | "en")}</p>}
      <PriceRangeDisplay range={listing.facets.priceRange} />

      <div className="mt-6 flex flex-col gap-6 sm:flex-row">
        <aside className="w-full shrink-0 sm:w-56">
          <CatalogFilters facets={listing.facets.attributes} locale={locale} />
        </aside>
        <div className="flex-1">
          {listing.data.length === 0 ? (
            <p className="text-sm text-surface-foreground/60">{locale === "bn" ? "কোনো পণ্য পাওয়া যায়নি।" : "No products found."}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {listing.data.map((product) => (
                <ProductCard key={product.id} product={product} locale={locale} />
              ))}
            </div>
          )}
          <Pagination page={listing.meta.page} pageSize={listing.meta.pageSize} total={listing.meta.total} basePath={basePath} searchParams={searchParams} />
        </div>
      </div>
    </div>
  );
}
