"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../../i18n/navigation";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../components/ui";

interface BlogPostListItem {
  id: string;
  slug: string;
  title: { en?: string; bn?: string };
  status: "draft" | "published" | "scheduled";
}

/** §16 M10 — blog/lookbook. */
export default function BlogListPage() {
  const t = useTranslations("blog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPostListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [titleEn, setTitleEn] = useState("");
  const [slug, setSlug] = useState("");

  async function load() {
    try {
      setPosts(await api.get<BlogPostListItem[]>("/admin/blog-posts"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load posts");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function handleCreate() {
    try {
      const post = await api.post<BlogPostListItem>("/admin/blog-posts", { title: { en: titleEn }, slug });
      router.push(`/blog/${post.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create post");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <Button onClick={() => setCreating((v) => !v)}>{t("add")}</Button>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      {creating && (
        <Card className="flex flex-wrap items-end gap-2">
          <TextField label={t("titleEn")} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          <TextField label={t("slug")} value={slug} onChange={(e) => setSlug(e.target.value)} />
          <Button onClick={() => void handleCreate()} disabled={!slug || !titleEn}>
            {tCommon("create")}
          </Button>
        </Card>
      )}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="px-4 py-3">{t("titleEn")}</th>
              <th className="px-4 py-3">{t("slug")}</th>
              <th className="px-4 py-3">{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted" onClick={() => router.push(`/blog/${post.id}`)}>
                <td className="px-4 py-3 text-surface-foreground">{post.title.en ?? post.title.bn}</td>
                <td className="px-4 py-3 text-surface-foreground/70">/{post.slug}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{post.status}</td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={3}>
                  {t("noPosts")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
