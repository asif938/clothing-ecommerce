"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { money, pct } from "../../../../../lib/format";
import { Banner, Button, Card } from "../../../../../components/ui";

interface Cohort {
  cohort: string;
  size: number;
  retention: (number | null)[];
  ltv: (number | null)[];
  totalRevenue: number;
}
interface Report {
  months: number;
  currentMonth: string;
  maxOffset: number;
  cohorts: Cohort[];
  summary: {
    customers: number;
    totalRevenue: number;
    averageLtv: number;
    medianLtv: number;
    averageOrders: number;
    repeatRate: number | null;
    topDecileShare: number | null;
    percentiles: { p25: number; p75: number; p90: number };
  };
}

/** Heat shading: the higher the retention, the stronger the brand tint. */
function shade(value: number | null): React.CSSProperties {
  if (value === null) return {};
  return { backgroundColor: `color-mix(in srgb, var(--color-brand) ${Math.round(Math.min(1, value) * 70)}%, transparent)` };
}

/** Cohort retention and customer lifetime value (§8.2 Reports, §16 M17). */
export default function CohortsPage() {
  const t = useTranslations("cohorts");
  const locale = useLocale();
  const [months, setMonths] = useState(12);
  const [metric, setMetric] = useState<"retention" | "ltv">("retention");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Report>(`/admin/reports/cohorts?months=${months}`)
      .then((r) => {
        setReport(r);
        setError(null);
      })
      .catch((err) => {
        setReport(null);
        setError(err instanceof ApiError ? err.message : "Failed to load");
      });
  }, [months]);

  const s = report?.summary;
  const kpi = (label: string, value: string) => (
    <Card>
      <p className="text-xs text-surface-foreground/60">{label}</p>
      <p className="text-xl font-semibold text-surface-foreground">{value}</p>
    </Card>
  );

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

      {s && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {kpi(t("customers"), s.customers.toLocaleString(locale))}
          {kpi(t("averageLtv"), money(s.averageLtv))}
          {kpi(t("medianLtv"), money(s.medianLtv))}
          {kpi(t("repeatRate"), pct(s.repeatRate))}
          {kpi(t("averageOrders"), s.averageOrders.toFixed(2))}
          {kpi(t("topDecile"), pct(s.topDecileShare))}
          {kpi(t("p75"), money(s.percentiles.p75))}
          {kpi(t("p90"), money(s.percentiles.p90))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["retention", "ltv"] as const).map((m) => (
          <Button key={m} variant={metric === m ? "primary" : "secondary"} onClick={() => setMetric(m)}>
            {t(`metric_${m}`)}
          </Button>
        ))}
        {[6, 12, 24].map((m) => (
          <Button key={m} variant={months === m ? "primary" : "secondary"} onClick={() => setMonths(m)}>
            {t("lastMonths", { count: m })}
          </Button>
        ))}
      </div>

      {report && (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                <th className="py-2 pr-4">{t("cohort")}</th>
                <th className="py-2 pr-4">{t("size")}</th>
                {Array.from({ length: report.maxOffset + 1 }, (_, i) => (
                  <th key={i} className="px-2 py-2 text-center">
                    {t("monthOffset", { n: i })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.cohorts.map((c) => (
                <tr key={c.cohort} className="border-b border-border last:border-b-0">
                  <td className="py-2 pr-4 font-medium text-surface-foreground">{c.cohort}</td>
                  <td className="py-2 pr-4 text-surface-foreground/80">{c.size.toLocaleString(locale)}</td>
                  {Array.from({ length: report.maxOffset + 1 }, (_, i) => {
                    const retention = c.retention[i] ?? null;
                    const ltv = c.ltv[i] ?? null;
                    const value = metric === "retention" ? retention : ltv;
                    return (
                      <td key={i} className="px-2 py-2 text-center text-surface-foreground" style={shade(retention)}>
                        {value === null ? "" : metric === "retention" ? pct(value, 0) : money(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {report.cohorts.length === 0 && (
                <tr>
                  <td colSpan={report.maxOffset + 3} className="py-4 text-surface-foreground/50">
                    {t("none")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-surface-foreground/50">{t("note")}</p>
    </div>
  );
}
