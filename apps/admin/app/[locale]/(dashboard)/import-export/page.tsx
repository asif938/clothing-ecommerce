"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card } from "../../../../components/ui";

interface DryRunResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: { row: number; sku: string | null; message: string }[];
}
interface ImportJob {
  id: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  totalRows: number;
  processedRows: number;
  createdRows: number;
  updatedRows: number;
  errorRows: number;
}

export default function ImportExportPage() {
  const t = useTranslations("importExport");
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function loadJobs() {
    try {
      setJobs(await api.get<ImportJob[]>("/admin/catalog/import"));
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void loadJobs();
  }, []);

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed" || job.status === "cancelled") return;
    const timer = setInterval(() => {
      void api
        .get<ImportJob>(`/admin/catalog/import/${job.id}`)
        .then((updated) => {
          setJob(updated);
          if (updated.status === "done") void loadJobs();
        })
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [job]);

  async function handleDryRun() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      setDryRunResult(await api.upload<DryRunResult>("/admin/catalog/import/dry-run", formData));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Dry run failed");
    }
  }

  async function handleImport() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await api.upload<{ id: string; status: string; totalRows: number }>("/admin/catalog/import", formData);
      setJob({ id: result.id, status: result.status as ImportJob["status"], totalRows: result.totalRows, processedRows: 0, createdRows: 0, updatedRows: 0, errorRows: 0 });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    }
  }

  function handleExport() {
    window.open("/api/v1/admin/catalog/export", "_blank");
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("importTitle")}</h2>
        <input ref={fileInput} type="file" accept=".csv,.xlsx,.xls" className="text-sm" />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void handleDryRun()}>
            {t("dryRun")}
          </Button>
          <Button onClick={() => void handleImport()}>{t("startImport")}</Button>
        </div>

        {dryRunResult && (
          <div className="rounded-theme border border-border p-3 text-sm">
            <p>{t("totalRows", { count: dryRunResult.totalRows })}</p>
            <p className="text-success">{t("validRows", { count: dryRunResult.validCount })}</p>
            <p className="text-danger">{t("errorRows", { count: dryRunResult.errorCount })}</p>
            <ul className="mt-2 max-h-40 overflow-auto text-xs text-surface-foreground/70">
              {dryRunResult.errors.map((err, i) => (
                <li key={i}>
                  Row {err.row} ({err.sku ?? "—"}): {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {job && (
          <div className="rounded-theme border border-border p-3 text-sm">
            <p>{t("progress", { processed: job.processedRows, total: job.totalRows, created: job.createdRows, updated: job.updatedRows, errors: job.errorRows })}</p>
            {job.status === "done" && job.errorRows > 0 && (
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
                  {j.id.slice(0, 8)} — {j.status} ({j.createdRows} created, {j.updatedRows} updated, {j.errorRows} errors)
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("exportTitle")}</h2>
        <Button variant="secondary" className="self-start" onClick={handleExport}>
          {t("exportButton")}
        </Button>
      </Card>
    </div>
  );
}
