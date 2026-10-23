import { notFound } from "next/navigation";
import { CatalogListing } from "../../../../components/catalog-listing";
import { getCollection, getListing } from "../../../../lib/store-api";
import { parseListingSearchParams } from "../../../../lib/listing-params";

function localized(value: { bn?: string; en?: string } | null, locale: string): string | undefined {
  if (!value) return undefined;
  return value[locale as "bn" | "en"] ?? value.bn ?? value.en;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;
  const collection = await getCollection(slug);
  if (!collection) return {};
  return {
    title: localized(collection.seoTitle, locale) ?? localized(collection.name, locale),
    description: localized(collection.seoDescription, locale) ?? localized(collection.description, locale),
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

  const { params: listingParams, urlSearchParams } = parseListingSearchParams(await searchParams);
  const listing = await getListing({ collectionId: collection.id, ...listingParams });

  return (
    <CatalogListing
      heading={collection.name}
      description={collection.description}
      breadcrumb={[]}
      breadcrumbBasePath="/collections"
      listing={listing}
      basePath={`/collections/${collection.slug}`}
      searchParams={urlSearchParams}
      locale={locale}
    />
  );
}
