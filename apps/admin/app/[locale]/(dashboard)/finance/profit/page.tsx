"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { dateInput, money, pct } from "../../../../../lib/format";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";
import { FinanceTabs } from "../../../../../components/finance-tabs";

interface Summary {
  orders: number;
  soldOrders: number;
  failedDeliveries: number;
  revenue: number;
  cogs: number;
  courierCost: number;
  gatewayFees: number;
  adSpend: number;
  refunds: number;
  profit: number;
  margin: number | null;
  uncostedUnits: number;
  courierEstimatedOrders: number;
  gatewayFeesFromSettlements: string[];
  ordersInPipeline: number;
}
interface DayRow {
  day: string;
  orders: number;
  revenue: number;
  cogs: number;
  courierCost: number;
  gatewayFees: number;
  profit: number;
}
interface OrderRow {
  orderId: string;
  orderNumber: string;
  status: string;
  outcome: "sold" | "failed_delivery";
  revenue: number;
  cogs: number;
  courierCost: number;
  gatewayFees: number;
  profit: number;
  courierEstimated: boolean;
  uncostedUnits: number;
}
interface Report {
  summary: Summary;
  days: DayRow[];
  orders: OrderRow[];
}

/** True profit report (§8.2 Reports "profit", §16 M12): revenue − COGS − courier − gateway fees, on orders with a final delivery outcome. */
export default function ProfitPage() {
  const t = useTranslations("finance");
  // Lazy initialisers: the current date is read once, not on every render.
  const [from, setFrom] = useState(() => dateInput(new Date(Date.now() - 30 * 86_400_000)));
  const [to, setTo] = useState(() => dateInput(new Date()));
  const [view, setView] = useState<"day" | "order">("day");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const range = () => ({ from: new Date(`${from}T00:00:00+06:00`).toISOString(), to: new Date(`${to}T23:59:59+06:00`).toISOString() });

  useEffect(() => {
    const params = new URLSearchParams(range());
    api
      .get<Report>(`/admin/finance/profit?${params.toString()}`)
      .then((r) => {
        setReport(r);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- range() derives from from/to.
  }, [from, to]);

  const s = report?.summary;
  const exportUrl = `/api/v1/admin/finance/profit?${new URLSearchParams({ ...range(), groupBy: view, format: "csv" }).toString()}`;
  const kpi = (label: string, value: string, tone = "text-surface-foreground") => (
    <Card>
      <p className="text-xs text-surface-foreground/60">{label}</p>
      <p className={`text-xl font-semibold ${tone}`}>{value}</p>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      <FinanceTabs />
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("profitTitle")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("profitSubtitle")}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <TextField label={t("from")} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label={t("to")} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <a href={exportUrl} className="rounded-theme bg-muted px-4 py-2 text-sm text-surface-foreground hover:opacity-80" download>
          {t("exportCsv")}
        </a>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {kpi(t("revenue"), money(s.revenue))}
            {kpi(t("cogs"), money(s.cogs))}
            {kpi(t("courierCost"), money(s.courierCost))}
            {kpi(t("gatewayFees"), money(s.gatewayFees))}
            {kpi(t("profit"), money(s.profit), s.profit < 0 ? "text-danger" : "text-success")}
            {kpi(t("margin"), pct(s.margin))}
            {kpi(t("soldVsFailed"), `${s.soldOrders} / ${s.failedDeliveries}`)}
            {kpi(t("inPipeline"), String(s.ordersInPipeline))}
          </div>
          <div className="flex flex-col gap-1 text-xs text-surface-foreground/60">
            <p>{t("profitNoteScope")}</p>
            {s.courierEstimatedOrders > 0 && <p className="text-warning">{t("profitNoteCourier", { count: s.courierEstimatedOrders })}</p>}
            {s.uncostedUnits > 0 && (
              <p className="text-warning">
                {t("profitNoteUncosted", { count: s.uncostedUnits })}{" "}
                <Link href="/purchase-orders" className="underline">
                  {t("profitNoteUncostedLink")}
                </Link>
              </p>
            )}
            <p>{s.gatewayFeesFromSettlements.length > 0 ? t("profitNoteGatewayRecorded", { methods: s.gatewayFeesFromSettlements.join(", ") }) : t("profitNoteGatewayEstimated")}</p>
            <p>{t("profitNoteAds")}</p>
          </div>

          <div className="flex gap-2">
            {(["day", "order"] as const).map((v) => (
              <Button key={v} variant={view === v ? "primary" : "secondary"} onClick={() => setView(v)}>
                {t(`by_${v}`)}
              </Button>
            ))}
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                  <th className="py-2 pr-4">{view === "day" ? t("day") : t("order")}</th>
                  {view === "day" && <th className="py-2 pr-4">{t("orders")}</th>}
                  <th className="py-2 pr-4">{t("revenue")}</th>
                  <th className="py-2 pr-4">{t("cogs")}</th>
                  <th className="py-2 pr-4">{t("courierCost")}</th>
                  <th className="py-2 pr-4">{t("gatewayFees")}</th>
                  <th className="py-2 pr-4">{t("profit")}</th>
                </tr>
              </thead>
              <tbody>
                {view === "day" &&
                  report!.days.map((d) => (
                    <tr key={d.day} className="border-b border-border last:border-b-0">
                      <td className="py-2 pr-4 text-surface-foreground">{d.day}</td>
                      <td className="py-2 pr-4 text-surface-foreground/80">{d.orders}</td>
                      <td className="py-2 pr-4 text-surface-foreground/80">{money(d.revenue)}</td>
                      <td className="py-2 pr-4 text-surface-foreground/80">{money(d.cogs)}</td>
                      <td className="py-2 pr-4 text-surface-foreground/80">{money(d.courierCost)}</td>
                      <td className="py-2 pr-4 text-surface-foreground/80">{money(d.gatewayFees)}</td>
                      <td className={`py-2 pr-4 font-medium ${d.profit < 0 ? "text-danger" : "text-surface-foreground"}`}>{money(d.profit)}</td>
                    </tr>
                  ))}
                {view === "order" &&
                  report!.orders.map((o) => (
                    <tr key={o.orderId} className="border-b border-border last:border-b-0">
                      <td className="py-2 pr-4">
                        <Link href={`/orders/${o.orderId}`} className="text-brand hover:underline">
                          {o.orderNumber}
                        </Link>{" "}
                        <span className="text-xs text-surface-foreground/50">{t(`outcome_${o.outcome}`)}</span>
                      </td>
                      <td className="py-2 pr-4 text-surface-foreground/80">{money(o.revenue)}</td>
                      <td className="py-2 pr-4 text-surface-foreground/80">
                        {money(o.cogs)}
                        {o.uncostedUnits > 0 && <span className="text-warning"> *</span>}
                      </td>
                      <td className="py-2 pr-4 text-surface-foreground/80">
                        {money(o.courierCost)}
                        {o.courierEstimated && <span className="text-warning"> ~</span>}
                      </td>
                      <td className="py-2 pr-4 text-surface-foreground/80">{money(o.gatewayFees)}</td>
                      <td className={`py-2 pr-4 font-medium ${o.profit < 0 ? "text-danger" : "text-surface-foreground"}`}>{money(o.profit)}</td>
                    </tr>
                  ))}
                {((view === "day" && report!.days.length === 0) || (view === "order" && report!.orders.length === 0)) && (
                  <tr>
                    <td colSpan={7} className="py-4 text-surface-foreground/50">
                      {t("noProfitData")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
