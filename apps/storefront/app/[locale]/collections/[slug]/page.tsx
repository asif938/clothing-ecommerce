import { notFound } from "next/navigation";
import { CatalogListing } from "../../../../components/catalog-listing";
import { getCollection, getListing, getStoreConfig } from "../../../../lib/store-api";
import { isFilteredListing, parseListingSearchParams } from "../../../../lib/listing-params";
import { readListingConfig } from "../../../../lib/listing-config";

function localized(value: { bn?: string; en?: string } | null, locale: string): string | undefined {
  if (!value) return undefined;
  return value[locale as "bn" | "en"] ?? value.bn ?? value.en;
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string; locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug, locale } = await params;
  const { urlSearchParams } = parseListingSearchParams(await searchParams);
  const collection = await getCollection(slug);
  if (!collection) return {};
  return {
    title: localized(collection.seoTitle, locale) ?? localized(collection.name, locale),
    description: localized(collection.seoDescription, locale) ?? localized(collection.description, locale),
    // §13.2 — filtered/searched variants aren't indexed; the plain page (and its ?page=N) is.
    robots: isFilteredListing(urlSearchParams) ? { index: false, follow: true } : undefined,
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, locale } = await params;
  const collection = await getCollection(slug);
  if (!collection) notFound();

  const config = readListingConfig(await getStoreConfig());
  const { params: listingParams, urlSearchParams } = parseListingSearchParams(await searchParams, config.defaultSort);
  const query = { collectionId: collection.id, ...listingParams, pageSize: config.pageSize };
  const listing = await getListing(query);

  return (
    <CatalogListing
      heading={collection.name}
      description={collection.description}
      breadcrumb={[]}
      breadcrumbBasePath="/collections"
      listing={listing}
      query={query}
      config={config}
      searchParams={urlSearchParams}
      locale={locale}
    />
  );
}
