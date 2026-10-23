import type { Metadata } from "next";
import { ProductCard } from "../../../components/product-card";
import { getSearchResults } from "../../../lib/store-api";

export const metadata: Metadata = { robots: { index: false, follow: true } }; // §13.2: search results pages aren't indexed

/**
 * `/search?q=` (docs/PROJECT_SPEC.md §7.3) — M2's Postgres FTS + trigram +
 * Banglish synonyms (`/store/search`), not `/store/catalog/listing`'s
 * category/collection scoping, since a free-text query isn't a facet
 * filter.
 */
export default async function SearchPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ q?: string }> }) {
  const { locale } = await params;
  const { q } = await searchParams;

  if (!q) {
    return <p className="mx-auto max-w-4xl px-4 py-10 text-sm text-surface-foreground/60">{locale === "bn" ? "খুঁজতে কিছু লিখুন।" : "Type something to search."}</p>;
  }

  const result = await getSearchResults(q);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <h1 className="text-xl font-semibold text-surface-foreground">
        {locale === "bn" ? `"${q}" এর জন্য ফলাফল` : `Results for "${q}"`} ({result.meta.total})
      </h1>
      {result.data.length === 0 ? (
        <p className="mt-4 text-sm text-surface-foreground/60">{locale === "bn" ? "কোনো পণ্য পাওয়া যায়নি।" : "No products found. Try a different spelling."}</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {result.data.map((product) => (
            <ProductCard key={product.id} product={product} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
