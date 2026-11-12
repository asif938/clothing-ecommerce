"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { localized, money, pct, shortDate, type Localized } from "../../../../../lib/format";
import { Banner, Button, Card, FieldLabel, TextField } from "../../../../../components/ui";
import { InventoryTabs } from "../../../../../components/inventory-tabs";
import { VariantPicker } from "../../../../../components/variant-picker";

interface SizeCurve {
  days: number;
  productCount: number;
  title: Localized;
  totalSold: number;
  totalOnHand: number;
  buyQuantity: number;
  rows: { size: string; sold: number; onHand: number; soldShare: number; stockShare: number; gap: number; suggestedQty: number }[];
}

interface DeadStock {
  days: number;
  rows: {
    variantId: string;
    sku: string;
    title: Localized;
    onHand: number;
    price: number;
    costPrice: number | null;
    stockValue: number | null;
    lastSaleAt: string | null;
    daysUnsold: number;
    suggestedPercentOff: number | null;
    suggestedPrice: number | null;
    cappedByMargin: boolean;
  }[];
  totals: { variants: number; units: number; stockValue: number };
}

/** Size-curve analysis and dead stock with markdown suggestions (docs/PROJECT_SPEC.md §8.2 Inventory, §16 M12). */
export default function InventoryAnalysisPage() {
  const t = useTranslations("analysis");
  const locale = useLocale();
  const [tab, setTab] = useState<"sizeCurve" | "deadStock">("sizeCurve");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Size curve
  const [scope, setScope] = useState<{ kind: "product"; id: string; label: string } | { kind: "category"; id: string; label: string } | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: Localized }[]>([]);
  const [buyQty, setBuyQty] = useState("0");
  const [curve, setCurve] = useState<SizeCurve | null>(null);

  // Dead stock
  const [deadDays, setDeadDays] = useState("");
  const [dead, setDead] = useState<DeadStock | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    api
      .get<{ id: string; name: Localized }[]>("/admin/lookups/categories")
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const loadCurve = useCallback(async () => {
    if (!scope) return;
    setError(null);
    const params = new URLSearchParams({ [scope.kind === "product" ? "productId" : "categoryId"]: scope.id, buyQuantity: String(Math.max(0, Number.parseInt(buyQty || "0", 10))) });
    try {
      setCurve(await api.get<SizeCurve>(`/admin/inventory/analysis/size-curve?${params.toString()}`));
    } catch (err) {
      setCurve(null);
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [scope, buyQty]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload when the scope changes.
    void loadCurve();
    // buyQty is applied with the button, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const loadDead = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<DeadStock>(`/admin/inventory/analysis/dead-stock${deadDays ? `?days=${deadDays}` : ""}`);
      setDead(data);
      setPicked(new Set());
      if (!deadDays) setDeadDays(String(data.days));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [deadDays]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the tab opens.
    if (tab === "deadStock" && !dead) void loadDead();
  }, [tab, dead, loadDead]);

  async function applyMarkdowns() {
    if (!dead) return;
    const items = dead.rows.filter((r) => picked.has(r.variantId) && r.suggestedPrice !== null).map((r) => ({ variantId: r.variantId, newPrice: r.suggestedPrice! }));
    if (items.length === 0 || !window.confirm(t("applyMarkdownsConfirm", { count: items.length }))) return;
    setError(null);
    try {
      const result = await api.post<{ created: number }>("/admin/inventory/analysis/markdowns", { items });
      setNotice(t("markdownsCreated", { count: result.created }));
      setPicked(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  const maxShare = curve ? Math.max(0.0001, ...curve.rows.flatMap((r) => [r.soldShare, r.stockShare])) : 1;

  return (
    <div className="flex flex-col gap-6">
      <InventoryTabs />
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      <div className="flex gap-2">
        {(["sizeCurve", "deadStock"] as const).map((k) => (
          <Button key={k} variant={tab === k ? "primary" : "secondary"} onClick={() => setTab(k)}>
            {t(`tab_${k}`)}
          </Button>
        ))}
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      {tab === "sizeCurve" && (
        <>
          <Card className="flex flex-col gap-3">
            <p className="text-sm text-surface-foreground/60">{t("sizeCurveHint")}</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-surface-foreground">{t("pickProduct")}</span>
                <VariantPicker placeholder={t("productSearch")} onPick={(v) => setScope({ kind: "product", id: v.productId, label: localized(v.title, locale) })} />
              </div>
              <FieldLabel>
                {t("orCategory")}
                <select
                  className="rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground"
                  value={scope?.kind === "category" ? scope.id : ""}
                  onChange={(e) => {
                    const cat = categories.find((c) => c.id === e.target.value);
                    setScope(cat ? { kind: "category", id: cat.id, label: localized(cat.name, locale) } : null);
                  }}
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {localized(c.name, locale)}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <TextField label={t("buyQuantity")} type="number" min={0} value={buyQty} onChange={(e) => setBuyQty(e.target.value)} />
              <Button onClick={() => void loadCurve()} disabled={!scope}>
                {t("calculate")}
              </Button>
            </div>
          </Card>

          {curve && scope && (
            <Card className="flex flex-col gap-4">
              <div>
                <h2 className="font-medium text-surface-foreground">{scope.label}</h2>
                <p className="text-xs text-surface-foreground/60">{t("curveMeta", { days: curve.days, sold: curve.totalSold, onHand: curve.totalOnHand, products: curve.productCount })}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                      <th className="py-2 pr-4">{t("size")}</th>
                      <th className="py-2 pr-4">{t("sold")}</th>
                      <th className="py-2 pr-4">{t("onHand")}</th>
                      <th className="w-1/3 py-2 pr-4">{t("salesVsStock")}</th>
                      <th className="py-2 pr-4">{t("gap")}</th>
                      {curve.buyQuantity > 0 && <th className="py-2 pr-4">{t("suggestedBuy")}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {curve.rows.map((r) => (
                      <tr key={r.size} className="border-b border-border last:border-b-0">
                        <td className="py-2 pr-4 font-medium text-surface-foreground">{r.size}</td>
                        <td className="py-2 pr-4 text-surface-foreground/80">
                          {r.sold} ({pct(r.soldShare, 0)})
                        </td>
                        <td className="py-2 pr-4 text-surface-foreground/80">
                          {r.onHand} ({pct(r.stockShare, 0)})
                        </td>
                        <td className="py-2 pr-4">
                          <div className="flex flex-col gap-1" aria-hidden>
                            <div className="h-2 rounded-full bg-brand" style={{ width: `${(r.soldShare / maxShare) * 100}%` }} />
                            <div className="h-2 rounded-full bg-surface-foreground/30" style={{ width: `${(r.stockShare / maxShare) * 100}%` }} />
                          </div>
                        </td>
                        <td className={`py-2 pr-4 ${r.gap < -0.05 ? "text-danger" : r.gap > 0.05 ? "text-warning" : "text-surface-foreground/60"}`}>
                          {r.gap > 0 ? "+" : ""}
                          {pct(r.gap, 0)}
                        </td>
                        {curve.buyQuantity > 0 && <td className="py-2 pr-4 font-semibold text-surface-foreground">{r.suggestedQty}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-surface-foreground/50">{t("legend")}</p>
            </Card>
          )}
        </>
      )}

      {tab === "deadStock" && (
        <>
          <Card className="flex flex-wrap items-end gap-3">
            <TextField label={t("noSaleDays")} type="number" min={1} value={deadDays} onChange={(e) => setDeadDays(e.target.value)} />
            <Button onClick={() => void loadDead()}>{t("refresh")}</Button>
            <a href={`/api/v1/admin/inventory/analysis/dead-stock?format=csv${deadDays ? `&days=${deadDays}` : ""}`} className="rounded-theme bg-muted px-4 py-2 text-sm text-surface-foreground hover:opacity-80" download>
              {t("exportCsv")}
            </a>
            <Button variant="secondary" onClick={() => void applyMarkdowns()} disabled={picked.size === 0}>
              {t("applyMarkdowns", { count: picked.size })}
            </Button>
          </Card>
          {dead && (
            <>
              <p className="text-sm text-surface-foreground/70">{t("deadTotals", { variants: dead.totals.variants, units: dead.totals.units, value: money(dead.totals.stockValue) })}</p>
              <Card className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
                      <th className="py-2 pr-2" />
                      <th className="py-2 pr-4">{t("product")}</th>
                      <th className="py-2 pr-4">{t("onHand")}</th>
                      <th className="py-2 pr-4">{t("stockValue")}</th>
                      <th className="py-2 pr-4">{t("lastSale")}</th>
                      <th className="py-2 pr-4">{t("daysUnsold")}</th>
                      <th className="py-2 pr-4">{t("price")}</th>
                      <th className="py-2 pr-4">{t("suggestion")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dead.rows.map((r) => (
                      <tr key={r.variantId} className="border-b border-border last:border-b-0">
                        <td className="py-2 pr-2">
                          {r.suggestedPrice !== null && (
                            <input
                              type="checkbox"
                              aria-label={r.sku}
                              checked={picked.has(r.variantId)}
                              onChange={(e) => {
                                const next = new Set(picked);
                                if (e.target.checked) next.add(r.variantId);
                                else next.delete(r.variantId);
                                setPicked(next);
                              }}
                            />
                          )}
                        </td>
                        <td className="py-2 pr-4 text-surface-foreground">
                          {localized(r.title, locale)} <span className="font-mono text-xs text-surface-foreground/50">{r.sku}</span>
                        </td>
                        <td className="py-2 pr-4 text-surface-foreground/80">{r.onHand}</td>
                        <td className="py-2 pr-4 text-surface-foreground/80">{money(r.stockValue)}</td>
                        <td className="py-2 pr-4 text-surface-foreground/80">{r.lastSaleAt ? shortDate(r.lastSaleAt) : t("never")}</td>
                        <td className="py-2 pr-4 text-surface-foreground/80">{r.daysUnsold}</td>
                        <td className="py-2 pr-4 text-surface-foreground/80">{money(r.price)}</td>
                        <td className="py-2 pr-4 text-surface-foreground">
                          {r.suggestedPrice === null ? (
                            <span className="text-surface-foreground/50">{t("noSuggestion")}</span>
                          ) : (
                            <>
                              {money(r.suggestedPrice)} (−{r.suggestedPercentOff}%){r.cappedByMargin && <span className="ml-1 text-xs text-warning">{t("cappedByMargin")}</span>}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                    {dead.rows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-4 text-surface-foreground/50">
                          {t("noDeadStock")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
