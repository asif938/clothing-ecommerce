"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, Toggle } from "../../../../components/ui";

interface ChecklistItem {
  key: string;
  label: { bn: string; en: string };
  done: boolean;
  ownerAction: boolean;
  detail: { bn: string; en: string };
}

interface ChecklistResponse {
  items: ChecklistItem[];
  allDone: boolean;
  pendingOwnerActions: number;
}

/** §16 M9 "launch checklist page in admin" — every item is computed from real system state (see apps/api/src/launch-checklist/) except "sitemap submitted", which the owner marks done here themselves. */
export default function LaunchChecklistPage() {
  const t = useTranslations("launchChecklist");
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingSitemap, setSavingSitemap] = useState(false);

  async function load() {
    try {
      setData(await api.get<ChecklistResponse>("/admin/launch-checklist"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load launch checklist");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() is also reused as a manual refresh below.
    void load();
  }, []);

  async function markSitemapSubmitted(value: boolean) {
    setSavingSitemap(true);
    try {
      await api.patch("/admin/settings/ops.sitemapSubmitted", { value });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSavingSitemap(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      <p className="mt-1 text-sm text-surface-foreground/70">{t("subtitle")}</p>
      {error && (
        <div className="mt-4">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      {data && (
        <div className="mt-6 space-y-3">
          <Banner kind={data.allDone ? "success" : "info"}>
            {data.allDone ? t("allDone") : t("pendingCount", { count: data.pendingOwnerActions })}
          </Banner>
          {data.items.map((item) => (
            <Card key={item.key} className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${item.done ? "bg-success" : "bg-warning"}`} />
                  <span className="font-medium text-surface-foreground">{item.label.en ?? item.label.bn}</span>
                  {!item.done && item.ownerAction && (
                    <span className="rounded-theme bg-muted px-2 py-0.5 text-xs text-surface-foreground/70">{t("ownerAction")}</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-surface-foreground/70">{item.detail.en ?? item.detail.bn}</p>
              </div>
              {item.key === "sitemap_submitted" && (
                <Toggle checked={item.done} onChange={markSitemapSubmitted} disabled={savingSitemap} />
              )}
            </Card>
          ))}
          <Button onClick={() => void load()}>{t("refresh")}</Button>
        </div>
      )}
    </div>
  );
}
