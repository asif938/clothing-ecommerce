import { notFound, redirect } from "next/navigation";
import { BlockRenderer } from "../../../../components/block-renderer";
import { getPage, getRedirect } from "../../../../lib/store-api";

function localized(value: { bn?: string; en?: string } | null, locale: string): string | undefined {
  if (!value) return undefined;
  return value[locale as "bn" | "en"] ?? value.bn ?? value.en;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;
  const page = await getPage(slug);
  if (!page) return {};
  return {
    title: localized(page.seoTitle, locale) ?? page.title,
    description: localized(page.seoDescription, locale),
    robots: page.noindex ? { index: false } : undefined,
  };
}

/** CMS pages — about, contact, policies, FAQ, size guide, etc. (docs/PROJECT_SPEC.md §7.3, §9.3). */
export default async function CmsPage({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;
  const page = await getPage(slug);
  if (!page) {
    const redirectTo = await getRedirect(`/pages/${slug}`);
    if (redirectTo?.toPath) redirect(redirectTo.toPath);
    notFound();
  }

  return <BlockRenderer blocks={page.blocksPublished} locale={locale} />;
}
