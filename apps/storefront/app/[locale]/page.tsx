import { notFound } from "next/navigation";
import { BlockRenderer } from "../../components/block-renderer";
import { getPage } from "../../lib/store-api";

/** Entirely CMS-driven (docs/PROJECT_SPEC.md §7.3) — this route just renders the "home" system page's published blocks. */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const page = await getPage("home");
  if (!page) notFound();

  return <BlockRenderer blocks={page.blocksPublished} locale={locale} />;
}
