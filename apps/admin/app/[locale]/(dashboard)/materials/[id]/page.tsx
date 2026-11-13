"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { localized, parseTaka, takaInput, type Localized } from "../../../../../lib/format";
import { Banner, Button, Card, TextField, Toggle } from "../../../../../components/ui";
import { InventoryTabs } from "../../../../../components/inventory-tabs";

interface MaterialDetail {
  id: string;
  sku: string;
  name: Localized;
  unit: string;
  costPrice: number;
  onHand: number;
  reorderPoint: number;
  isActive: boolean;
  notes: string | null;
  supplier: { id: string; name: string } | null;
  movements: { id: string; delta: number; onHandAfter: number; unitCost: number | null; reason: string; note: string | null; createdAt: string }[];
  bomItems: { id: string; quantity: number; wastagePercent: number; product: { id: string; title: Localized }; variant: { id: string; sku: string } | null }[];
}

/** One material: stock ledger, receiving, adjustments and where it is used (§16 M17). */
export default function MaterialDetailPage() {
  const t = useTranslations("materials");
  const locale = useLocale();
  const { id } = useParams<{ id: string }>();
  const [material, setMaterial] = useState<MaterialDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [nameBn, setNameBn] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [cost, setCost] = useState("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [receiveQty, setReceiveQty] = useState("");
  const [receiveCost, setReceiveCost] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  const load = useCallback(async () => {
    try {
      const m = await api.get<MaterialDetail>(`/admin/materials/${id}`);
      setMaterial(m);
      const name = m.name as { bn?: string; en?: string } | null;
      setNameBn(name?.bn ?? "");
      setNameEn(name?.en ?? "");
      setCost(takaInput(m.costPrice));
      setReorderPoint(String(m.reorderPoint));
      setReceiveCost(takaInput(m.costPrice));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load.
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, done: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  if (!material) return <div className="text-sm text-surface-foreground/60">{error ?? "…"}</div>;

  const save = () => {
    const costPoisha = parseTaka(cost || "0");
    if (costPoisha === null) return setError(t("costInvalid"));
    return run(() => api.patch(`/admin/materials/${id}`, { name: { bn: nameBn.trim(), en: nameEn.trim() }, costPrice: costPoisha, reorderPoint: Number.parseInt(reorderPoint || "0", 10) || 0 }), t("saved"));
  };
  const receive = () => {
    const unitCost = parseTaka(receiveCost || "0");
    const quantity = Number.parseInt(receiveQty || "0", 10);
    if (unitCost === null || quantity <= 0) return setError(t("receiveInvalid"));
    return run(async () => {
      await api.post(`/admin/materials/${id}/receive`, { quantity, unitCost });
      setReceiveQty("");
    }, t("received"));
  };
  const adjust = () => {
    const delta = Number.parseInt(adjustDelta, 10);
    if (!Number.isFinite(delta) || delta === 0 || !adjustNote.trim()) return setError(t("adjustInvalid"));
    return run(async () => {
      await api.post(`/admin/materials/${id}/adjust`, { delta, note: adjustNote.trim() });
      setAdjustDelta("");
      setAdjustNote("");
    }, t("adjusted"));
  };

  return (
    <div className="flex flex-col gap-6">
      <InventoryTabs />
      <div className="flex items-center justify-between">
        <div>
          <Link href="/materials" className="text-sm text-brand hover:underline">
            ← {t("title")}
          </Link>
          <h1 className="text-2xl font-semibold text-surface-foreground">
            {material.sku} — {localized(material.name, locale)}
          </h1>
          <p className="text-sm text-surface-foreground/60">{t("onHandLine", { qty: material.onHand.toLocaleString(locale), unit: material.unit })}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-surface-foreground">
          {t("active")}
          <Toggle checked={material.isActive} onChange={(v) => run(() => api.patch(`/admin/materials/${id}`, { isActive: v }), t("saved"))} />
        </label>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium text-surface-foreground">{t("details")}</h2>
          <TextField label={t("nameBn")} value={nameBn} onChange={(e) => setNameBn(e.target.value)} />
          <TextField label={t("nameEn")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          <TextField label={t("costPerUnit")} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
          <TextField label={t("reorderPoint")} inputMode="numeric" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value.replace(/\D/g, ""))} />
          <div>
            <Button onClick={save}>{t("save")}</Button>
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium text-surface-foreground">{t("receive")}</h2>
          <TextField label={t("quantity", { unit: material.unit })} inputMode="numeric" value={receiveQty} onChange={(e) => setReceiveQty(e.target.value.replace(/\D/g, ""))} />
          <TextField label={t("unitCost")} inputMode="decimal" value={receiveCost} onChange={(e) => setReceiveCost(e.target.value)} />
          <p className="text-xs text-surface-foreground/50">{t("receiveHint")}</p>
          <div>
            <Button onClick={receive}>{t("receive")}</Button>
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium text-surface-foreground">{t("adjust")}</h2>
          <TextField label={t("adjustDelta", { unit: material.unit })} inputMode="numeric" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value.replace(/[^\d-]/g, ""))} placeholder="-50" />
          <TextField label={t("reason")} value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} />
          <div>
            <Button variant="secondary" onClick={adjust}>
              {t("adjust")}
            </Button>
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-2">
        <h2 className="font-medium text-surface-foreground">{t("usedInTitle")}</h2>
        {material.bomItems.length === 0 && <p className="text-sm text-surface-foreground/50">{t("notUsed")}</p>}
        {material.bomItems.map((b) => (
          <p key={b.id} className="text-sm text-surface-foreground/80">
            <Link href={`/materials/bom/${b.product.id}`} className="text-brand hover:underline">
              {localized(b.product.title, locale)}
            </Link>
            {b.variant ? ` (${b.variant.sku})` : ""} — {b.quantity.toLocaleString(locale)} {material.unit}
            {b.wastagePercent > 0 ? ` + ${b.wastagePercent}%` : ""}
          </p>
        ))}
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="mb-3 font-medium text-surface-foreground">{t("ledger")}</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("when")}</th>
              <th className="py-2 pr-4">{t("reasonLabel")}</th>
              <th className="py-2 pr-4">{t("change")}</th>
              <th className="py-2 pr-4">{t("balance")}</th>
              <th className="py-2 pr-4">{t("note")}</th>
            </tr>
          </thead>
          <tbody>
            {material.movements.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-4 text-surface-foreground/80">{new Date(m.createdAt).toLocaleString(locale)}</td>
                <td className="py-2 pr-4 text-surface-foreground">{t(`reason_${m.reason}`)}</td>
                <td className={`py-2 pr-4 font-medium ${m.delta < 0 ? "text-danger" : "text-success"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{m.onHandAfter}</td>
                <td className="py-2 pr-4 text-surface-foreground/70">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
