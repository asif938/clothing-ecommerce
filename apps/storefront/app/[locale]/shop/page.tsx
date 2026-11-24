import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlockRenderer } from "../../../components/block-renderer";
import { CatalogListing } from "../../../components/catalog-listing";
import { readListingConfig, readShopConfig, resolveListingText } from "../../../lib/listing-config";
import { isFilteredListing, parseListingSearchParams } from "../../../lib/listing-params";
import { getListing, getPage, getStoreConfig, getUiStrings } from "../../../lib/store-api";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function localized(value: { bn?: string; en?: string } | null | undefined, locale: string): string | undefined {
  if (!value) return undefined;
  return value[locale as "bn" | "en"] || value.bn || value.en || undefined;
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SearchParams }): Promise<Metadata> {
  const { locale } = await params;
  const [page, strings] = await Promise.all([getPage("shop"), getUiStrings()]);
  const { urlSearchParams } = parseListingSearchParams(await searchParams);
  return {
    title: localized(page?.seoTitle, locale) ?? resolveListingText(strings, locale).allProducts,
    description: localized(page?.seoDescription, locale),
    alternates: { canonical: locale === "en" ? "/en/shop" : "/shop", languages: { bn: "/shop", en: "/en/shop" } },
    // §13.2 — searched/filtered variants aren't indexed; the plain page (and its ?page=N) is.
    robots: isFilteredListing(urlSearchParams) || page?.noindex ? { index: false, follow: true } : undefined,
  };
}

/**
 * `/shop` — every live product with search, filters, sort, view switch and
 * "Load more" (docs/PROJECT_SPEC.md §7.3). Built in code because results
 * depend on the URL; the owner controls it from the admin: Settings → shop /
 * listing (on/off, page size, default sort and view, which filters), and
 * CMS → Pages → "shop" for a banner above the grid and its SEO title.
 */
export default async function ShopPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SearchParams }) {
  const { locale } = await params;
  const storeConfig = await getStoreConfig();
  const shop = readShopConfig(storeConfig);
  if (!shop.enabled) notFound();

  const config = readListingConfig(storeConfig);
  const { params: listingParams, urlSearchParams } = parseListingSearchParams(await searchParams, config.defaultSort);
  const query = { ...listingParams, pageSize: config.pageSize };
  const [listing, page, strings] = await Promise.all([getListing(query), getPage("shop"), getUiStrings()]);
  const banner = page && page.blocksPublished.length > 0 ? <BlockRenderer blocks={page.blocksPublished} locale={locale} /> : null;

  return (
    <CatalogListing
      heading={resolveListingText(strings, locale).allProducts}
      description={null}
      breadcrumb={[]}
      breadcrumbBasePath="/c"
      listing={listing}
      query={query}
      config={config}
      searchParams={urlSearchParams}
      locale={locale}
      showCategoryFilter
      searchBox={shop.searchBox}
      banner={banner}
    />
  );
}
