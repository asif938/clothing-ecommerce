"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../i18n/navigation";
import { api, ApiError } from "../../../lib/api";
import { Banner, Card } from "../../../components/ui";
import { useCurrentStaff } from "../../../lib/use-current-staff";

type Range = "today" | "7d" | "30d";

interface Kpis {
  revenue: number;
  ordersCount: number;
  aov: number;
  conversionRate: number | null;
  deliveredRate: number;
  rejectionRate: number;
  newCustomerOrders: number;
  returningCustomerOrders: number;
  ordersByStatus: { status: string; count: number }[];
  topProducts: { variantId: string; sku: string; title: { bn?: string; en?: string } | null; slug: string | null; revenue: number; quantity: number }[];
  lowStock: { variantId: string; locationId: string; available: number; lowStockThreshold: number | null }[];
  liveVisitors: number;
  activeCarts: number;
  pendingCodAmount: number;
  alerts: { type: string; name: string; capability: string | null; errorCount24h: number }[];
}

function money(poisha: number): string {
  return `৳${(poisha / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export default function DashboardHomePage() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const { staff } = useCurrentStaff();
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<Kpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Kpis>(`/admin/dashboard?range=${range}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"));
  }, [range]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-surface-foreground">{staff ? t("welcome", { name: staff.name }) : t("title")}</h1>
        <div className="flex gap-2">
          {(["today", "7d", "30d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-theme px-3 py-1.5 text-sm ${range === r ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground"}`}
            >
              {t(`range${r === "today" ? "Today" : r === "7d" ? "7d" : "30d"}`)}
            </button>
          ))}
        </div>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {data && (
        <>
          {data.alerts.length > 0 && (
            <Banner kind="warning">{data.alerts.map((a) => t("alertIntegrationFailing", { name: a.name, count: a.errorCount24h })).join(" · ")}</Banner>
          )}

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card><p className="text-xs text-surface-foreground/60">{t("revenue")}</p><p className="text-2xl font-semibold text-surface-foreground">{money(data.revenue)}</p></Card>
            <Card><p className="text-xs text-surface-foreground/60">{t("orders")}</p><p className="text-2xl font-semibold text-surface-foreground">{data.ordersCount}</p></Card>
            <Card><p className="text-xs text-surface-foreground/60">{t("aov")}</p><p className="text-2xl font-semibold text-surface-foreground">{money(data.aov)}</p></Card>
            <Card><p className="text-xs text-surface-foreground/60">{t("conversionRate")}</p><p className="text-2xl font-semibold text-surface-foreground">{pct(data.conversionRate)}</p></Card>
            <Card><p className="text-xs text-surface-foreground/60">{t("deliveredRate")}</p><p className="text-2xl font-semibold text-surface-foreground">{pct(data.deliveredRate)}</p></Card>
            <Card><p className="text-xs text-surface-foreground/60">{t("rejectionRate")}</p><p className="text-2xl font-semibold text-surface-foreground">{pct(data.rejectionRate)}</p></Card>
            <Card><p className="text-xs text-surface-foreground/60">{t("newVsReturning")}</p><p className="text-2xl font-semibold text-surface-foreground">{data.newCustomerOrders} / {data.returningCustomerOrders}</p></Card>
            <Card><p className="text-xs text-surface-foreground/60">{t("pendingCod")}</p><p className="text-2xl font-semibold text-surface-foreground">{money(data.pendingCodAmount)}</p></Card>
          </div>

          <Card>
            <h2 className="mb-3 font-medium text-surface-foreground">{t("ordersByStatus")}</h2>
            <div className="flex flex-wrap gap-2">
              {data.ordersByStatus.map((s) => (
                <button key={s.status} onClick={() => router.push(`/orders?status=${s.status}`)} className="rounded-theme bg-muted px-3 py-1.5 text-sm text-surface-foreground hover:opacity-80">
                  {s.status}: {s.count}
                </button>
              ))}
              {data.ordersByStatus.length === 0 && <span className="text-sm text-surface-foreground/50">—</span>}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-medium text-surface-foreground">{t("topProducts")}</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {data.topProducts.map((p) => (
                  <li key={p.variantId} className="flex justify-between border-b border-border py-1 last:border-b-0">
                    <span className="text-surface-foreground">{p.title?.en ?? p.title?.bn ?? p.sku}</span>
                    <span className="text-surface-foreground/60">{p.quantity} · {money(p.revenue)}</span>
                  </li>
                ))}
                {data.topProducts.length === 0 && <li className="text-surface-foreground/50">—</li>}
              </ul>
            </Card>
            <Card>
              <h2 className="mb-3 font-medium text-surface-foreground">{t("lowStock")}</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {data.lowStock.map((l) => (
                  <li key={`${l.variantId}-${l.locationId}`} className="flex justify-between border-b border-border py-1 last:border-b-0">
                    <span className="text-surface-foreground">{l.variantId}</span>
                    <span className="text-danger">{l.available}</span>
                  </li>
                ))}
                {data.lowStock.length === 0 && <li className="text-surface-foreground/50">—</li>}
              </ul>
            </Card>
          </div>

          <p className="text-sm text-surface-foreground/60">
            {t("liveVisitors")}: {data.liveVisitors} · {t("activeCarts")}: {data.activeCarts}
          </p>
        </>
      )}
    </div>
  );
}
