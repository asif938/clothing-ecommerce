import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VisualSearchView } from "../../../../components/visual-search-view";
import { getStoreConfig } from "../../../../lib/store-api";

export const metadata: Metadata = { robots: { index: false, follow: true } };

/** `/search/photo` — visual search (docs/PROJECT_SPEC.md §16 M14), only while `visualSearch.enabled`. */
export default async function PhotoSearchPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const config = await getStoreConfig();
  if (config["visualSearch.enabled"] !== true) notFound();
  return <VisualSearchView locale={locale} />;
}
