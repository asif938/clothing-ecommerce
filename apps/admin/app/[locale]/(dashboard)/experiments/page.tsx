"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Card } from "../../../../components/ui";
import { selectClass } from "../../../../components/marketing-tabs";
import { Link } from "../../../../i18n/navigation";

interface ExperimentRow {
  id: string;
  name: string;
  kind: "block" | "announcement" | "offer";
  status: "draft" | "running" | "paused" | "completed";
  goal: string;
  trafficPercent: number;
  visitors: number;
  startedAt: string | null;
  winnerKey: string | null;
}

const STATUSES = ["", "draft", "running", "paused", "completed"] as const;

const STATUS_STYLE: Record<ExperimentRow["status"], string> = {
  draft: "bg-muted text-surface-foreground",
  running: "bg-success/15 text-success",
  paused: "bg-warning/15 text-warning",
  completed: "bg-brand/10 text-brand",
};

/** A/B tests list (§16 M14). */
export default function ExperimentsPage() {
  const t = useTranslations("experiments");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("");
  const [rows, setRows] = useState<ExperimentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<ExperimentRow[]>(`/admin/experiments${status ? `?status=${status}` : ""}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter change
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
        </div>
        <Link href="/experiments/new" className="rounded-theme bg-brand px-4 py-2 text-sm font-medium text-brand-foreground">
          {t("new")}
        </Link>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <select className={`${selectClass} self-start`} value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? t(`status_${s}`) : t("allStatuses")}
            </option>
          ))}
        </select>
        {rows && rows.length === 0 && <p className="text-sm text-surface-foreground/60">{t("empty")}</p>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-foreground/60">
                  <th className="py-1">{t("name")}</th>
                  <th>{t("kind")}</th>
                  <th>{t("goal")}</th>
                  <th>{t("status")}</th>
                  <th>{t("visitors")}</th>
                  <th>{t("started")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="py-2">
                      <Link href={`/experiments/${row.id}`} className="text-brand hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td>{t(`kind_${row.kind}`)}</td>
                    <td>{t(`goal_${row.goal}`)}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[row.status]}`}>{t(`status_${row.status}`)}</span>
                    </td>
                    <td>{row.visitors}</td>
                    <td>{row.startedAt ? new Date(row.startedAt).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
