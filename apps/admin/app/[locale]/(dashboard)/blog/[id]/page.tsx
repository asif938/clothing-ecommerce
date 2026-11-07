"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, useRouter } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";

interface LocalizedText {
  en?: string;
  bn?: string;
}
interface BlogPost {
  id: string;
  title: LocalizedText;
  slug: string;
  excerpt: LocalizedText | null;
  tags: string[];
  status: "draft" | "published" | "scheduled";
  blocksDraft: unknown[];
}

/** §16 M10 — blog/lookbook editor. A plain JSON textarea for blocks, the same fallback every non-`hero` block type already gets in the CMS page editor (M3) — no bespoke per-block forms here either. */
export default function BlogPostEditorPage() {
  const t = useTranslations("blog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const postId = params.id;

  const [post, setPost] = useState<BlogPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [titleEn, setTitleEn] = useState("");
  const [titleBn, setTitleBn] = useState("");
  const [slug, setSlug] = useState("");
  const [excerptEn, setExcerptEn] = useState("");
  const [tags, setTags] = useState("");
  const [blocksJson, setBlocksJson] = useState("[]");

  const load = useCallback(async () => {
    try {
      const p = await api.get<BlogPost>(`/admin/blog-posts/${postId}`);
      setPost(p);
      setTitleEn(p.title.en ?? "");
      setTitleBn(p.title.bn ?? "");
      setSlug(p.slug);
      setExcerptEn(p.excerpt?.en ?? "");
      setTags(p.tags.join(", "));
      setBlocksJson(JSON.stringify(p.blocksDraft, null, 2));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load post");
    }
  }, [postId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  async function handleSave() {
    setError(null);
    try {
      await api.patch(`/admin/blog-posts/${postId}`, {
        title: { en: titleEn, bn: titleBn || undefined },
        slug,
        excerpt: excerptEn ? { en: excerptEn } : undefined,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      let blocks: unknown[];
      try {
        blocks = JSON.parse(blocksJson);
      } catch {
        setError("Blocks JSON is invalid");
        return;
      }
      await api.patch(`/admin/blog-posts/${postId}/blocks`, { blocks });
      setSaved(true);
      await load();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  async function handlePublish() {
    try {
      await handleSave();
      await api.post(`/admin/blog-posts/${postId}/publish`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to publish");
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/admin/blog-posts/${postId}`);
      router.push("/blog");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete");
    }
  }

  if (!post) {
    return (
      <div className="flex flex-col gap-4">
        {error && <Banner kind="error">{error}</Banner>}
        <p className="text-sm text-surface-foreground/60">{tCommon("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href="/blog" className="text-sm text-surface-foreground/60 hover:underline">
          ← {t("backToList")}
        </Link>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-success">{t("saved")}</span>}
          <span className="text-xs text-surface-foreground/50">{post.status === "published" ? t("statusPublished") : t("statusDraft")}</span>
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t("titleEn")} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          <TextField label={t("titleBn")} value={titleBn} onChange={(e) => setTitleBn(e.target.value)} />
        </div>
        <TextField label={t("slug")} value={slug} onChange={(e) => setSlug(e.target.value)} />
        <TextField label={t("excerptEn")} value={excerptEn} onChange={(e) => setExcerptEn(e.target.value)} />
        <TextField label={t("tags")} value={tags} onChange={(e) => setTags(e.target.value)} />
      </Card>

      <Card className="flex flex-col gap-3">
        <p className="text-xs text-surface-foreground/60">{t("blocksHint")}</p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("blocksDraft")}</span>
          <textarea
            className="min-h-[240px] rounded-theme border border-border bg-surface px-3 py-2 font-mono text-xs"
            value={blocksJson}
            onChange={(e) => setBlocksJson(e.target.value)}
          />
        </label>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={() => void handleSave()}>{tCommon("save")}</Button>
        <Button variant="secondary" onClick={() => void handlePublish()}>
          {t("publish")}
        </Button>
        <button onClick={() => void handleDelete()} className="text-sm text-danger">
          {t("delete")}
        </button>
      </div>
    </div>
  );
}
