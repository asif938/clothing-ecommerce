"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "../../../i18n/navigation";
import { api, ApiError } from "../../../lib/api";
import { localized, money, pct } from "../../../lib/format";
import { Banner, Button, Card, FieldLabel } from "../../../components/ui";
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
  lowStock: { variantId: string; locationId: string; available: number; lowStockThreshold: number | null; variant?: { sku: string } }[];
  liveVisitors: number;
  activeCarts: number;
  pendingCodAmount: number;
  codOutstanding: { amount: number; shipments: number };
  alerts: { type: string; name: string; capability: string | null; errorCount24h: number }[];
  anomalies: { id: string; severity: "warning" | "critical"; message: { bn: string; en: string } }[];
}

interface Layout {
  source: "staff" | "role" | "default" | "builtin";
  widgets: string[];
  catalog: { key: string; label: { bn: string; en: string } }[];
  canManageShared: boolean;
}

interface ProfitSummary {
  revenue: number;
  profit: number;
  margin: number | null;
  soldOrders: number;
}

function rangeDates(range: Range): { from: string; to: string } {
  const now = new Date();
  const from = range === "today" ? new Date(now.getFullYear(), now.getMonth(), now.getDate()) : new Date(now.getTime() - (range === "30d" ? 30 : 7) * 86_400_000);
  return { from: from.toISOString(), to: now.toISOString() };
}

/** Dashboard (§8.2) with per-staff / per-role / store-default widget layouts (§16 M12 custom dashboards). */
export default function DashboardHomePage() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { staff } = useCurrentStaff();
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<Kpis | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [profit, setProfit] = useState<ProfitSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ widgets: string[]; scope: "staff" | "role" | "default"; roleId: string } | null>(null);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api
      .get<Kpis>(`/admin/dashboard?range=${range}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load dashboard"));
  }, [range]);

  const loadLayout = useCallback(async () => {
    try {
      setLayout(await api.get<Layout>("/admin/dashboard/layout"));
    } catch {
      setLayout({ source: "builtin", widgets: ["alerts", "kpis", "ordersByStatus", "topProducts", "lowStock", "liveActivity"], catalog: [], canManageShared: false });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void loadLayout();
  }, [loadLayout]);

  const wantsProfit = layout?.widgets.includes("profitSnapshot") ?? false;
  useEffect(() => {
    if (!wantsProfit) return;
    api
      .get<{ summary: ProfitSummary }>(`/admin/finance/profit?${new URLSearchParams(rangeDates(range)).toString()}`)
      .then((r) => setProfit(r.summary))
      .catch(() => setProfit(null));
  }, [wantsProfit, range]);

  async function startEditing() {
    if (!layout) return;
    setEditing({ widgets: [...layout.widgets], scope: "staff", roleId: "" });
    if (layout.canManageShared) {
      const r = await api.get<{ id: string; name: string }[]>("/admin/dashboard/layout/roles").catch(() => []);
      setRoles(r);
    }
  }

  async function loadShared(scope: "staff" | "role" | "default", roleId: string) {
    if (!editing) return;
    if (scope === "staff") {
      setEditing({ ...editing, scope, widgets: layout ? [...layout.widgets] : editing.widgets });
      return;
    }
    const params = new URLSearchParams({ scope, ...(roleId ? { roleId } : {}) });
    const shared = await api.get<{ widgets: string[] | null }>(`/admin/dashboard/layout/shared?${params.toString()}`).catch(() => ({ widgets: null }));
    setEditing({ scope, roleId, widgets: shared.widgets ?? layout?.widgets ?? [] });
  }

  async function saveLayout() {
    if (!editing) return;
    try {
      setLayout(await api.put<Layout>("/admin/dashboard/layout", { scope: editing.scope, roleId: editing.roleId || undefined, widgets: editing.widgets }));
      setEditing(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  async function resetLayout() {
    if (!editing) return;
    const params = new URLSearchParams({ scope: editing.scope, ...(editing.roleId ? { roleId: editing.roleId } : {}) });
    try {
      setLayout(await api.delete<Layout>(`/admin/dashboard/layout?${params.toString()}`));
      setEditing(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reset failed");
    }
  }

  function move(key: string, delta: number) {
    if (!editing) return;
    const list = [...editing.widgets];
    const i = list.indexOf(key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    setEditing({ ...editing, widgets: list });
  }

  const kpi = (label: string, value: string) => (
    <Card>
      <p className="text-xs text-surface-foreground/60">{label}</p>
      <p className="text-2xl font-semibold text-surface-foreground">{value}</p>
    </Card>
  );

  function renderWidget(key: string, d: Kpis): ReactNode {
    switch (key) {
      case "alerts":
        if (d.alerts.length === 0 && d.anomalies.length === 0) return null;
        return (
          <div className="flex flex-col gap-2">
            {d.anomalies.map((a) => (
              <Banner key={a.id} kind={a.severity === "critical" ? "error" : "warning"}>
                {localized(a.message, locale)}{" "}
                <Link href="/alerts" className="underline">
                  {t("viewAlerts")}
                </Link>
              </Banner>
            ))}
            {d.alerts.length > 0 && <Banner kind="warning">{d.alerts.map((a) => t("alertIntegrationFailing", { name: a.name, count: a.errorCount24h })).join(" · ")}</Banner>}
          </div>
        );
      case "kpis":
        return (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {kpi(t("revenue"), money(d.revenue))}
            {kpi(t("orders"), String(d.ordersCount))}
            {kpi(t("aov"), money(d.aov))}
            {kpi(t("conversionRate"), pct(d.conversionRate))}
            {kpi(t("deliveredRate"), pct(d.deliveredRate))}
            {kpi(t("rejectionRate"), pct(d.rejectionRate))}
            {kpi(t("newVsReturning"), `${d.newCustomerOrders} / ${d.returningCustomerOrders}`)}
            {kpi(t("pendingCod"), money(d.pendingCodAmount))}
          </div>
        );
      case "ordersByStatus":
        return (
          <Card>
            <h2 className="mb-3 font-medium text-surface-foreground">{t("ordersByStatus")}</h2>
            <div className="flex flex-wrap gap-2">
              {d.ordersByStatus.map((s) => (
                <button key={s.status} onClick={() => router.push(`/orders?status=${s.status}`)} className="rounded-theme bg-muted px-3 py-1.5 text-sm text-surface-foreground hover:opacity-80">
                  {s.status}: {s.count}
                </button>
              ))}
              {d.ordersByStatus.length === 0 && <span className="text-sm text-surface-foreground/50">—</span>}
            </div>
          </Card>
        );
      case "topProducts":
        return (
          <Card>
            <h2 className="mb-3 font-medium text-surface-foreground">{t("topProducts")}</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {d.topProducts.map((p) => (
                <li key={p.variantId} className="flex justify-between border-b border-border py-1 last:border-b-0">
                  <span className="text-surface-foreground">{localized(p.title, locale) || p.sku}</span>
                  <span className="text-surface-foreground/60">
                    {p.quantity} · {money(p.revenue)}
                  </span>
                </li>
              ))}
              {d.topProducts.length === 0 && <li className="text-surface-foreground/50">—</li>}
            </ul>
          </Card>
        );
      case "lowStock":
        return (
          <Card>
            <h2 className="mb-3 font-medium text-surface-foreground">{t("lowStock")}</h2>
            <ul className="flex flex-col gap-1 text-sm">
              {d.lowStock.map((l) => (
                <li key={`${l.variantId}-${l.locationId}`} className="flex justify-between border-b border-border py-1 last:border-b-0">
                  <span className="text-surface-foreground">{l.variant?.sku ?? l.variantId}</span>
                  <span className="text-danger">{l.available}</span>
                </li>
              ))}
              {d.lowStock.length === 0 && <li className="text-surface-foreground/50">—</li>}
            </ul>
          </Card>
        );
      case "codOutstanding":
        return (
          <Card>
            <p className="text-xs text-surface-foreground/60">{t("codOutstanding")}</p>
            <p className="text-2xl font-semibold text-surface-foreground">{money(d.codOutstanding.amount)}</p>
            <p className="text-xs text-surface-foreground/60">
              {t("codOutstandingParcels", { count: d.codOutstanding.shipments })}{" "}
              <Link href="/finance/cod" className="text-brand underline">
                {t("reconcile")}
              </Link>
            </p>
          </Card>
        );
      case "profitSnapshot":
        return (
          <Card>
            <p className="text-xs text-surface-foreground/60">{t("trueProfit")}</p>
            {profit ? (
              <>
                <p className={`text-2xl font-semibold ${profit.profit < 0 ? "text-danger" : "text-surface-foreground"}`}>{money(profit.profit)}</p>
                <p className="text-xs text-surface-foreground/60">
                  {t("profitMeta", { margin: pct(profit.margin), orders: profit.soldOrders })}{" "}
                  <Link href="/finance/profit" className="text-brand underline">
                    {t("details")}
                  </Link>
                </p>
              </>
            ) : (
              <p className="text-sm text-surface-foreground/50">—</p>
            )}
          </Card>
        );
      case "liveActivity":
        return (
          <p className="text-sm text-surface-foreground/60">
            {t("liveVisitors")}: {d.liveVisitors} · {t("activeCarts")}: {d.activeCarts}
          </p>
        );
      default:
        return null;
    }
  }

  // Small cards sit two-up; wide widgets take the full row.
  const HALF = new Set(["topProducts", "lowStock", "codOutstanding", "profitSnapshot"]);
  const groups: string[][] = [];
  for (const key of layout?.widgets ?? []) {
    const last = groups[groups.length - 1];
    if (HALF.has(key) && last && last.length === 1 && HALF.has(last[0]!)) last.push(key);
    else groups.push([key]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-surface-foreground">{staff ? t("welcome", { name: staff.name }) : t("title")}</h1>
        <div className="flex flex-wrap gap-2">
          {(["today", "7d", "30d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-theme px-3 py-1.5 text-sm ${range === r ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground"}`}
            >
              {t(`range${r === "today" ? "Today" : r === "7d" ? "7d" : "30d"}`)}
            </button>
          ))}
          {layout && !editing && (
            <Button variant="secondary" onClick={() => void startEditing()}>
              {t("customize")}
            </Button>
          )}
        </div>
      </div>

      {error && <Banner kind="error">{error}</Banner>}

      {editing && layout && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium text-surface-foreground">{t("customizeTitle")}</h2>
          {layout.canManageShared && (
            <div className="flex flex-wrap gap-3">
              <FieldLabel>
                {t("layoutFor")}
                <select
                  className="rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground"
                  value={editing.scope}
                  onChange={(e) => void loadShared(e.target.value as "staff" | "role" | "default", editing.roleId)}
                >
                  <option value="staff">{t("scope_staff")}</option>
                  <option value="role">{t("scope_role")}</option>
                  <option value="default">{t("scope_default")}</option>
                </select>
              </FieldLabel>
              {editing.scope === "role" && (
                <FieldLabel>
                  {t("role")}
                  <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground" value={editing.roleId} onChange={(e) => void loadShared("role", e.target.value)}>
                    <option value="">—</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
              )}
            </div>
          )}
          <ul className="flex flex-col gap-1">
            {[...editing.widgets, ...layout.catalog.map((c) => c.key).filter((k) => !editing.widgets.includes(k))].map((key) => {
              const on = editing.widgets.includes(key);
              const label = layout.catalog.find((c) => c.key === key)?.label;
              return (
                <li key={key} className="flex items-center justify-between rounded-theme border border-border px-3 py-2 text-sm">
                  <label className="flex items-center gap-2 text-surface-foreground">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setEditing({ ...editing, widgets: e.target.checked ? [...editing.widgets, key] : editing.widgets.filter((w) => w !== key) })}
                    />
                    {label ? localized(label, locale) : key}
                  </label>
                  {on && (
                    <span className="flex gap-2">
                      <button type="button" aria-label="up" className="text-surface-foreground/60 hover:text-surface-foreground" onClick={() => move(key, -1)}>
                        ↑
                      </button>
                      <button type="button" aria-label="down" className="text-surface-foreground/60 hover:text-surface-foreground" onClick={() => move(key, 1)}>
                        ↓
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-surface-foreground/50">{t(`layoutSource_${layout.source}`)}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void saveLayout()} disabled={editing.scope === "role" && !editing.roleId}>
              {tCommon("save")}
            </Button>
            <Button variant="secondary" onClick={() => void resetLayout()} disabled={editing.scope === "role" && !editing.roleId}>
              {t("resetLayout")}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </Card>
      )}

      {data &&
        groups.map((group) => {
          const nodes = group.map((key) => ({ key, node: renderWidget(key, data) })).filter((n) => n.node !== null);
          if (nodes.length === 0) return null;
          return nodes.length === 2 ? (
            <div key={group.join("+")} className="grid gap-4 md:grid-cols-2">
              {nodes.map((n) => (
                <div key={n.key}>{n.node}</div>
              ))}
            </div>
          ) : (
            <div key={group.join("+")}>{nodes[0]!.node}</div>
          );
        })}
    </div>
  );
}
