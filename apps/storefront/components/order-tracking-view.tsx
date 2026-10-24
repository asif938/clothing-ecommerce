"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { formatBdt } from "../lib/money";
import { trackOrder, type TrackedOrder } from "../lib/orders-api";

/** §11.2 "orders: track by phone+number" — the no-account order lookup. */
export function OrderTrackingView() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "bn";
  const [phone, setPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleTrack() {
    setLoading(true);
    setError(null);
    try {
      setOrder(await trackOrder(phone, orderNumber));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order not found");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-surface-foreground">{locale === "bn" ? "অর্ডার ট্র্যাক করুন" : "Track your order"}</h1>
      <div className="space-y-3">
        <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder={locale === "bn" ? "অর্ডার নম্বর" : "Order number"} className="w-full rounded-theme border border-border px-3 py-2 text-sm" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={locale === "bn" ? "মোবাইল নম্বর" : "Mobile number"} className="w-full rounded-theme border border-border px-3 py-2 text-sm" />
        <button onClick={handleTrack} disabled={loading} className="w-full rounded-theme bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60">
          {locale === "bn" ? "খুঁজুন" : "Track"}
        </button>
      </div>
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      {order && (
        <div className="mt-6 rounded-theme border border-border p-4 text-sm">
          <p className="font-medium text-surface-foreground">{order.orderNumber}</p>
          <p className="mt-1 text-surface-foreground/70">{locale === "bn" ? "অবস্থা" : "Status"}: {order.status}</p>
          <p className="mt-1 text-surface-foreground/70">{locale === "bn" ? "মোট" : "Total"}: {formatBdt(order.total)}</p>
          {order.codAmount > 0 && <p className="mt-1 text-surface-foreground/70">{locale === "bn" ? "ডেলিভারিতে পরিশোধ" : "Pay on delivery"}: {formatBdt(order.codAmount)}</p>}
        </div>
      )}
    </div>
  );
}
