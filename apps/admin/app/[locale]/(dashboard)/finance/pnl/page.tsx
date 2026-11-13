"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { dateInput, localized, money, pct, type Localized } from "../../../../../lib/format";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";
import { FinanceTabs } from "../../../../../components/finance-tabs";

interface Statement {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number | null;
  courierCost: number;
  gatewayFees: number;
  contribution: number;
  adSpend: number;
  operatingExpenses: number;
  expensesByCategory: { category: string; amount: number }[];
  netProfit: number;
  netMargin: number | null;
  uncostedUnits: number;
  courierEstimatedOrders: number;
}
interface PnlReport {
  total: Statement;
  months: { month: string; statement: Statement }[];
  categories: { key: string; label: Localized }[];
}

const monthStart = () => {
  const now = new Date();
  return dateInput(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)));
};

/** Profit & loss statement (§8.2 Finance, §16 M17): revenue down to net profit, in total or month by month. */
export default function PnlPage() {
  const t = useTranslations("pnl");
  const locale = useLocale();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [groupBy, setGroupBy] = useState<"total" | "month">("total");
  const [report, setReport] = useState<PnlReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => ({ from: new Date(`${from}T00:00:00+06:00`).toISOString(), to: new Date(`${to}T23:59:59+06:00`).toISOString() }), [from, to]);

  useEffect(() => {
    api
      .get<PnlReport>(`/admin/finance/pnl?${new URLSearchParams({ ...range, groupBy }).toString()}`)
      .then((r) => {
        setReport(r);
        setError(null);
      })
      .catch((err) => {
        setReport(null);
        setError(err instanceof ApiError ? err.message : "Failed to load");
      });
  }, [range, groupBy]);

  const categoryLabel = (key: string) => {
    const found = report?.categories.find((c) => c.key === key);
    return found ? localized(found.label, locale) : key;
  };

  const columns = report ? (groupBy === "month" ? [...report.months.map((m) => ({ key: m.month, title: m.month, s: m.statement })), { key: "total", title: t("total"), s: report.total }] : [{ key: "total", title: t("total"), s: report.total }]) : [];
  const expenseKeys = report ? [...new Set(columns.flatMap((c) => c.s.expensesByCategory.map((e) => e.category)))] : [];

  type Line = { label: string; value: (s: Statement) => string; strong?: boolean; indent?: boolean; tone?: (s: Statement) => string };
  const lines: Line[] = report
    ? [
        { label: t("revenue"), value: (s) => money(s.revenue), strong: true },
        { label: t("cogs"), value: (s) => money(-s.cogs) },
        { label: t("grossProfit"), value: (s) => `${money(s.grossProfit)}${s.grossMargin === null ? "" : ` (${pct(s.grossMargin)})`}`, strong: true },
        { label: t("courierCost"), value: (s) => money(-s.courierCost) },
        { label: t("gatewayFees"), value: (s) => money(-s.gatewayFees) },
        { label: t("contribution"), value: (s) => money(s.contribution), strong: true },
        { label: t("adSpend"), value: (s) => money(-s.adSpend) },
        ...expenseKeys.map((key) => ({ label: categoryLabel(key), indent: true, value: (s: Statement) => money(-(s.expensesByCategory.find((e) => e.category === key)?.amount ?? 0)) })),
        { label: t("operatingExpenses"), value: (s) => money(-s.operatingExpenses), strong: true },
        { label: t("netProfit"), value: (s) => `${money(s.netProfit)}${s.netMargin === null ? "" : ` (${pct(s.netMargin)})`}`, strong: true, tone: (s) => (s.netProfit < 0 ? "text-danger" : "text-success") },
      ]
    : [];

  const exportUrl = `/api/v1/admin/finance/pnl?${new URLSearchParams({ ...range, groupBy, format: "csv" }).toString()}`;

  return (
    <div className="flex flex-col gap-6">
      <FinanceTabs />
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <TextField label={t("from")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label={t("to")} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        {(["total", "month"] as const).map((g) => (
          <Button key={g} variant={groupBy === g ? "primary" : "secondary"} onClick={() => setGroupBy(g)}>
            {t(`group_${g}`)}
          </Button>
        ))}
        <a href={exportUrl} download className="rounded-theme bg-muted px-4 py-2 text-sm text-surface-foreground hover:opacity-80">
          {t("exportCsv")}
        </a>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      {report && (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                  <th className="py-2 pr-4" />
                  {columns.map((c) => (
                    <th key={c.key} className="py-2 pr-4 text-right">
                      {c.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={`${line.label}-${i}`} className="border-b border-border last:border-b-0">
                    <td className={`py-2 pr-4 ${line.indent ? "pl-6 text-surface-foreground/70" : "text-surface-foreground"} ${line.strong ? "font-semibold" : ""}`}>{line.label}</td>
                    {columns.map((c) => (
                      <td key={c.key} className={`py-2 pr-4 text-right ${line.strong ? "font-semibold" : "text-surface-foreground/80"} ${line.tone ? line.tone(c.s) : ""}`}>
                        {line.value(c.s)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="flex flex-col gap-1 text-xs text-surface-foreground/60">
            <p>{t("noteScope")}</p>
            {report.total.uncostedUnits > 0 && <p className="text-warning">{t("noteUncosted", { count: report.total.uncostedUnits })}</p>}
            {report.total.courierEstimatedOrders > 0 && <p className="text-warning">{t("noteCourier", { count: report.total.courierEstimatedOrders })}</p>}
            <p>
              {t("noteExpenses")}{" "}
              <Link href="/finance/expenses" className="underline">
                {t("noteExpensesLink")}
              </Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
