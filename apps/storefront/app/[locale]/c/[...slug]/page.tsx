import { notFound } from "next/navigation";
import { CatalogListing } from "../../../../components/catalog-listing";
import { getCategory, getListing, getStoreConfig } from "../../../../lib/store-api";
import { isFilteredListing, parseListingSearchParams } from "../../../../lib/listing-params";
import { readListingConfig } from "../../../../lib/listing-config";

function localized(value: { bn?: string; en?: string } | null, locale: string): string | undefined {
  if (!value) return undefined;
  return value[locale as "bn" | "en"] ?? value.bn ?? value.en;
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string[]; locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug, locale } = await params;
  const { urlSearchParams } = parseListingSearchParams(await searchParams);
  const category = await getCategory(slug[slug.length - 1] ?? "");
  if (!category) return {};
  return {
    title: localized(category.seoTitle, locale) ?? localized(category.name, locale),
    description: localized(category.seoDescription, locale) ?? localized(category.description, locale),
    // §13.2 — filtered/searched variants aren't indexed; the plain page (and its ?page=N) is.
    robots: isFilteredListing(urlSearchParams) ? { index: false, follow: true } : undefined,
    alternates: { languages: { bn: `/c/${category.slug}`, en: `/en/c/${category.slug}` } },
  };
}

/** `/c/[...slug]` — clean nested-looking URLs over a flat category slug: only the last segment is actually looked up (docs/PROJECT_SPEC.md §13.2 "clean slugs `/c/men/panjabi`"). */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[]; locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, locale } = await params;
  const categorySlug = slug[slug.length - 1] ?? "";
  const category = await getCategory(categorySlug);
  if (!category) notFound();

  const config = readListingConfig(await getStoreConfig());
  const { params: listingParams, urlSearchParams } = parseListingSearchParams(await searchParams, config.defaultSort);
  const query = { categoryId: category.id, ...listingParams, pageSize: config.pageSize };
  const listing = await getListing(query);

  return (
    <CatalogListing
      heading={category.name}
      description={category.description}
      breadcrumb={category.breadcrumb}
      breadcrumbBasePath="/c"
      listing={listing}
      query={query}
      config={config}
      searchParams={urlSearchParams}
      locale={locale}
    />
  );
}
