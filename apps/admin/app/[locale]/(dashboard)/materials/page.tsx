"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "../../../../i18n/navigation";
import { api, ApiError } from "../../../../lib/api";
import { localized, money, parseTaka, type Localized } from "../../../../lib/format";
import { Banner, Button, Card, TextField } from "../../../../components/ui";
import { InventoryTabs } from "../../../../components/inventory-tabs";

interface Material {
  id: string;
  sku: string;
  name: Localized;
  unit: string;
  costPrice: number;
  onHand: number;
  reorderPoint: number;
  low: boolean;
  stockValue: number;
  isActive: boolean;
  bomLineCount: number;
  supplier: { id: string; name: string } | null;
}
interface ProductHit {
  id: string;
  title: Localized;
}

/** Raw materials and bills of materials (§8.2 Inventory, §16 M17). */
export default function MaterialsPage() {
  const t = useTranslations("materials");
  const locale = useLocale();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [lowOnly, setLowOnly] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [sku, setSku] = useState("");
  const [nameBn, setNameBn] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [unit, setUnit] = useState("");
  const [cost, setCost] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [opening, setOpening] = useState("");
  const [saving, setSaving] = useState(false);

  const [productQ, setProductQ] = useState("");
  const [products, setProducts] = useState<ProductHit[]>([]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (lowOnly) params.set("lowStock", "true");
    if (q.trim()) params.set("q", q.trim());
    try {
      setMaterials(await api.get<Material[]>(`/admin/materials?${params.toString()}`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [lowOnly, q]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload when the filters change.
    void load();
  }, [load]);

  useEffect(() => {
    const term = productQ.trim();
    if (term.length < 2) return;
    const handle = setTimeout(() => {
      api
        .get<{ data: ProductHit[] }>(`/admin/products?q=${encodeURIComponent(term)}&pageSize=8`)
        .then((r) => setProducts(r.data))
        .catch(() => setProducts([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [productQ]);

  async function create() {
    const costPoisha = cost.trim() === "" ? 0 : parseTaka(cost);
    if (costPoisha === null) {
      setError(t("costInvalid"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/admin/materials", {
        sku: sku.trim(),
        name: { bn: nameBn.trim(), en: nameEn.trim() },
        unit: unit.trim(),
        costPrice: costPoisha,
        reorderPoint: Number.parseInt(reorderPoint || "0", 10) || 0,
        openingQuantity: Number.parseInt(opening || "0", 10) || 0,
      });
      setSku("");
      setNameBn("");
      setNameEn("");
      setUnit("");
      setCost("");
      setReorderPoint("");
      setOpening("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const totalValue = materials.reduce((a, m) => a + m.stockValue, 0);

  return (
    <div className="flex flex-col gap-6">
      <InventoryTabs />
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium text-surface-foreground">{t("bomFinderTitle")}</h2>
        <p className="text-sm text-surface-foreground/60">{t("bomFinderHint")}</p>
        <TextField label={t("searchProduct")} value={productQ} onChange={(e) => setProductQ(e.target.value)} />
        {productQ.trim().length >= 2 && products.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {products.map((p) => (
              <li key={p.id}>
                <Link href={`/materials/bom/${p.id}`} className="text-brand hover:underline">
                  {localized(p.title, locale)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-medium text-surface-foreground">{t("newMaterial")}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <TextField label={t("sku")} value={sku} onChange={(e) => setSku(e.target.value)} />
          <TextField label={t("nameBn")} value={nameBn} onChange={(e) => setNameBn(e.target.value)} />
          <TextField label={t("nameEn")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          <TextField label={t("unit")} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="cm, g, pcs" />
          <TextField label={t("costPerUnit")} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          <TextField label={t("reorderPoint")} inputMode="numeric" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value.replace(/\D/g, ""))} />
          <TextField label={t("openingStock")} inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value.replace(/\D/g, ""))} />
        </div>
        <p className="text-xs text-surface-foreground/50">{t("unitHint")}</p>
        <div>
          <Button onClick={create} disabled={saving || !sku.trim() || !unit.trim() || (!nameBn.trim() && !nameEn.trim())}>
            {t("addMaterial")}
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <TextField label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 pb-2 text-sm text-surface-foreground">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          {t("lowOnly")}
        </label>
        <p className="pb-2 text-sm text-surface-foreground/60">{t("stockValue", { value: money(totalValue) })}</p>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("sku")}</th>
              <th className="py-2 pr-4">{t("name")}</th>
              <th className="py-2 pr-4">{t("onHand")}</th>
              <th className="py-2 pr-4">{t("costPerUnit")}</th>
              <th className="py-2 pr-4">{t("reorderPoint")}</th>
              <th className="py-2 pr-4">{t("usedIn")}</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.id} className={`border-b border-border last:border-b-0 ${m.isActive ? "" : "opacity-50"}`}>
                <td className="py-2 pr-4">
                  <Link href={`/materials/${m.id}`} className="text-brand hover:underline">
                    {m.sku}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-surface-foreground">{localized(m.name, locale)}</td>
                <td className={`py-2 pr-4 ${m.low ? "font-medium text-danger" : "text-surface-foreground/80"}`}>
                  {m.onHand.toLocaleString(locale)} {m.unit}
                  {m.low && <span className="ml-2 text-xs">{t("low")}</span>}
                </td>
                <td className="py-2 pr-4 text-surface-foreground/80">{(m.costPrice / 100).toLocaleString(locale, { maximumFractionDigits: 2 })} ৳/{m.unit}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{m.reorderPoint || "—"}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{t("bomLines", { count: m.bomLineCount })}</td>
              </tr>
            ))}
            {materials.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-surface-foreground/50">
                  {t("none")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
