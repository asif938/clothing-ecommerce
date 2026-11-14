"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, FieldLabel, TextField } from "../../../../components/ui";

type PriceUnit = "bdt" | "poisha";
type Mapping = Record<string, string | null>;

interface Issue {
  row: number;
  sku: string | null;
  message: string;
  level?: "error" | "warning";
}
interface DryRunResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  warningCount: number;
  imageCount: number;
  errors: Issue[];
}
interface Inspection {
  sheetName: string | null;
  headers: string[];
  sampleRows: Record<string, unknown>[];
  totalRows: number;
  suggestedMapping: Mapping;
  suggestedOptions: { priceUnit: PriceUnit };
  fields: { key: string; level: "product" | "variant" }[];
}
interface Preset {
  id: string;
  name: string;
  mapping: Mapping;
  options: { priceUnit: PriceUnit } | null;
}
interface ImportJob {
  id: string;
  fileName?: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  totalRows: number;
  processedRows: number;
  createdRows: number;
  updatedRows: number;
  errorRows: number;
  warningRows?: number;
}

const FINISHED: ImportJob["status"][] = ["done", "failed", "cancelled"];

/** §8.2 catalog import: upload → column mapping (auto-suggested, editable, savable as a preset) → dry run → background job, with an optional images ZIP. */
export default function ImportExportPage() {
  const t = useTranslations("importExport");
  const tf = useTranslations("importFields");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [priceUnit, setPriceUnit] = useState<PriceUnit>("poisha");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  async function loadJobs() {
    try {
      setJobs(await api.get<ImportJob[]>("/admin/catalog/import"));
    } catch {
      // non-fatal
    }
  }

  async function loadPresets() {
    try {
      setPresets(await api.get<Preset[]>("/admin/catalog/import/presets"));
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void loadJobs();
    void loadPresets();
  }, []);

  useEffect(() => {
    if (!job || FINISHED.includes(job.status)) return;
    const timer = setInterval(() => {
      void api
        .get<ImportJob>(`/admin/catalog/import/${job.id}`)
        .then((updated) => {
          setJob(updated);
          if (FINISHED.includes(updated.status)) void loadJobs();
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [job]);

  const mappedFields = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);
  const missingRequired = ["sku", "productSlug", "price"].filter((field) => !mappedFields.has(field));

  async function handleFileChosen() {
    const file = fileInput.current?.files?.[0];
    setInspection(null);
    setDryRunResult(null);
    setError(null);
    if (!file) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.upload<Inspection>("/admin/catalog/import/inspect", formData);
      setInspection(result);
      setMapping(result.suggestedMapping);
      setPriceUnit(result.suggestedOptions.priceUnit);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("inspectFailed"));
    } finally {
      setBusy(false);
    }
  }

  function buildForm(): FormData | null {
    const file = fileInput.current?.files?.[0];
    if (!file) return null;
    const formData = new FormData();
    formData.append("file", file);
    const zip = zipInput.current?.files?.[0];
    if (zip) formData.append("images", zip);
    formData.append("mapping", JSON.stringify(mapping));
    formData.append("options", JSON.stringify({ priceUnit }));
    return formData;
  }

  async function handleDryRun() {
    const formData = buildForm();
    if (!formData) return;
    setError(null);
    setBusy(true);
    try {
      setDryRunResult(await api.upload<DryRunResult>("/admin/catalog/import/dry-run", formData));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dryRunFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    const formData = buildForm();
    if (!formData) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await api.upload<{ id: string; status: string; totalRows: number; imageCount: number; skippedImages: { name: string; reason: string }[] }>("/admin/catalog/import", formData);
      setJob({ id: result.id, status: result.status as ImportJob["status"], totalRows: result.totalRows, processedRows: 0, createdRows: 0, updatedRows: 0, errorRows: 0, warningRows: 0 });
      setNotice(t("jobStarted", { images: result.imageCount, skipped: result.skippedImages.length }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("importFailed"));
    } finally {
      setBusy(false);
    }
  }

  function applyPreset(id: string) {
    const preset = presets.find((p) => p.id === id);
    if (!preset || !inspection) return;
    const next: Mapping = {};
    for (const header of inspection.headers) next[header] = preset.mapping[header] ?? null;
    setMapping(next);
    if (preset.options?.priceUnit) setPriceUnit(preset.options.priceUnit);
    setPresetName(preset.name);
  }

  async function savePreset() {
    if (!presetName.trim()) return;
    try {
      await api.put("/admin/catalog/import/presets", { name: presetName.trim(), mapping, options: { priceUnit } });
      setNotice(t("presetSaved"));
      void loadPresets();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("presetFailed"));
    }
  }

  async function deletePreset(id: string) {
    try {
      await api.delete(`/admin/catalog/import/presets/${id}`);
      void loadPresets();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("presetFailed"));
    }
  }

  function sampleFor(header: string): string {
    const value = inspection?.sampleRows.find((row) => row[header] !== null && row[header] !== undefined && row[header] !== "")?.[header];
    const text = value === undefined || value === null ? "" : String(value);
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  }

  const productFields = inspection?.fields.filter((f) => f.level === "product") ?? [];
  const variantFields = inspection?.fields.filter((f) => f.level === "variant") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("importTitle")}</h2>

        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="import-sheet">{t("chooseFile")}</FieldLabel>
          <input id="import-sheet" ref={fileInput} type="file" accept=".csv,.xlsx,.xls" className="text-sm" onChange={() => void handleFileChosen()} />
          <p className="text-xs text-surface-foreground/60">{t("chooseFileHint")}</p>
        </div>

        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="import-zip">{t("chooseZip")}</FieldLabel>
          <input id="import-zip" ref={zipInput} type="file" accept=".zip" className="text-sm" />
          <p className="text-xs text-surface-foreground/60">{t("chooseZipHint")}</p>
        </div>

        {inspection && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-surface-foreground/70">{t("sheetSummary", { sheet: inspection.sheetName ?? "—", rows: inspection.totalRows, columns: inspection.headers.length })}</p>

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="price-unit">{t("priceUnit")}</FieldLabel>
                <select id="price-unit" value={priceUnit} onChange={(e) => setPriceUnit(e.target.value as PriceUnit)} className="rounded-theme border border-border bg-surface px-2 py-1.5 text-sm">
                  <option value="bdt">{t("priceUnitBdt")}</option>
                  <option value="poisha">{t("priceUnitPoisha")}</option>
                </select>
              </div>
              {presets.length > 0 && (
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="preset-load">{t("loadPreset")}</FieldLabel>
                  <select id="preset-load" defaultValue="" onChange={(e) => applyPreset(e.target.value)} className="rounded-theme border border-border bg-surface px-2 py-1.5 text-sm">
                    <option value="" disabled>
                      —
                    </option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-end gap-2">
                <TextField label={t("presetName")} value={presetName} onChange={(e) => setPresetName(e.target.value)} />
                <Button variant="secondary" onClick={() => void savePreset()} disabled={!presetName.trim()}>
                  {t("savePreset")}
                </Button>
              </div>
            </div>

            {missingRequired.length > 0 && <Banner kind="warning">{t("missingRequired", { fields: missingRequired.map((f) => tf(f)).join(", ") })}</Banner>}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-surface-foreground/70">
                    <th className="py-2 pr-3 font-medium">{t("colHeader")}</th>
                    <th className="py-2 pr-3 font-medium">{t("colSample")}</th>
                    <th className="py-2 font-medium">{t("colField")}</th>
                  </tr>
                </thead>
                <tbody>
                  {inspection.headers.map((header) => (
                    <tr key={header} className="border-b border-border/60">
                      <td className="py-1.5 pr-3 font-mono text-xs">{header}</td>
                      <td className="py-1.5 pr-3 text-xs text-surface-foreground/60">{sampleFor(header)}</td>
                      <td className="py-1.5">
                        <select
                          aria-label={t("colField")}
                          value={mapping[header] ?? ""}
                          onChange={(e) => setMapping((prev) => ({ ...prev, [header]: e.target.value || null }))}
                          className={`w-full rounded-theme border bg-surface px-2 py-1 text-sm ${mapping[header] ? "border-border" : "border-border/50 text-surface-foreground/50"}`}
                        >
                          <option value="">{t("ignoreColumn")}</option>
                          <optgroup label={t("groupProduct")}>
                            {productFields.map((f) => (
                              <option key={f.key} value={f.key} disabled={mappedFields.has(f.key) && mapping[header] !== f.key}>
                                {tf(f.key)}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label={t("groupVariant")}>
                            {variantFields.map((f) => (
                              <option key={f.key} value={f.key} disabled={mappedFields.has(f.key) && mapping[header] !== f.key}>
                                {tf(f.key)}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {presets.length > 0 && (
              <ul className="flex flex-wrap gap-2 text-xs text-surface-foreground/60">
                {presets.map((p) => (
                  <li key={p.id} className="flex items-center gap-1 rounded-theme border border-border px-2 py-0.5">
                    {p.name}
                    <button type="button" aria-label={t("deletePreset", { name: p.name })} onClick={() => void deletePreset(p.id)} className="text-danger">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <Button variant="secondary" disabled={busy || missingRequired.length > 0} onClick={() => void handleDryRun()}>
                {t("dryRun")}
              </Button>
              <Button disabled={busy || missingRequired.length > 0} onClick={() => void handleImport()}>
                {t("startImport")}
              </Button>
            </div>
          </div>
        )}

        {dryRunResult && (
          <div className="rounded-theme border border-border p-3 text-sm">
            <p>{t("totalRows", { count: dryRunResult.totalRows })}</p>
            <p className="text-success">{t("validRows", { count: dryRunResult.validCount })}</p>
            <p className="text-danger">{t("errorRows", { count: dryRunResult.errorCount })}</p>
            <p className="text-warning">{t("warningRows", { count: dryRunResult.warningCount })}</p>
            {dryRunResult.imageCount > 0 && <p>{t("zipImages", { count: dryRunResult.imageCount })}</p>}
            <ul className="mt-2 max-h-60 overflow-auto text-xs">
              {dryRunResult.errors.map((issue, i) => (
                <li key={i} className={issue.level === "warning" ? "text-warning" : "text-danger"}>
                  {t("issueLine", { row: issue.row, sku: issue.sku ?? "—", message: issue.message })}
                </li>
              ))}
            </ul>
          </div>
        )}

        {job && (
          <div className="rounded-theme border border-border p-3 text-sm">
            <p>
              {t("progress", { processed: job.processedRows, total: job.totalRows, created: job.createdRows, updated: job.updatedRows, errors: job.errorRows })}
              {(job.warningRows ?? 0) > 0 && ` — ${t("warningRows", { count: job.warningRows ?? 0 })}`}
            </p>
            {!FINISHED.includes(job.status) && <p className="text-xs text-surface-foreground/60">{t("progressHint")}</p>}
            {job.status === "done" && (job.errorRows > 0 || (job.warningRows ?? 0) > 0) && (
              <a href={`/api/v1/admin/catalog/import/${job.id}/error-report`} target="_blank" rel="noreferrer" className="text-brand">
                {t("downloadErrorReport")}
              </a>
            )}
          </div>
        )}

        {jobs.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-surface-foreground/70">{t("jobsTitle")}</h3>
            <ul className="mt-1 flex flex-col gap-1 text-xs text-surface-foreground/60">
              {jobs.map((j) => (
                <li key={j.id}>
                  {t("jobLine", { file: j.fileName ?? j.id.slice(0, 8), status: j.status, created: j.createdRows, updated: j.updatedRows, errors: j.errorRows, warnings: j.warningRows ?? 0 })}
                  {j.status === "done" && (j.errorRows > 0 || (j.warningRows ?? 0) > 0) && (
                    <>
                      {" "}
                      <a href={`/api/v1/admin/catalog/import/${j.id}/error-report`} target="_blank" rel="noreferrer" className="text-brand">
                        {t("downloadErrorReport")}
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("exportTitle")}</h2>
        <Button variant="secondary" className="self-start" onClick={() => window.open("/api/v1/admin/catalog/export", "_blank")}>
          {t("exportButton")}
        </Button>
      </Card>
    </div>
  );
}
