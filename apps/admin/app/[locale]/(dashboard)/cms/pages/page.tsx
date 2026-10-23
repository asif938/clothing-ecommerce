"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";

interface PageListItem {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "scheduled" | "published";
  isSystem: boolean;
  needsContent: boolean;
}

export default function PagesListPage() {
  const t = useTranslations("cms");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pages, setPages] = useState<PageListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");

  async function load() {
    try {
      setPages(await api.get<PageListItem[]>("/admin/cms/pages"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load pages");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function handleCreate() {
    try {
      const page = await api.post<PageListItem>("/admin/cms/pages", { slug, title });
      router.push(`/cms/pages/${page.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create page");
    }
  }

  const needsContentCount = pages.filter((p) => p.needsContent).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("pagesTitle")}</h1>
        <Button onClick={() => setCreating((v) => !v)}>{t("addPage")}</Button>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {needsContentCount > 0 && <Banner kind="warning">{t("needsContentChecklist", { count: needsContentCount })}</Banner>}

      {creating && (
        <Card className="flex flex-wrap items-end gap-2">
          <TextField label={t("pageTitle")} value={title} onChange={(e) => setTitle(e.target.value)} />
          <TextField label={t("pageSlug")} value={slug} onChange={(e) => setSlug(e.target.value)} />
          <Button onClick={() => void handleCreate()} disabled={!slug || !title}>
            {tCommon("create")}
          </Button>
        </Card>
      )}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="px-4 py-3">{t("pageTitle")}</th>
              <th className="px-4 py-3">{t("pageSlug")}</th>
              <th className="px-4 py-3">{t("pageStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted" onClick={() => router.push(`/cms/pages/${page.id}`)}>
                <td className="px-4 py-3 text-surface-foreground">
                  {page.title} {page.needsContent && <span className="ml-1 text-xs text-danger">●</span>}
                </td>
                <td className="px-4 py-3 text-surface-foreground/70">/{page.slug}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{page.status}</td>
              </tr>
            ))}
            {pages.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={3}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
