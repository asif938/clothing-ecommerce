import { notFound } from "next/navigation";
import { BlockRenderer } from "../../../../components/block-renderer";
import { getBlogPost } from "../../../../lib/store-api";

function localized(value: { bn?: string; en?: string } | null, locale: string): string | undefined {
  if (!value) return undefined;
  return value[locale as "bn" | "en"] ?? value.bn ?? value.en;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;
  const post = await getBlogPost(slug);
  if (!post) return {};
  return {
    title: localized(post.seoTitle, locale) ?? localized(post.title, locale),
    description: localized(post.seoDescription, locale) ?? localized(post.excerpt, locale),
    alternates: { languages: { bn: `/blog/${post.slug}`, en: `/en/blog/${post.slug}` } },
  };
}

/** Blog/lookbook post (docs/PROJECT_SPEC.md §16 M10) — rendered via the same `BlockRenderer` every CMS page uses, so a "lookbook" post is just one built from the `lookbook` hotspot block. */
export default async function BlogPostPage({ params }: { params: Promise<{ slug: string; locale: string }> }) {
  const { slug, locale } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();

  return <BlockRenderer blocks={post.blocksPublished} locale={locale} />;
}
