"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../components/ui";

interface StockLocation {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
}
interface InventoryLevel {
  id: string;
  variantId: string;
  locationId: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number | null;
  variant: { sku: string; product: { title: { en?: string; bn?: string } } };
  location: { name: string };
}
interface BarcodeLabel {
  variantId: string;
  sku: string;
  barcode: string;
  title: { en?: string; bn?: string };
  price: number;
}

const REASONS = ["adjustment", "damage", "return_restock", "purchase_receive", "stock_take"] as const;

function BarcodePrintView({ labels, onClose }: { labels: BarcodeLabel[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-white p-8 text-black">
      <div className="mb-4 flex justify-end print:hidden">
        <button onClick={() => window.print()} className="mr-2 rounded bg-black px-3 py-1.5 text-sm text-white">
          Print
        </button>
        <button onClick={onClose} className="rounded bg-gray-200 px-3 py-1.5 text-sm">
          Close
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {labels.map((label) => (
          <div key={label.variantId} className="rounded border border-black p-3 text-center text-xs">
            <div className="font-semibold">{label.title.en}</div>
            <div className="my-2 font-mono text-base tracking-widest">{label.barcode}</div>
            <div>{label.sku}</div>
            <div>{(label.price / 100).toFixed(2)} BDT</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const t = useTranslations("inventory");
  const tCommon = useTranslations("common");
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [levels, setLevels] = useState<InventoryLevel[]>([]);
  const [lowStock, setLowStock] = useState<InventoryLevel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [locationName, setLocationName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<BarcodeLabel[] | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<InventoryLevel | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState<(typeof REASONS)[number]>("adjustment");

  async function load() {
    try {
      const [locs, lvls, low] = await Promise.all([
        api.get<StockLocation[]>("/admin/stock-locations"),
        api.get<InventoryLevel[]>("/admin/inventory"),
        api.get<InventoryLevel[]>("/admin/inventory/low-stock"),
      ]);
      setLocations(locs);
      setLevels(lvls);
      setLowStock(low);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load inventory");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function handleCreateLocation() {
    try {
      await api.post("/admin/stock-locations", { name: locationName, isDefault: locations.length === 0 });
      setLocationName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create location");
    }
  }

  async function handleAdjust() {
    if (!adjustTarget || !adjustQty) return;
    try {
      await api.post("/admin/inventory/adjust", { variantId: adjustTarget.variantId, locationId: adjustTarget.locationId, quantityDelta: Number(adjustQty), reason: adjustReason });
      setAdjustTarget(null);
      setAdjustQty("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to adjust stock");
    }
  }

  async function handlePrintLabels() {
    if (selected.size === 0) return;
    try {
      const result = await api.get<BarcodeLabel[]>(`/admin/inventory/barcode-labels?variantIds=${[...selected].join(",")}`);
      setLabels(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load labels");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("locationsTitle")}</h2>
        <ul className="flex flex-col gap-1">
          {locations.map((location) => (
            <li key={location.id} className="rounded-theme border border-border px-3 py-2 text-sm">
              {location.name} {location.isDefault && <span className="text-xs text-surface-foreground/50">({t("isDefault")})</span>}
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2">
          <TextField label={t("locationName")} value={locationName} onChange={(e) => setLocationName(e.target.value)} />
          <Button onClick={() => void handleCreateLocation()} disabled={!locationName}>
            {t("addLocation")}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-0">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-lg font-semibold text-surface-foreground">{t("levelsTitle")}</h2>
          <Button variant="secondary" onClick={() => void handlePrintLabels()} disabled={selected.size === 0}>
            {t("printLabels")}
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="px-4 py-2"></th>
              <th className="px-4 py-2">{t("locationsTitle")}</th>
              <th className="px-4 py-2">SKU</th>
              <th className="px-4 py-2">{t("onHand")}</th>
              <th className="px-4 py-2">{t("reserved")}</th>
              <th className="px-4 py-2">{t("available")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level) => (
              <tr key={level.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(level.variantId)}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(level.variantId);
                        else next.delete(level.variantId);
                        return next;
                      })
                    }
                  />
                </td>
                <td className="px-4 py-2">{level.location.name}</td>
                <td className="px-4 py-2">{level.variant.sku}</td>
                <td className="px-4 py-2">{level.onHand}</td>
                <td className="px-4 py-2">{level.reserved}</td>
                <td className="px-4 py-2">{level.available}</td>
                <td className="px-4 py-2">
                  <button onClick={() => setAdjustTarget(level)} className="text-xs text-brand">
                    {t("adjust")}
                  </button>
                </td>
              </tr>
            ))}
            {levels.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={7}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {adjustTarget && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-surface-foreground">
            {t("adjust")}: {adjustTarget.variant.sku}
          </h2>
          <div className="flex flex-wrap items-end gap-2">
            <TextField label={t("adjustQuantity")} type="number" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-surface-foreground">{t("adjustReason")}</span>
              <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value as (typeof REASONS)[number])}>
                {REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={() => void handleAdjust()}>{tCommon("save")}</Button>
            <Button variant="secondary" onClick={() => setAdjustTarget(null)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("lowStockTitle")}</h2>
        <ul className="flex flex-col gap-1">
          {lowStock.map((level) => (
            <li key={level.id} className="rounded-theme border border-danger/30 bg-danger/5 px-3 py-2 text-sm">
              {level.variant.sku} — {level.available} {t("available").toLowerCase()}
            </li>
          ))}
          {lowStock.length === 0 && <li className="text-sm text-surface-foreground/50">—</li>}
        </ul>
      </Card>

      {labels && <BarcodePrintView labels={labels} onClose={() => setLabels(null)} />}
    </div>
  );
}
