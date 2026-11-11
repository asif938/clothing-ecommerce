"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useRouter } from "../../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../../../components/ui";

interface OrderItem {
  id: string;
  sku: string;
  title: { en?: string; bn?: string };
  unitPrice: number;
  quantity: number;
}
interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  shippingFee: number;
  items: OrderItem[];
}

function money(poisha: number) {
  return `৳${(poisha / 100).toFixed(2)}`;
}

/**
 * Edit-before-ship (§6.8, §8.2). Scoped to item quantities + a shipping-fee
 * override — address/division-district-area editing would need the same
 * cascading location picker already built for checkout/shipping and isn't
 * duplicated here; the API supports it (`PATCH /admin/orders/:id` with an
 * `address` field) for a future pass. See docs/DECISIONS.md.
 */
export default function OrderEditPage() {
  const t = useTranslations("orders");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [shippingFeeOverride, setShippingFeeOverride] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    void api
      .get<OrderDetail>(`/admin/orders/${params.id}`)
      .then((o) => {
        setOrder(o);
        setQuantities(Object.fromEntries(o.items.map((i) => [i.id, i.quantity])));
        setShippingFeeOverride(String(o.shippingFee / 100));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load order"));
  }, []);

  async function save() {
    if (!order || !reason.trim()) return;
    setError(null);
    try {
      // Only send the shipping override when it actually changed: an unchanged fee is not an override, and overrides can need approval (M11).
      const newFee = Math.round(Number.parseFloat(shippingFeeOverride || "0") * 100);
      const result = await api.patch<{ approvalRequired?: boolean }>(`/admin/orders/${order.id}`, {
        items: order.items.map((item) => ({ orderItemId: item.id, quantity: quantities[item.id] ?? item.quantity })),
        ...(newFee !== order.shippingFee ? { shippingFeeOverride: newFee } : {}),
        reason,
      });
      if (result?.approvalRequired) {
        setNotice(t("approvalRequested"));
        return;
      }
      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  if (!order) {
    return (
      <div className="flex flex-col gap-4">
        {error && <Banner kind="error">{error}</Banner>}
        <p className="text-sm text-surface-foreground/50">…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("actions.edit")}: {order.orderNumber}</h1>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="info">{notice}</Banner>}

      <Card className="flex flex-col gap-3">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3">
            <span className="text-sm text-surface-foreground">{item.title.en ?? item.title.bn ?? item.sku} ({money(item.unitPrice)})</span>
            <input
              type="number"
              min={0}
              className="w-24 rounded-theme border border-border bg-surface px-2 py-1 text-sm"
              value={quantities[item.id] ?? item.quantity}
              onChange={(e) => setQuantities({ ...quantities, [item.id]: Number(e.target.value) })}
            />
          </div>
        ))}
        <TextField label={t("shippingFeeOverride")} value={shippingFeeOverride} onChange={(e) => setShippingFeeOverride(e.target.value)} />
        <TextField label={t("editReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={!reason.trim()}>{t("saveAndReprice")}</Button>
          <Button variant="secondary" onClick={() => router.push(`/orders/${order.id}`)}>{t("cancelEdit")}</Button>
        </div>
      </Card>
    </div>
  );
}
