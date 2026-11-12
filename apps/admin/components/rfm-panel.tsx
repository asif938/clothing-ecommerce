"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../lib/api";
import { localized, money } from "../lib/format";
import { Banner, Button, Card } from "./ui";

interface RfmSummary {
  lastRunAt: string | null;
  segments: { segment: string; label: { bn: string; en: string }; customers: number; avgSpent: number }[];
}

/** RFM overview + one-click preset segments (§8.2 Customers "RFM presets", §16 M13). */
export function RfmPanel({ onPresetsCreated }: { onPresetsCreated: () => void }) {
  const t = useTranslations("rfm");
  const locale = useLocale();
  const [summary, setSummary] = useState<RfmSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSummary(await api.get<RfmSummary>("/admin/crm/rfm"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  async function run(path: string, success: (r: Record<string, unknown>) => string) {
    setError(null);
    setNotice(null);
    try {
      const result = await api.post<Record<string, unknown>>(path, {});
      setNotice(success(result));
      await load();
      onPresetsCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-surface-foreground">{t("title")}</h2>
          <p className="text-xs text-surface-foreground/60">{summary?.lastRunAt ? t("lastRun", { date: new Date(summary.lastRunAt).toLocaleString() }) : t("neverRun")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void run("/admin/crm/rfm/run", (r) => t("scored", { count: Number(r.scored ?? 0) }))}>
            {t("recalculate")}
          </Button>
          <Button onClick={() => void run("/admin/crm/rfm/presets", (r) => t("presetsCreated", { count: (r.created as string[] | undefined)?.length ?? 0 }))}>{t("createPresets")}</Button>
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {summary?.segments.map((s) => (
          <div key={s.segment} className="rounded-theme border border-border p-2 text-sm">
            <p className="font-medium text-surface-foreground">{localized(s.label, locale)}</p>
            <p className="text-xs text-surface-foreground/60">{t("customers", { count: s.customers })}</p>
            <p className="text-xs text-surface-foreground/60">{t("avgSpent", { amount: money(s.avgSpent) })}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-surface-foreground/60">{t("help")}</p>
    </Card>
  );
}
