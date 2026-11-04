"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Card, TextField } from "../../../../components/ui";

const REPORTS = ["sales", "products", "courier", "staff", "discounts", "searchTerms"] as const;
const REPORT_PATH: Record<(typeof REPORTS)[number], string> = {
  sales: "sales",
  products: "products",
  courier: "courier",
  staff: "staff",
  discounts: "discounts",
  searchTerms: "search-terms",
};

function defaultFrom(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const t = useTranslations("reports");
  const [tab, setTab] = useState<(typeof REPORTS)[number]>("sales");
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ from, to });
    api
      .get<Record<string, unknown>[]>(`/admin/reports/${REPORT_PATH[tab]}?${params.toString()}`)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load report"));
  }, [tab, from, to]);

  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const exportUrl = `/api/v1/admin/reports/${REPORT_PATH[tab]}?${new URLSearchParams({ from, to, format: "csv" }).toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}
      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <button
            key={r}
            onClick={() => setTab(r)}
            className={`rounded-theme px-3 py-1.5 text-sm ${tab === r ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground"}`}
          >
            {t(`tab_${r}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <TextField label={t("from")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label={t("to")} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <a href={exportUrl} className="rounded-theme bg-muted px-4 py-2 text-sm text-surface-foreground hover:opacity-80" download>
          {t("exportCsv")}
        </a>
      </div>
      <Card className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-surface-foreground/60">{t("noData")}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                {columns.map((c) => (
                  <th key={c} className="py-2 pr-4">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  {columns.map((c) => (
                    <td key={c} className="py-2 pr-4 text-surface-foreground">{String(row[c] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
