"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, useRouter } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";
import { useCurrentStaff } from "../../../../../lib/use-current-staff";
import { BlockListEditor, blockErrors, type BlockInstance } from "../../../../../components/block-list-editor";

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
  blocksDraft: BlockInstance[];
}

/** §16 M10 — blog/lookbook editor. The post body uses the same section editor as CMS pages (components/block-list-editor.tsx); saved with the Save button. */
export default function BlogPostEditorPage() {
  const t = useTranslations("blog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const postId = params.id;
  const { staff } = useCurrentStaff();
  const isSuperAdmin = staff?.isSuperAdmin ?? false;

  const [post, setPost] = useState<BlogPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [titleEn, setTitleEn] = useState("");
  const [titleBn, setTitleBn] = useState("");
  const [slug, setSlug] = useState("");
  const [excerptEn, setExcerptEn] = useState("");
  const [excerptBn, setExcerptBn] = useState("");
  const [tags, setTags] = useState("");
  const [blocks, setBlocks] = useState<BlockInstance[]>([]);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api.get<BlogPost>(`/admin/blog-posts/${postId}`);
      setPost(p);
      setTitleEn(p.title.en ?? "");
      setTitleBn(p.title.bn ?? "");
      setSlug(p.slug);
      setExcerptEn(p.excerpt?.en ?? "");
      setExcerptBn(p.excerpt?.bn ?? "");
      setTags(p.tags.join(", "));
      setBlocks(p.blocksDraft);
      setDirty(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load post");
    }
  }, [postId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  async function handleSave(): Promise<boolean> {
    setError(null);
    if (blockErrors(blocks, isSuperAdmin).size > 0) {
      setError(t("fixSections"));
      return false;
    }
    try {
      await api.patch(`/admin/blog-posts/${postId}`, {
        title: { en: titleEn, bn: titleBn || undefined },
        slug,
        excerpt: excerptEn || excerptBn ? { ...(excerptEn ? { en: excerptEn } : {}), ...(excerptBn ? { bn: excerptBn } : {}) } : undefined,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      await api.patch(`/admin/blog-posts/${postId}/blocks`, { blocks });
      setSaved(true);
      await load();
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
      return false;
    }
  }

  async function handlePublish() {
    try {
      if (!(await handleSave())) return;
      await api.post(`/admin/blog-posts/${postId}/publish`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to publish");
    }
  }

  async function handleDelete() {
    if (!window.confirm(t("deleteConfirm"))) return;
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
          {dirty && !saved && <span className="text-sm text-surface-foreground/60">{t("unsaved")}</span>}
          <span className="text-xs text-surface-foreground/50">{post.status === "published" ? t("statusPublished") : t("statusDraft")}</span>
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={t("titleEn")} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          <TextField label={t("titleBn")} value={titleBn} onChange={(e) => setTitleBn(e.target.value)} />
        </div>
        <TextField label={t("slug")} value={slug} onChange={(e) => setSlug(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={t("excerptEn")} value={excerptEn} onChange={(e) => setExcerptEn(e.target.value)} />
          <TextField label={t("excerptBn")} value={excerptBn} onChange={(e) => setExcerptBn(e.target.value)} />
        </div>
        <TextField label={t("tags")} value={tags} onChange={(e) => setTags(e.target.value)} />
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("bodyTitle")}</h2>
        <p className="text-xs text-surface-foreground/60">{t("blocksHint")}</p>
        <BlockListEditor
          blocks={blocks}
          isSuperAdmin={isSuperAdmin}
          onChange={(next) => {
            setBlocks(next);
            setDirty(true);
          }}
        />
      </div>

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
