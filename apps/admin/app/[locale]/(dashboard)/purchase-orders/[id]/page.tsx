"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { localized, money, shortDate } from "../../../../../lib/format";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";

interface PoItem {
  id: string;
  variantId: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  variant: { sku: string; barcode: string | null; product: { title: { bn?: string; en?: string } } };
}

interface PurchaseOrder {
  id: string;
  number: string;
  type: "purchase" | "production";
  status: "draft" | "sent" | "partially_received" | "received" | "cancelled";
  totalCost: number;
  notes: string | null;
  expectedAt: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  supplier: { name: string };
  location: { name: string };
  items: PoItem[];
}

/** One purchase/production order: send, receive (full or partial), cancel (docs/PROJECT_SPEC.md §16 M12). */
export default function PurchaseOrderDetailPage() {
  const t = useTranslations("procurement");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [allowOver, setAllowOver] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<PurchaseOrder>(`/admin/purchase-orders/${params.id}`);
      setPo(data);
      setReceiveQty(Object.fromEntries(data.items.map((i) => [i.variantId, String(Math.max(0, i.qtyOrdered - i.qtyReceived))])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [params.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  async function act(action: "send" | "cancel") {
    if (action === "cancel" && !window.confirm(t("cancelPoConfirm"))) return;
    setError(null);
    try {
      setPo(await api.post<PurchaseOrder>(`/admin/purchase-orders/${params.id}/${action}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    }
  }

  async function removeDraft() {
    if (!window.confirm(t("deletePoConfirm"))) return;
    try {
      await api.delete(`/admin/purchase-orders/${params.id}`);
      router.push("/purchase-orders");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function receive() {
    const lines = Object.entries(receiveQty)
      .map(([variantId, qty]) => ({ variantId, quantity: Number.parseInt(qty || "0", 10) }))
      .filter((l) => Number.isFinite(l.quantity) && l.quantity > 0);
    if (lines.length === 0) return;
    setError(null);
    setNotice(null);
    try {
      await api.post(`/admin/purchase-orders/${params.id}/receive`, { lines, allowOverReceipt: allowOver, note: note || null });
      setNote("");
      setNotice(t("received", { units: lines.reduce((a, l) => a + l.quantity, 0) }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Receive failed");
    }
  }

  if (!po) return error ? <Banner kind="error">{error}</Banner> : <p className="text-sm text-surface-foreground/60">{tCommon("loading")}</p>;
  const receivable = po.status === "sent" || po.status === "partially_received";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/purchase-orders" className="text-sm text-brand hover:underline">
        ← {t("poTitle")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-mono text-2xl font-semibold text-surface-foreground">{po.number}</h1>
          <p className="text-sm text-surface-foreground/60">
            {t(`type_${po.type}`)} · {po.supplier.name} → {po.location.name} · {t(`status_${po.status}`)}
          </p>
          <p className="text-xs text-surface-foreground/50">
            {t("expectedAt")}: {shortDate(po.expectedAt)} · {t("sentAt")}: {shortDate(po.sentAt)} · {t("receivedAt")}: {shortDate(po.receivedAt)}
          </p>
          {po.notes && <p className="mt-1 text-sm text-surface-foreground/80">{po.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {po.status === "draft" && <Button onClick={() => void act("send")}>{t("markSent")}</Button>}
          {po.status === "draft" && (
            <Button variant="danger" onClick={() => void removeDraft()}>
              {tCommon("delete")}
            </Button>
          )}
          {(po.status === "draft" || receivable) && (
            <Button variant="secondary" onClick={() => void act("cancel")}>
              {po.status === "partially_received" ? t("closeShort") : t("cancelPo")}
            </Button>
          )}
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}
      {po.status === "draft" && <Banner kind="info">{t("draftHint")}</Banner>}

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("product")}</th>
              <th className="py-2 pr-4">SKU</th>
              <th className="py-2 pr-4">{t("ordered")}</th>
              <th className="py-2 pr-4">{t("receivedCol")}</th>
              <th className="py-2 pr-4">{t("unitCost")}</th>
              <th className="py-2 pr-4">{t("lineTotal")}</th>
              {receivable && <th className="py-2 pr-4">{t("receiveNow")}</th>}
            </tr>
          </thead>
          <tbody>
            {po.items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-4 text-surface-foreground">{localized(item.variant.product.title, locale)}</td>
                <td className="py-2 pr-4 font-mono text-surface-foreground/80">{item.variant.sku}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{item.qtyOrdered}</td>
                <td className={`py-2 pr-4 ${item.qtyReceived >= item.qtyOrdered ? "text-success" : "text-surface-foreground/80"}`}>{item.qtyReceived}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(item.unitCost)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(item.unitCost * item.qtyOrdered)}</td>
                {receivable && (
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={0}
                      value={receiveQty[item.variantId] ?? ""}
                      onChange={(e) => setReceiveQty({ ...receiveQty, [item.variantId]: e.target.value })}
                      className="w-24 rounded-theme border border-border bg-surface px-2 py-1 text-sm text-surface-foreground"
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-right text-sm font-medium text-surface-foreground">
          {t("totalCost")}: {money(po.totalCost)}
        </p>
      </Card>

      {receivable && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium text-surface-foreground">{t("receiveGoods")}</h2>
          <p className="text-sm text-surface-foreground/60">{t("receiveHint")}</p>
          <TextField label={t("receiptNote")} value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-surface-foreground">
            <input type="checkbox" checked={allowOver} onChange={(e) => setAllowOver(e.target.checked)} />
            {t("allowOverReceipt")}
          </label>
          <div>
            <Button onClick={() => void receive()}>{t("receiveNow")}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
