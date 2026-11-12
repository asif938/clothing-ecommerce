"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { dateInput, fileToBase64, money } from "../../../../../lib/format";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";
import { MarketingTabs, selectClass } from "../../../../../components/marketing-tabs";

type Platform = "meta" | "google" | "tiktok" | "other";

interface Inspect {
  headers: string[];
  rowCount: number;
  sample: Record<string, unknown>[];
}

interface RoasRow {
  platform: Platform;
  campaignKey: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  orders: number;
  revenue: number;
  roas: number | null;
  costPerOrder: number | null;
}

interface Roas {
  basis: string;
  totals: { spend: number; revenue: number; orders: number; roas: number | null };
  platforms: { platform: Platform; spend: number; revenue: number; orders: number; roas: number | null }[];
  campaigns: RoasRow[];
  days: { day: string; spend: number; revenue: number }[];
}

const MAPPING_FIELDS = ["date", "campaignName", "spend", "campaignId", "impressions", "clicks"] as const;
type MappingField = (typeof MAPPING_FIELDS)[number];
const REQUIRED: MappingField[] = ["date", "campaignName", "spend"];

/** Best-effort column guess from common Meta/Google/TikTok export headers. */
function guess(headers: string[], field: MappingField): string {
  const patterns: Record<MappingField, RegExp> = {
    date: /^(day|date|reporting starts|দিন|তারিখ)/i,
    campaignName: /campaign( name)?$/i,
    spend: /(amount spent|spend|cost)/i,
    campaignId: /campaign id/i,
    impressions: /impr/i,
    clicks: /^(link )?clicks/i,
  };
  return headers.find((h) => patterns[field].test(h.trim())) ?? "";
}

function ratio(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}×`;
}

/** Ad spend import (CSV/XLSX) and ROAS by platform and campaign (§8.2 Marketing, §16 M13). */
export default function AdSpendPage() {
  const t = useTranslations("adSpend");
  const today = new Date();
  const [from, setFrom] = useState(dateInput(new Date(today.getTime() - 29 * 86_400_000)));
  const [to, setTo] = useState(dateInput(today));
  const [roas, setRoas] = useState<Roas | null>(null);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [mapping, setMapping] = useState<Record<MappingField, string>>({ date: "", campaignName: "", spend: "", campaignId: "", impressions: "", clicks: "" });
  const [platform, setPlatform] = useState<Platform>("meta");
  const [exchangeRate, setExchangeRate] = useState("");
  const [dateFormat, setDateFormat] = useState<"auto" | "dmy" | "mdy">("auto");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRoas(await api.get<Roas>(`/admin/marketing/ad-spend/roas?from=${from}T00:00:00%2B06:00&to=${to}T23:59:59%2B06:00`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on range change
    void load();
  }, [load]);

  async function pickFile(selected: File | undefined) {
    if (!selected) return;
    setError(null);
    try {
      const base64 = await fileToBase64(selected);
      setFile({ name: selected.name, base64 });
      const result = await api.post<Inspect>("/admin/marketing/ad-spend/inspect", { fileName: selected.name, contentBase64: base64 });
      setInspect(result);
      setMapping(Object.fromEntries(MAPPING_FIELDS.map((f) => [f, guess(result.headers, f)])) as Record<MappingField, string>);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to read the file");
    }
  }

  async function doImport() {
    if (!file) return;
    setError(null);
    setNotice(null);
    try {
      const result = await api.post<{ imported: number; rowsRead: number; errors: { row: number; message: string }[] }>("/admin/marketing/ad-spend/import", {
        fileName: file.name,
        contentBase64: file.base64,
        platform,
        mapping: { date: mapping.date, campaignName: mapping.campaignName, spend: mapping.spend, campaignId: mapping.campaignId || null, impressions: mapping.impressions || null, clicks: mapping.clicks || null },
        exchangeRate: exchangeRate || null,
        dateFormat,
      });
      setNotice(t("imported", { imported: result.imported, rows: result.rowsRead, errors: result.errors.length }));
      if (result.errors.length) setError(result.errors.map((e) => `#${e.row}: ${e.message}`).join(" · "));
      setFile(null);
      setInspect(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <MarketingTabs />
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium text-surface-foreground">{t("import")}</h2>
        <p className="text-xs text-surface-foreground/60">{t("importHelp")}</p>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => void pickFile(e.target.files?.[0])} />
        {inspect && (
          <>
            <p className="text-xs text-surface-foreground/60">{t("rowsFound", { count: inspect.rowCount })}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{t("platform")}</span>
                <select className={selectClass} value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
                  {(["meta", "google", "tiktok", "other"] as const).map((p) => (
                    <option key={p} value={p}>
                      {t(`platform_${p}`)}
                    </option>
                  ))}
                </select>
              </label>
              {MAPPING_FIELDS.map((field) => (
                <label key={field} className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">
                    {t(`col_${field}`)}
                    {REQUIRED.includes(field) ? " *" : ""}
                  </span>
                  <select className={selectClass} value={mapping[field]} onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}>
                    <option value="">—</option>
                    {inspect.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <TextField label={t("exchangeRate")} value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} placeholder="122.50" />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{t("dateFormat")}</span>
                <select className={selectClass} value={dateFormat} onChange={(e) => setDateFormat(e.target.value as "auto" | "dmy" | "mdy")}>
                  <option value="auto">{t("dateAuto")}</option>
                  <option value="dmy">DD/MM/YYYY</option>
                  <option value="mdy">MM/DD/YYYY</option>
                </select>
              </label>
            </div>
            <p className="text-xs text-surface-foreground/60">{t("exchangeRateHelp")}</p>
            <Button className="self-start" disabled={REQUIRED.some((f) => !mapping[f])} onClick={() => void doImport()}>
              {t("importNow")}
            </Button>
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-medium text-surface-foreground">{t("roas")}</h2>
          <div className="flex gap-2">
            <TextField label={t("from")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextField label={t("to")} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {roas && (
          <>
            <p className="text-xs text-surface-foreground/60">{t(`basis_${roas.basis}`)}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                [t("spend"), money(roas.totals.spend)],
                [t("revenue"), money(roas.totals.revenue)],
                [t("orders"), String(roas.totals.orders)],
                [t("blendedRoas"), ratio(roas.totals.roas)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-theme bg-muted p-3">
                  <p className="text-xs text-surface-foreground/60">{label}</p>
                  <p className="text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-foreground/60">
                  <th className="py-1">{t("platform")}</th>
                  <th>{t("campaign")}</th>
                  <th>{t("spend")}</th>
                  <th>{t("clicks")}</th>
                  <th>{t("orders")}</th>
                  <th>{t("revenue")}</th>
                  <th>ROAS</th>
                  <th>{t("costPerOrder")}</th>
                </tr>
              </thead>
              <tbody>
                {roas.campaigns.map((c) => (
                  <tr key={`${c.platform}-${c.campaignKey}`} className="border-t border-border">
                    <td className="py-1">{t(`platform_${c.platform}`)}</td>
                    <td>{c.campaignName === "(unmatched)" ? t("unmatched") : c.campaignName}</td>
                    <td>{money(c.spend)}</td>
                    <td>{c.clicks}</td>
                    <td>{c.orders}</td>
                    <td>{money(c.revenue)}</td>
                    <td className={c.roas !== null && c.roas < 1 ? "text-danger" : ""}>{ratio(c.roas)}</td>
                    <td>{money(c.costPerOrder)}</td>
                  </tr>
                ))}
                {roas.campaigns.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-3 text-surface-foreground/50">
                      {t("empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="text-xs text-surface-foreground/60">{t("attributionHelp")}</p>
          </>
        )}
      </Card>
    </div>
  );
}
