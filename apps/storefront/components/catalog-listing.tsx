import type { ReactNode } from "react";
import { t } from "@clothing/shared";
import { Link } from "../i18n/navigation";
import { resolveListingText, type ListingConfig } from "../lib/listing-config";
import { getUiStrings, type CategoryBreadcrumbEntry, type ListingParams, type ListingResult, type LocalizedTextLike } from "../lib/store-api";
import { ListingBrowser } from "./listing-browser";

interface CatalogListingProps {
  heading: LocalizedTextLike | string;
  description: LocalizedTextLike | null;
  breadcrumb: CategoryBreadcrumbEntry[];
  breadcrumbBasePath: string;
  listing: ListingResult;
  /** What was asked of the API, so "Load more" can ask for the next page of the same. */
  query: ListingParams;
  searchParams: URLSearchParams;
  config: ListingConfig;
  locale: string;
  /** `/shop` only: the category filter and the search box. */
  showCategoryFilter?: boolean;
  searchBox?: boolean;
  /** CMS blocks shown above the heading (the "shop" system page's banner). */
  banner?: ReactNode;
}

/**
 * Shared by `/shop`, `/c/[...slug]` and `/collections/[slug]` (docs/PROJECT_SPEC.md §7.3):
 * breadcrumb and heading here (server-rendered), everything interactive in `ListingBrowser`.
 */
export async function CatalogListing({ heading, description, breadcrumb, breadcrumbBasePath, listing, query, searchParams, config, locale, showCategoryFilter = false, searchBox = false, banner }: CatalogListingProps) {
  const lang = locale as "bn" | "en";
  const text = resolveListingText(await getUiStrings(), locale);
  return (
    <>
      {banner}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
        {breadcrumb.length > 0 && (
          <nav className="mb-3 flex flex-wrap gap-1 text-xs text-surface-foreground/50" aria-label="Breadcrumb">
            <Link href="/">{text.home}</Link>
            {breadcrumb.map((entry) => (
              <span key={entry.id}>
                {" "}
                / <Link href={`${breadcrumbBasePath}/${entry.slug}`}>{t(entry.name, lang)}</Link>
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl text-surface-foreground sm:text-3xl">{typeof heading === "string" ? heading : t(heading, lang)}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-surface-foreground/70">{t(description, lang)}</p>}
        <div className="mt-5">
          {/* Remount on every server render (new filters/sort) so the list starts from the server's first page. */}
          <ListingBrowser key={searchParams.toString()} initial={listing} query={query} config={config} showCategories={showCategoryFilter} searchBox={searchBox} text={text} locale={locale} />
        </div>
      </div>
    </>
  );
}
