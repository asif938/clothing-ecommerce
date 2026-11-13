"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "../../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../../lib/api";
import { localized, money, type Localized } from "../../../../../../lib/format";
import { Banner, Button, Card } from "../../../../../../components/ui";
import { InventoryTabs } from "../../../../../../components/inventory-tabs";

interface MaterialOption {
  id: string;
  sku: string;
  name: Localized;
  unit: string;
}
interface Bom {
  product: { id: string; title: Localized };
  lines: { materialId: string; variantId: string | null; quantity: number; wastagePercent: number; note: string | null; material: MaterialOption & { costPrice: number; onHand: number } }[];
  variants: { variantId: string; sku: string; isActive: boolean; costPrice: number | null; materialCost: number; hasBom: boolean }[];
}
interface Line {
  key: string;
  materialId: string;
  variantId: string;
  quantity: string;
  wastage: string;
}

let counter = 0;
const newKey = () => `line-${++counter}`;

/** Bill of materials of one product: product-wide lines, with optional per-variant overrides (§16 M17). */
export default function BomEditorPage() {
  const t = useTranslations("materials");
  const locale = useLocale();
  const { productId } = useParams<{ productId: string }>();
  const [bom, setBom] = useState<Bom | null>(null);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, m] = await Promise.all([api.get<Bom>(`/admin/materials/bom/products/${productId}`), api.get<MaterialOption[]>("/admin/materials")]);
      setBom(b);
      setMaterials(m);
      setLines(b.lines.map((l) => ({ key: newKey(), materialId: l.materialId, variantId: l.variantId ?? "", quantity: String(l.quantity), wastage: String(l.wastagePercent) })));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [productId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load.
    void load();
  }, [load]);

  const patch = (key: string, change: Partial<Line>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...change } : l)));

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = lines.map((l) => ({ materialId: l.materialId, variantId: l.variantId || null, quantity: Number.parseInt(l.quantity || "0", 10), wastagePercent: Number.parseInt(l.wastage || "0", 10) || 0 }));
      if (payload.some((l) => !l.materialId || !(l.quantity > 0))) {
        setError(t("bomInvalid"));
        return;
      }
      await api.put(`/admin/materials/bom/products/${productId}`, { lines: payload });
      setNotice(t("saved"));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!bom) return <div className="text-sm text-surface-foreground/60">{error ?? "…"}</div>;
  const unitOf = (id: string) => materials.find((m) => m.id === id)?.unit ?? "";

  return (
    <div className="flex flex-col gap-6">
      <InventoryTabs />
      <div>
        <Link href="/materials" className="text-sm text-brand hover:underline">
          ← {t("title")}
        </Link>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("bomTitle", { product: localized(bom.product.title, locale) })}</h1>
        <p className="text-sm text-surface-foreground/60">{t("bomSubtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      <Card className="flex flex-col gap-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("material")}</th>
              <th className="py-2 pr-4">{t("appliesTo")}</th>
              <th className="py-2 pr-4">{t("perUnit")}</th>
              <th className="py-2 pr-4">{t("wastage")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-4">
                  <select value={l.materialId} onChange={(e) => patch(l.key, { materialId: e.target.value })} className="rounded-theme border border-border bg-surface px-2 py-1 text-sm text-surface-foreground">
                    <option value="">{t("chooseMaterial")}</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.sku} — {localized(m.name, locale)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-4">
                  <select value={l.variantId} onChange={(e) => patch(l.key, { variantId: e.target.value })} className="rounded-theme border border-border bg-surface px-2 py-1 text-sm text-surface-foreground">
                    <option value="">{t("allVariants")}</option>
                    {bom.variants.map((v) => (
                      <option key={v.variantId} value={v.variantId}>
                        {v.sku}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-4">
                  <input inputMode="numeric" value={l.quantity} onChange={(e) => patch(l.key, { quantity: e.target.value.replace(/\D/g, "") })} className="w-24 rounded-theme border border-border bg-surface px-2 py-1 text-sm text-surface-foreground" /> {unitOf(l.materialId)}
                </td>
                <td className="py-2 pr-4">
                  <input inputMode="numeric" value={l.wastage} onChange={(e) => patch(l.key, { wastage: e.target.value.replace(/\D/g, "") })} className="w-16 rounded-theme border border-border bg-surface px-2 py-1 text-sm text-surface-foreground" /> %
                </td>
                <td className="py-2">
                  <button onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} className="text-danger hover:underline">
                    {t("remove")}
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-surface-foreground/50">
                  {t("bomEmpty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setLines((prev) => [...prev, { key: newKey(), materialId: "", variantId: "", quantity: "", wastage: "0" }])}>
            {t("addLine")}
          </Button>
          <Button onClick={save} disabled={saving}>
            {t("saveBom")}
          </Button>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="mb-3 font-medium text-surface-foreground">{t("variantCosts")}</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("variant")}</th>
              <th className="py-2 pr-4">{t("materialCost")}</th>
              <th className="py-2 pr-4">{t("recordedCost")}</th>
            </tr>
          </thead>
          <tbody>
            {bom.variants.map((v) => (
              <tr key={v.variantId} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-4 text-surface-foreground">
                  {v.sku} {!v.hasBom && <span className="text-xs text-warning">{t("noBom")}</span>}
                </td>
                <td className="py-2 pr-4 text-surface-foreground/80">{v.hasBom ? money(v.materialCost) : "—"}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(v.costPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-surface-foreground/50">{t("variantCostsHint")}</p>
      </Card>
    </div>
  );
}
