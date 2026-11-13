"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { money, shortDate } from "../../../../../lib/format";
import { Banner, Button, Card, FieldLabel, TextField } from "../../../../../components/ui";
import { InventoryTabs } from "../../../../../components/inventory-tabs";

type Urgency = "critical" | "soon" | "ok" | "no_demand";
interface Row {
  variantId: string;
  sku: string;
  title: string;
  supplierId: string | null;
  supplierName: string | null;
  leadTimeDays: number;
  onHand: number;
  incoming: number;
  nextExpectedAt: string | null;
  dailyRate: number;
  trend: number | null;
  forecastUnits: number;
  confidence: "none" | "low" | "medium" | "high";
  daysOfCover: number | null;
  suggestedQty: number;
  urgency: Urgency;
  unitCost: number;
  estimatedCost: number;
}
interface Result {
  days: number;
  horizonDays: number;
  rows: Row[];
  totals: { variants: number; actionable: number; critical: number; units: number; estimatedCost: number };
}

const URGENCY_STYLE: Record<Urgency, string> = {
  critical: "bg-danger/10 text-danger",
  soon: "bg-warning/10 text-warning",
  ok: "bg-success/10 text-success",
  no_demand: "bg-muted text-surface-foreground/60",
};

/** Demand forecast and reorder suggestions (§8.2 Inventory, §16 M17). */
export default function ReorderPage() {
  const t = useTranslations("reorder");
  const locale = useLocale();
  const [days, setDays] = useState("");
  const [show, setShow] = useState<"actionable" | "all">("actionable");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ number: string; id: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [qtyOverride, setQtyOverride] = useState<Record<string, string>>({});
  const [supplierOverride, setSupplierOverride] = useState<Record<string, string>>({});
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; isActive: boolean }[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string; isDefault: boolean }[]>([]);
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ id: string; name: string; isActive: boolean }[]>("/admin/suppliers").then((s) => setSuppliers(s.filter((x) => x.isActive))).catch(() => setSuppliers([]));
    api
      .get<{ id: string; name: string; isDefault: boolean }[]>("/admin/lookups/stock-locations")
      .then((l) => {
        setLocations(l);
        setLocationId((current) => current || l.find((x) => x.isDefault)?.id || l[0]?.id || "");
      })
      .catch(() => setLocations([]));
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ show });
    if (days.trim()) params.set("days", days.trim());
    try {
      setResult(await api.get<Result>(`/admin/reorder?${params.toString()}`));
      setError(null);
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [days, show]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload when the options change.
    void load();
  }, [load]);

  const qtyFor = (row: Row) => {
    const typed = qtyOverride[row.variantId];
    return typed === undefined ? row.suggestedQty : Math.max(0, Number.parseInt(typed || "0", 10) || 0);
  };
  const supplierFor = (row: Row) => supplierOverride[row.variantId] ?? row.supplierId ?? "";

  const selected = useMemo(() => (result?.rows ?? []).filter((r) => picked.has(r.variantId)), [result, picked]);
  const ready = selected.filter((r) => qtyFor(r) > 0 && supplierFor(r));
  const selectedCost = ready.reduce((a, r) => a + qtyFor(r) * r.unitCost, 0);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createDrafts() {
    if (!locationId || ready.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ created: { id: string; number: string }[] }>("/admin/reorder/draft-orders", {
        locationId,
        items: ready.map((r) => ({ variantId: r.variantId, supplierId: supplierFor(r), quantity: qtyFor(r) })),
      });
      setNotice(res.created);
      setPicked(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <InventoryTabs />
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && (
        <Banner kind="success">
          {t("draftsCreated", { count: notice.length })}{" "}
          {notice.map((n) => (
            <Link key={n.id} href={`/purchase-orders/${n.id}`} className="mr-2 underline">
              {n.number}
            </Link>
          ))}
        </Banner>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <TextField label={t("historyDays")} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} placeholder={result ? String(result.days) : ""} />
        {(["actionable", "all"] as const).map((s) => (
          <Button key={s} variant={show === s ? "primary" : "secondary"} onClick={() => setShow(s)}>
            {t(`show_${s}`)}
          </Button>
        ))}
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card>
              <p className="text-xs text-surface-foreground/60">{t("kpiActionable")}</p>
              <p className="text-xl font-semibold text-surface-foreground">{result.totals.actionable}</p>
            </Card>
            <Card>
              <p className="text-xs text-surface-foreground/60">{t("kpiCritical")}</p>
              <p className={`text-xl font-semibold ${result.totals.critical > 0 ? "text-danger" : "text-surface-foreground"}`}>{result.totals.critical}</p>
            </Card>
            <Card>
              <p className="text-xs text-surface-foreground/60">{t("kpiUnits")}</p>
              <p className="text-xl font-semibold text-surface-foreground">{result.totals.units}</p>
            </Card>
            <Card>
              <p className="text-xs text-surface-foreground/60">{t("kpiCost")}</p>
              <p className="text-xl font-semibold text-surface-foreground">{money(result.totals.estimatedCost)}</p>
            </Card>
          </div>
          <p className="text-xs text-surface-foreground/60">{t("method", { days: result.days, horizon: result.horizonDays })}</p>

          <div className="flex flex-wrap items-end gap-3">
            <FieldLabel>
              {t("receiveAt")}
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground">
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <Button onClick={createDrafts} disabled={busy || ready.length === 0 || !locationId}>
              {t("createDrafts", { count: ready.length, cost: money(selectedCost) })}
            </Button>
            {selected.length > ready.length && <p className="text-xs text-warning">{t("needSupplier", { count: selected.length - ready.length })}</p>}
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                  <th className="py-2 pr-2" />
                  <th className="py-2 pr-4">{t("variant")}</th>
                  <th className="py-2 pr-4">{t("urgency")}</th>
                  <th className="py-2 pr-4">{t("onHand")}</th>
                  <th className="py-2 pr-4">{t("incoming")}</th>
                  <th className="py-2 pr-4">{t("rate")}</th>
                  <th className="py-2 pr-4">{t("cover")}</th>
                  <th className="py-2 pr-4">{t("lead")}</th>
                  <th className="py-2 pr-4">{t("supplier")}</th>
                  <th className="py-2 pr-4">{t("orderQty")}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.variantId} className="border-b border-border last:border-b-0">
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={picked.has(row.variantId)} onChange={() => toggle(row.variantId)} disabled={row.suggestedQty === 0 && qtyOverride[row.variantId] === undefined} aria-label={row.sku} />
                    </td>
                    <td className="py-2 pr-4">
                      <div className="text-surface-foreground">{row.title}</div>
                      <div className="text-xs text-surface-foreground/50">{row.sku}</div>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-theme px-2 py-0.5 text-xs ${URGENCY_STYLE[row.urgency]}`}>{t(`urgency_${row.urgency}`)}</span>
                      {row.confidence === "low" && <div className="text-xs text-surface-foreground/50">{t("lowConfidence")}</div>}
                    </td>
                    <td className="py-2 pr-4 text-surface-foreground/80">{row.onHand}</td>
                    <td className="py-2 pr-4 text-surface-foreground/80">
                      {row.incoming}
                      {row.nextExpectedAt && <div className="text-xs text-surface-foreground/50">{shortDate(row.nextExpectedAt)}</div>}
                    </td>
                    <td className="py-2 pr-4 text-surface-foreground/80">
                      {row.dailyRate.toLocaleString(locale)}
                      {row.trend !== null && <div className={`text-xs ${row.trend >= 1.1 ? "text-success" : row.trend <= 0.9 ? "text-danger" : "text-surface-foreground/50"}`}>{row.trend >= 1 ? "▲" : "▼"} {Math.round(Math.abs(row.trend - 1) * 100)}%</div>}
                    </td>
                    <td className="py-2 pr-4 text-surface-foreground/80">{row.daysOfCover === null ? "—" : t("days", { count: Math.round(row.daysOfCover) })}</td>
                    <td className="py-2 pr-4 text-surface-foreground/80">{t("days", { count: row.leadTimeDays })}</td>
                    <td className="py-2 pr-4">
                      {row.supplierId ? (
                        <span className="text-surface-foreground/80">{row.supplierName}</span>
                      ) : (
                        <select value={supplierFor(row)} onChange={(e) => setSupplierOverride((p) => ({ ...p, [row.variantId]: e.target.value }))} className="rounded-theme border border-border bg-surface px-2 py-1 text-sm text-surface-foreground">
                          <option value="">{t("chooseSupplier")}</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        inputMode="numeric"
                        value={qtyOverride[row.variantId] ?? String(row.suggestedQty)}
                        onChange={(e) => setQtyOverride((p) => ({ ...p, [row.variantId]: e.target.value.replace(/\D/g, "") }))}
                        className="w-20 rounded-theme border border-border bg-surface px-2 py-1 text-sm text-surface-foreground"
                        aria-label={t("orderQty")}
                      />
                    </td>
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-4 text-surface-foreground/50">
                      {t("none")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-surface-foreground/50">{t("limitations")}</p>
        </>
      )}
    </div>
  );
}
