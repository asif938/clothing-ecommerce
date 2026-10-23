import { notFound } from "next/navigation";
import { ProductDetailView } from "../../../../components/product-detail-view";
import { getProduct, getStoreConfig } from "../../../../lib/store-api";

function localized(value: { bn?: string; en?: string } | null, locale: string): string | undefined {
  if (!value) return undefined;
  return value[locale as "bn" | "en"] ?? value.bn ?? value.en;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;
  const product = await getProduct(slug);
  if (!product) return {};
  const title = localized(product.seoTitle, locale) ?? localized(product.title, locale);
  const description = localized(product.seoDescription, locale) ?? localized(product.shortDescription, locale);
  return {
    title,
    description,
    alternates: { languages: { bn: `/p/${product.slug}`, en: `/en/p/${product.slug}` } },
    openGraph: { title, description, images: product.media[0]?.url ? [product.media[0].url] : undefined },
  };
}

/** Product, Offer, AggregateRating, BreadcrumbList structured data (docs/PROJECT_SPEC.md §7.4, §13.2). */
function buildStructuredData(product: NonNullable<Awaited<ReturnType<typeof getProduct>>>, locale: string) {
  const prices = product.variants.map((v) => v.price / 100);
  const inStock = product.variants.some((v) => v.available);

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: localized(product.title, locale),
    description: localized(product.shortDescription, locale) ?? localized(product.description, locale),
    image: product.media.map((m) => m.url).filter(Boolean),
    sku: product.variants[0]?.sku,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "BDT",
      lowPrice: prices.length > 0 ? Math.min(...prices) : undefined,
      highPrice: prices.length > 0 ? Math.max(...prices) : undefined,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    ...(product.ratingCount > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.ratingAvg, reviewCount: product.ratingCount } }
      : {}),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: locale === "bn" ? "হোম" : "Home", item: "/" },
      ...product.breadcrumb.map((entry, index) => ({ "@type": "ListItem", position: index + 2, name: localized(entry.name, locale), item: `/c/${entry.slug}` })),
      { "@type": "ListItem", position: product.breadcrumb.length + 2, name: localized(product.title, locale), item: `/p/${product.slug}` },
    ],
  };

  return [productLd, breadcrumbLd];
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;
  const [product, config] = await Promise.all([getProduct(slug), getStoreConfig()]);
  if (!product) notFound();

  const whatsappEnabled = config["chat.whatsappEnabled"] === true;
  const whatsappNumber = whatsappEnabled && typeof config["chat.whatsappNumber"] === "string" ? (config["chat.whatsappNumber"] as string) : null;

  return (
    <>
      {buildStructuredData(product, locale).map((data, index) => (
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      ))}
      <ProductDetailView product={product} locale={locale} whatsappNumber={whatsappNumber} />
    </>
  );
}
