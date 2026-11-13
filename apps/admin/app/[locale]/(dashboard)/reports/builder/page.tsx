"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { dateInput, money, pct, localized } from "../../../../../lib/format";
import { Banner, Button, Card, FieldLabel, TextField } from "../../../../../components/ui";

type Label = { bn: string; en: string };
interface Dataset {
  key: "sales" | "products";
  label: Label;
  dimensions: { key: string; label: Label }[];
  metrics: { key: string; label: Label; format: "count" | "money" | "percent" }[];
}
interface Filter {
  field: string;
  op: "eq" | "neq" | "in";
  values: string[];
}
interface Config {
  dataset: Dataset["key"];
  dimensions: string[];
  metrics: string[];
  filters: Filter[];
  sort: { key: string; direction: "asc" | "desc" } | null;
  limit: number;
  includeUnsold: boolean;
}
interface Result {
  columns: { key: string; kind: "dimension" | "metric"; label: Label; format?: "count" | "money" | "percent" }[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, string | number | null>;
  truncated: boolean;
  matchedRows: number;
}
interface Saved {
  id: string;
  name: string;
  description: string | null;
  config: Config;
}

const EMPTY: Config = { dataset: "sales", dimensions: ["day"], metrics: ["orders", "revenue"], filters: [], sort: null, limit: 500, includeUnsold: false };

function cell(value: string | number | null | undefined, format: "count" | "money" | "percent" | undefined, locale: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (format === "money") return money(value);
  if (format === "percent") return pct(value);
  return value.toLocaleString(locale);
}

/** Report builder (§8.2 Reports, §16 M17): pick a dataset, group, measure, filter, run, export and save. */
export default function ReportBuilderPage() {
  const t = useTranslations("reportBuilder");
  const locale = useLocale();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [config, setConfig] = useState<Config>(EMPTY);
  const [from, setFrom] = useState(() => dateInput(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [filterText, setFilterText] = useState<Record<number, string>>({});

  const dataset = useMemo(() => datasets.find((d) => d.key === config.dataset), [datasets, config.dataset]);

  const loadSaved = useCallback(async () => {
    setSaved(await api.get<Saved[]>("/admin/report-builder/saved").catch(() => []));
  }, []);

  useEffect(() => {
    api.get<Dataset[]>("/admin/report-builder/datasets").then(setDatasets).catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load.
    void loadSaved();
  }, [loadSaved]);

  const range = () => ({ from: new Date(`${from}T00:00:00+06:00`).toISOString(), to: new Date(`${to}T23:59:59+06:00`).toISOString() });

  function chooseDataset(key: Dataset["key"]) {
    const next = datasets.find((d) => d.key === key);
    if (!next) return;
    setConfig({ ...EMPTY, dataset: key, dimensions: [next.dimensions[0]!.key], metrics: [next.metrics[0]!.key] });
    setResult(null);
    setSavedId(null);
  }

  const toggle = (list: string[], key: string, max: number) => (list.includes(key) ? list.filter((k) => k !== key) : list.length >= max ? list : [...list, key]);

  async function run() {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      setResult(await api.post<Result>("/admin/report-builder/run", { config: normalised(), ...range() }));
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : "Failed to run");
    } finally {
      setRunning(false);
    }
  }

  // Filters whose value box is empty are dropped; typed text is split on commas.
  function normalised(): Config {
    const filters = config.filters
      .map((f, i) => ({ ...f, values: (filterText[i] ?? f.values.join(", ")).split(",").map((v) => v.trim()).filter(Boolean) }))
      .filter((f) => f.field && f.values.length > 0);
    return { ...config, filters };
  }

  async function save() {
    if (!name.trim()) return;
    setError(null);
    try {
      const body = { name: name.trim(), config: normalised() };
      const record = savedId ? await api.patch<Saved>(`/admin/report-builder/saved/${savedId}`, body) : await api.post<Saved>("/admin/report-builder/saved", body);
      setSavedId(record.id);
      setNotice(t("saved"));
      await loadSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  function open(report: Saved) {
    setConfig(report.config);
    setFilterText(Object.fromEntries(report.config.filters.map((f, i) => [i, f.values.join(", ")])));
    setName(report.name);
    setSavedId(report.id);
    setResult(null);
  }

  async function remove(report: Saved) {
    if (!window.confirm(t("deleteConfirm", { name: report.name }))) return;
    await api.delete(`/admin/report-builder/saved/${report.id}`);
    if (savedId === report.id) setSavedId(null);
    await loadSaved();
  }

  async function exportCsv() {
    setError(null);
    try {
      const response = await fetch("/api/v1/admin/report-builder/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: normalised(), ...range(), format: "csv" }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? response.statusText);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "custom-report.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/reports" className="text-sm text-brand hover:underline">
          ← {t("backToReports")}
        </Link>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      {saved.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h2 className="font-medium text-surface-foreground">{t("savedReports")}</h2>
          <ul className="flex flex-wrap gap-2">
            {saved.map((r) => (
              <li key={r.id} className={`flex items-center gap-2 rounded-theme px-3 py-1.5 text-sm ${savedId === r.id ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground"}`}>
                <button onClick={() => open(r)}>{r.name}</button>
                <button onClick={() => remove(r)} aria-label={t("delete")} className="opacity-60 hover:opacity-100">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {dataset && (
        <Card className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end gap-3">
            <FieldLabel>
              {t("dataset")}
              <select value={config.dataset} onChange={(e) => chooseDataset(e.target.value as Dataset["key"])} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground">
                {datasets.map((d) => (
                  <option key={d.key} value={d.key}>
                    {localized(d.label, locale)}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <TextField label={t("from")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextField label={t("to")} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <label className="flex items-center gap-2 pb-2 text-sm text-surface-foreground">
              <input type="checkbox" checked={config.includeUnsold} onChange={(e) => setConfig({ ...config, includeUnsold: e.target.checked })} />
              {t("includeUnsold")}
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-surface-foreground">{t("groupBy")}</p>
            <div className="flex flex-wrap gap-2">
              {dataset.dimensions.map((d) => (
                <button key={d.key} onClick={() => setConfig({ ...config, dimensions: toggle(config.dimensions, d.key, 2) })} className={`rounded-theme px-3 py-1.5 text-sm ${config.dimensions.includes(d.key) ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground"}`}>
                  {localized(d.label, locale)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-surface-foreground/50">{t("groupByHint")}</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-surface-foreground">{t("measures")}</p>
            <div className="flex flex-wrap gap-2">
              {dataset.metrics.map((m) => (
                <button key={m.key} onClick={() => setConfig({ ...config, metrics: toggle(config.metrics, m.key, 8) })} className={`rounded-theme px-3 py-1.5 text-sm ${config.metrics.includes(m.key) ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground"}`}>
                  {localized(m.label, locale)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-surface-foreground">{t("filters")}</p>
            {config.filters.map((f, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <select value={f.field} onChange={(e) => setConfig({ ...config, filters: config.filters.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })} className="rounded-theme border border-border bg-surface px-2 py-2 text-sm text-surface-foreground">
                  {dataset.dimensions.map((d) => (
                    <option key={d.key} value={d.key}>
                      {localized(d.label, locale)}
                    </option>
                  ))}
                </select>
                <select value={f.op} onChange={(e) => setConfig({ ...config, filters: config.filters.map((x, j) => (j === i ? { ...x, op: e.target.value as Filter["op"] } : x)) })} className="rounded-theme border border-border bg-surface px-2 py-2 text-sm text-surface-foreground">
                  <option value="eq">{t("op_eq")}</option>
                  <option value="neq">{t("op_neq")}</option>
                  <option value="in">{t("op_in")}</option>
                </select>
                <input
                  value={filterText[i] ?? f.values.join(", ")}
                  onChange={(e) => setFilterText({ ...filterText, [i]: e.target.value })}
                  placeholder={t("valuesPlaceholder")}
                  className="min-w-48 rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground"
                />
                <button onClick={() => setConfig({ ...config, filters: config.filters.filter((_, j) => j !== i) })} className="pb-2 text-danger hover:underline">
                  {t("remove")}
                </button>
              </div>
            ))}
            <div>
              <Button variant="secondary" onClick={() => setConfig({ ...config, filters: [...config.filters, { field: dataset.dimensions[0]!.key, op: "eq", values: [] }] })}>
                {t("addFilter")}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <FieldLabel>
              {t("sortBy")}
              <select
                value={config.sort ? `${config.sort.key}:${config.sort.direction}` : ""}
                onChange={(e) => {
                  const [key, direction] = e.target.value.split(":");
                  setConfig({ ...config, sort: key ? { key, direction: direction as "asc" | "desc" } : null });
                }}
                className="rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground"
              >
                <option value="">{t("sortDefault")}</option>
                {[...dataset.dimensions, ...dataset.metrics].flatMap((f) => [
                  <option key={`${f.key}:asc`} value={`${f.key}:asc`}>
                    {localized(f.label, locale)} ↑
                  </option>,
                  <option key={`${f.key}:desc`} value={`${f.key}:desc`}>
                    {localized(f.label, locale)} ↓
                  </option>,
                ])}
              </select>
            </FieldLabel>
            <Button onClick={run} disabled={running || config.metrics.length === 0}>
              {running ? t("running") : t("run")}
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={config.metrics.length === 0}>
              {t("exportCsv")}
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <TextField label={t("reportName")} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <Button variant="secondary" onClick={save} disabled={!name.trim()}>
              {savedId ? t("updateSaved") : t("saveReport")}
            </Button>
            {savedId && (
              <Button
                variant="secondary"
                onClick={() => {
                  setSavedId(null);
                  setName("");
                }}
              >
                {t("saveAsNew")}
              </Button>
            )}
          </div>
        </Card>
      )}

      {result && (
        <Card className="overflow-x-auto">
          <p className="mb-3 text-xs text-surface-foreground/60">{t("matched", { count: result.matchedRows })}</p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                {result.columns.map((c) => (
                  <th key={c.key} className={`py-2 pr-4 ${c.kind === "metric" ? "text-right" : ""}`}>
                    {localized(c.label, locale)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  {result.columns.map((c) => (
                    <td key={c.key} className={`py-2 pr-4 ${c.kind === "metric" ? "text-right text-surface-foreground/80" : "text-surface-foreground"}`}>
                      {cell(row[c.key], c.format, locale)}
                    </td>
                  ))}
                </tr>
              ))}
              {result.rows.length === 0 && (
                <tr>
                  <td colSpan={result.columns.length} className="py-4 text-surface-foreground/50">
                    {t("none")}
                  </td>
                </tr>
              )}
              {result.rows.length > 0 && (
                <tr className="border-t-2 border-border font-semibold">
                  {result.columns.map((c, i) => (
                    <td key={c.key} className={`py-2 pr-4 ${c.kind === "metric" ? "text-right" : ""} text-surface-foreground`}>
                      {c.kind === "dimension" ? (i === 0 ? t("totals") : "") : cell(result.totals[c.key], c.format, locale)}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
          {result.truncated && <p className="mt-2 text-xs text-warning">{t("truncated", { limit: config.limit })}</p>}
          <p className="mt-3 text-xs text-surface-foreground/50">{t("footnote")}</p>
        </Card>
      )}
    </div>
  );
}
