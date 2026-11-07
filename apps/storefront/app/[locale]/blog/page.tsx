import { t } from "@clothing/shared";
import { Link } from "../../../i18n/navigation";
import { getBlogPosts } from "../../../lib/store-api";

/** Blog/lookbook list (docs/PROJECT_SPEC.md §16 M10). */
export default async function BlogListPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { items } = await getBlogPosts(1);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-surface-foreground">{locale === "bn" ? "ব্লগ ও লুকবুক" : "Blog & lookbook"}</h1>
      {items.length === 0 && <p className="text-sm text-surface-foreground/60">{locale === "bn" ? "কোনো পোস্ট নেই।" : "No posts yet."}</p>}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {items.map((post) => (
          <Link key={post.id} href={`/blog/${post.slug}`} className="flex flex-col gap-2">
            <h2 className="text-base font-medium text-surface-foreground">{t(post.title, locale as "bn" | "en")}</h2>
            {post.excerpt && <p className="text-sm text-surface-foreground/70">{t(post.excerpt, locale as "bn" | "en")}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
