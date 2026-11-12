"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card } from "../../../../components/ui";
import { selectClass } from "../../../../components/marketing-tabs";
import { Link } from "../../../../i18n/navigation";

type EntityType = "product" | "category" | "collection" | "page" | "blog";

interface ScoreRow {
  id: string;
  label: string;
  slug: string;
  link: string;
  score: number;
  issues: { check: string; locale: "bn" | "en" | null }[];
}

interface Scores {
  total: number;
  averageScore: number;
  page: number;
  pageSize: number;
  items: ScoreRow[];
}

interface Scan {
  id: string;
  status: "running" | "completed" | "failed";
  linksChecked: number;
  brokenCount: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  results?: { id: string; sourceType: string; sourceId: string; sourceLabel: string; url: string; kind: string; reason: string; httpStatus: number | null }[];
}

const TYPES: EntityType[] = ["product", "category", "collection", "page", "blog"];

/** SEO score per page type and the broken link checker (§9.5, §13.2, §16 M13). */
export default function SeoPage() {
  const t = useTranslations("seo");
  const [type, setType] = useState<EntityType>("product");
  const [page, setPage] = useState(1);
  const [scores, setScores] = useState<Scores | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadScores = useCallback(async () => {
    try {
      setScores(await api.get<Scores>(`/admin/seo/scores?type=${type}&page=${page}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [type, page]);

  const loadScans = useCallback(async () => {
    try {
      const list = await api.get<Scan[]>("/admin/seo/link-scans");
      setScans(list);
      if (list[0]) setScan(await api.get<Scan>(`/admin/seo/link-scans/${list[0].id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on tab change
    void loadScores();
  }, [loadScores]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void loadScans();
  }, [loadScans]);

  useEffect(() => {
    if (scan?.status !== "running") return;
    const handle = setInterval(() => void loadScans(), 4000);
    return () => clearInterval(handle);
  }, [scan?.status, loadScans]);

  async function startScan() {
    setError(null);
    try {
      await api.post("/admin/seo/link-scans");
      await loadScans();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-surface-foreground">{t("scores")}</h2>
          <select
            className={selectClass}
            value={type}
            onChange={(e) => {
              setType(e.target.value as EntityType);
              setPage(1);
            }}
          >
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`type_${ty}`)}
              </option>
            ))}
          </select>
        </div>
        {scores && (
          <>
            <p className="text-sm">{t("average", { score: scores.averageScore, count: scores.total })}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-foreground/60">
                  <th className="py-1">{t("item")}</th>
                  <th>{t("score")}</th>
                  <th>{t("issues")}</th>
                </tr>
              </thead>
              <tbody>
                {scores.items.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="py-2">
                      <Link href={row.link} className="text-brand hover:underline">
                        {row.label || row.slug}
                      </Link>
                      <span className="ml-2 text-xs text-surface-foreground/50">/{row.slug}</span>
                    </td>
                    <td className={row.score < 60 ? "font-semibold text-danger" : row.score < 85 ? "text-warning" : "text-success"}>{row.score}</td>
                    <td className="text-xs">{row.issues.map((i) => `${t(`check_${i.check}`)}${i.locale ? ` (${i.locale})` : ""}`).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center gap-2 text-sm">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                ←
              </Button>
              <span>
                {page} / {Math.max(1, Math.ceil(scores.total / scores.pageSize))}
              </span>
              <Button variant="secondary" disabled={page * scores.pageSize >= scores.total} onClick={() => setPage(page + 1)}>
                →
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-surface-foreground">{t("brokenLinks")}</h2>
            <p className="text-xs text-surface-foreground/60">{t("brokenLinksHelp")}</p>
          </div>
          <Button onClick={() => void startScan()} disabled={scan?.status === "running"}>
            {scan?.status === "running" ? t("scanning") : t("scanNow")}
          </Button>
        </div>
        {scan && (
          <p className="text-sm">
            {t("scanSummary", { checked: scan.linksChecked, broken: scan.brokenCount, date: new Date(scan.startedAt).toLocaleString() })}
            {scan.status === "failed" && <span className="text-danger"> — {scan.error}</span>}
          </p>
        )}
        {scan?.results && scan.results.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-surface-foreground/60">
                <th className="py-1">{t("source")}</th>
                <th>{t("link")}</th>
                <th>{t("problem")}</th>
              </tr>
            </thead>
            <tbody>
              {scan.results.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="py-1">
                    {t(`source_${r.sourceType}`)}: {r.sourceLabel}
                  </td>
                  <td className="break-all font-mono text-xs">{r.url}</td>
                  <td className="text-xs">
                    {t(`reason_${r.reason}`)}
                    {r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {scans.length > 1 && <p className="text-xs text-surface-foreground/50">{t("previousScans", { count: scans.length - 1 })}</p>}
      </Card>
    </div>
  );
}
