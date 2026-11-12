"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { localized } from "../../../../../lib/format";
import { Banner, Button, Card } from "../../../../../components/ui";
import { selectClass } from "../../../../../components/marketing-tabs";
import { Link } from "../../../../../i18n/navigation";

interface QualityRow {
  id: string;
  slug: string;
  status: string;
  title: { bn?: string; en?: string };
  score: number;
  issues: string[];
}

interface QualityResult {
  total: number;
  averageScore: number;
  counts: Record<string, number>;
  page: number;
  pageSize: number;
  items: QualityRow[];
}

/** Product quality checker (§8.2 Catalog "missing images/description/size chart/translation/SEO/weight", §16 M13). */
export default function ProductQualityPage() {
  const t = useTranslations("quality");
  const locale = useLocale();
  const [issue, setIssue] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<QualityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), ...(issue ? { issue } : {}), ...(status ? { status } : {}) });
      setResult(await api.get<QualityResult>(`/admin/catalog/quality?${params.toString()}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [issue, status, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter change
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {result && (
        <>
          <div className="flex flex-wrap gap-2">
            <Card className="p-4">
              <p className="text-xs text-surface-foreground/60">{t("averageScore")}</p>
              <p className="text-2xl font-semibold">{result.averageScore}</p>
            </Card>
            {Object.entries(result.counts)
              .filter(([, n]) => n > 0)
              .map(([code, n]) => (
                <button
                  key={code}
                  onClick={() => {
                    setIssue(issue === code ? "" : code);
                    setPage(1);
                  }}
                  className={`rounded-theme border px-3 py-2 text-left text-xs ${issue === code ? "border-brand bg-brand/10" : "border-border bg-surface"}`}
                >
                  <span className="block text-lg font-semibold">{n}</span>
                  {t(`issue_${code}`)}
                </button>
              ))}
          </div>
          <div className="flex gap-2">
            <select
              className={selectClass}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{t("allStatuses")}</option>
              <option value="active">active</option>
              <option value="draft">draft</option>
            </select>
          </div>
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-foreground/60">
                  <th className="py-1">{t("product")}</th>
                  <th>{t("score")}</th>
                  <th>{t("issues")}</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="py-2">
                      <Link href={`/products/${row.id}`} className="text-brand hover:underline">
                        {localized(row.title, locale) || row.slug}
                      </Link>
                      <span className="ml-2 text-xs text-surface-foreground/50">{row.status}</span>
                    </td>
                    <td className={row.score < 60 ? "font-semibold text-danger" : row.score < 85 ? "text-warning" : "text-success"}>{row.score}</td>
                    <td className="text-xs">{row.issues.map((i) => t(`issue_${i}`)).join(" · ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                ←
              </Button>
              <span>
                {page} / {Math.max(1, Math.ceil(result.total / result.pageSize))}
              </span>
              <Button variant="secondary" disabled={page * result.pageSize >= result.total} onClick={() => setPage(page + 1)}>
                →
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
