"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { localized } from "../../../../lib/format";
import { Banner, Button, Card } from "../../../../components/ui";

interface Section {
  key: string;
  label: { bn: string; en: string };
}
interface Plan {
  created: number;
  updated: number;
  unchanged: number;
  skipped: { id: string; reason: string }[];
  warnings: string[];
}
interface Report {
  dryRun: boolean;
  sections: Record<string, Plan>;
}
interface ParsedBundle {
  sections?: string[];
  exportedAt?: string;
  data?: Record<string, unknown>;
}

/** Config bundle export/import (§4, §16 M17): move a brand's configuration to a fresh deployment. */
export default function ConfigBundlePage() {
  const t = useTranslations("configBundle");
  const locale = useLocale();
  const [sections, setSections] = useState<Section[]>([]);
  const [exportPicked, setExportPicked] = useState<Set<string>>(new Set());
  const [bundle, setBundle] = useState<ParsedBundle | null>(null);
  const [fileName, setFileName] = useState("");
  const [importPicked, setImportPicked] = useState<Set<string>>(new Set());
  const [publishPages, setPublishPages] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Section[]>("/admin/config-bundle/sections")
      .then((s) => {
        setSections(s);
        setExportPicked(new Set(s.map((x) => x.key)));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
  }, []);

  const label = (key: string) => {
    const found = sections.find((s) => s.key === key);
    return found ? localized(found.label, locale) : key;
  };
  const flip = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  async function onFile(file: File | undefined) {
    setReport(null);
    setApplied(false);
    setError(null);
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as ParsedBundle;
      const present = Object.keys(parsed.data ?? {});
      if (present.length === 0) throw new Error(t("emptyBundle"));
      setBundle(parsed);
      setFileName(file.name);
      setImportPicked(new Set(present));
    } catch (err) {
      setBundle(null);
      setError(err instanceof Error ? err.message : t("notJson"));
    }
  }

  async function run(dryRun: boolean) {
    if (!bundle) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<Report>("/admin/config-bundle/import", { bundle, sections: [...importPicked], dryRun, publishPages });
      setReport(result);
      setApplied(!dryRun);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const totals = report ? Object.values(report.sections).reduce((a, s) => ({ created: a.created + s.created, updated: a.updated + s.updated }), { created: 0, updated: 0 }) : null;
  const exportUrl = `/api/v1/admin/config-bundle/export?sections=${[...exportPicked].join(",")}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-4">
        <h2 className="font-medium text-surface-foreground">{t("exportTitle")}</h2>
        <div className="flex flex-wrap gap-4">
          {sections.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm text-surface-foreground">
              <input type="checkbox" checked={exportPicked.has(s.key)} onChange={() => setExportPicked(flip(exportPicked, s.key))} />
              {localized(s.label, locale)}
            </label>
          ))}
        </div>
        <div>
          <a
            href={exportUrl}
            download
            aria-disabled={exportPicked.size === 0}
            className={`inline-block rounded-theme bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:opacity-90 ${exportPicked.size === 0 ? "pointer-events-none opacity-50" : ""}`}
          >
            {t("download")}
          </a>
        </div>
        <p className="text-xs text-surface-foreground/50">{t("exportHint")}</p>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-medium text-surface-foreground">{t("importTitle")}</h2>
        <input type="file" accept="application/json,.json" onChange={(e) => void onFile(e.target.files?.[0])} className="text-sm text-surface-foreground" />
        {bundle && (
          <>
            <p className="text-sm text-surface-foreground/70">{t("fileLoaded", { name: fileName, date: bundle.exportedAt ? new Date(bundle.exportedAt).toLocaleString(locale) : "—" })}</p>
            <div className="flex flex-wrap gap-4">
              {Object.keys(bundle.data ?? {}).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm text-surface-foreground">
                  <input
                    type="checkbox"
                    checked={importPicked.has(key)}
                    onChange={() => {
                      setImportPicked(flip(importPicked, key));
                      setReport(null);
                      setApplied(false);
                    }}
                  />
                  {label(key)}
                </label>
              ))}
            </div>
            {importPicked.has("pages") && (
              <label className="flex items-center gap-2 text-sm text-surface-foreground">
                <input type="checkbox" checked={publishPages} onChange={(e) => setPublishPages(e.target.checked)} />
                {t("publishPages")}
              </label>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => run(true)} disabled={busy || importPicked.size === 0}>
                {t("preview")}
              </Button>
              <Button
                onClick={() => {
                  if (window.confirm(t("applyConfirm", { created: totals?.created ?? 0, updated: totals?.updated ?? 0 }))) void run(false);
                }}
                disabled={busy || !report || report.dryRun === false || (totals?.created === 0 && totals?.updated === 0)}
              >
                {t("apply")}
              </Button>
            </div>
          </>
        )}
      </Card>

      {report && (
        <div className="flex flex-col gap-4">
          <Banner kind={applied ? "success" : "info"}>{applied ? t("appliedBanner") : t("previewBanner")}</Banner>
          {Object.entries(report.sections).map(([key, plan]) => (
            <Card key={key} className="flex flex-col gap-2">
              <h3 className="font-medium text-surface-foreground">{label(key)}</h3>
              <p className="text-sm text-surface-foreground/80">{t("planLine", { created: plan.created, updated: plan.updated, unchanged: plan.unchanged, skipped: plan.skipped.length })}</p>
              {plan.skipped.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-warning">
                  {plan.skipped.slice(0, 20).map((s) => (
                    <li key={s.id}>
                      <span className="font-mono">{s.id}</span> — {s.reason}
                    </li>
                  ))}
                  {plan.skipped.length > 20 && <li>{t("andMore", { count: plan.skipped.length - 20 })}</li>}
                </ul>
              )}
              {plan.warnings.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-surface-foreground/70">
                  {plan.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
