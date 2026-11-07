"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { formatBdt } from "../lib/money";
import { trackOrder, type TrackedOrder } from "../lib/orders-api";
import { createReturnRequestByTracking } from "../lib/returns-api";

const RETURN_ELIGIBLE_STATUSES = new Set(["delivered", "partially_delivered", "completed"]);

/** §11.2 "orders: track by phone+number" — the no-account order lookup. */
export function OrderTrackingView() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "bn";
  const [phone, setPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnType, setReturnType] = useState<"refund" | "exchange" | "store_credit">("refund");
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnSubmitted, setReturnSubmitted] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

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

  /** §16 M10 self-service exchange portal — the guest path, re-verified server-side against the same phone+order-number pair used to look this order up. */
  async function submitReturnRequest() {
    if (!order) return;
    const items = order.items.filter((item) => (returnQuantities[item.id] ?? 0) > 0).map((item) => ({ orderItemId: item.id, quantity: returnQuantities[item.id]! }));
    if (items.length === 0) {
      setReturnError(locale === "bn" ? "অন্তত একটি পণ্য নির্বাচন করুন।" : "Select at least one item.");
      return;
    }
    setReturnError(null);
    try {
      await createReturnRequestByTracking({ phone, orderNumber, type: returnType, reasonCode: null, customerComment: null, items });
      setReturnSubmitted(true);
    } catch (err) {
      setReturnError(err instanceof Error ? err.message : "Failed to submit request");
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
          {order.shipments.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              {order.shipments.map((shipment) => (
                <div key={shipment.id} className="mb-2">
                  <p className="text-surface-foreground">
                    {locale === "bn" ? "কুরিয়ার" : "Courier"}: {shipment.courierDriver}
                    {shipment.trackingCode ? ` · ${shipment.trackingCode}` : ""}
                  </p>
                  <p className="text-surface-foreground/70">{locale === "bn" ? "শিপমেন্ট অবস্থা" : "Shipment status"}: {shipment.status}</p>
                  {shipment.trackingUrl && (
                    <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="text-brand underline">
                      {locale === "bn" ? "লাইভ ট্র্যাকিং দেখুন" : "View live tracking"}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {RETURN_ELIGIBLE_STATUSES.has(order.status) && (
            <div className="mt-4 border-t border-border pt-3">
              {returnSubmitted ? (
                <p className="text-sm text-success">{locale === "bn" ? "আপনার রিটার্ন/এক্সচেঞ্জ অনুরোধ জমা দেওয়া হয়েছে।" : "Your return/exchange request has been submitted."}</p>
              ) : !showReturnForm ? (
                <button onClick={() => setShowReturnForm(true)} className="text-xs text-brand underline">
                  {locale === "bn" ? "রিটার্ন বা এক্সচেঞ্জ অনুরোধ করুন" : "Request a return or exchange"}
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="divide-y divide-border border-y border-border">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="text-surface-foreground">{item.title.en ?? item.title.bn ?? item.sku}</span>
                        <input
                          type="number"
                          min={0}
                          max={item.quantity}
                          value={returnQuantities[item.id] ?? 0}
                          onChange={(e) => setReturnQuantities({ ...returnQuantities, [item.id]: Math.min(item.quantity, Number(e.target.value)) })}
                          className="w-16 rounded-theme border border-border px-2 py-1 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <select value={returnType} onChange={(e) => setReturnType(e.target.value as typeof returnType)} className="rounded-theme border border-border px-3 py-2 text-sm">
                    <option value="refund">{locale === "bn" ? "রিফান্ড" : "Refund"}</option>
                    <option value="exchange">{locale === "bn" ? "এক্সচেঞ্জ" : "Exchange"}</option>
                    <option value="store_credit">{locale === "bn" ? "স্টোর ক্রেডিট" : "Store credit"}</option>
                  </select>
                  {returnError && <p className="text-sm text-danger">{returnError}</p>}
                  <button onClick={() => void submitReturnRequest()} className="w-fit rounded-theme bg-brand px-4 py-2 text-sm font-medium text-brand-foreground">
                    {locale === "bn" ? "জমা দিন" : "Submit request"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
