"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useRouter } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import { me, orderDetail, type OrderDetail } from "../lib/account-api";
import { createReturnRequest, listReturnReasons, type ReturnReason } from "../lib/returns-api";

/** §6.10 "customer requests from account" — pick items, a reason, and a resolution type. */
export function AccountReturnRequestView() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "bn";
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") ?? "";
  const router = useRouter();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [reasons, setReasons] = useState<ReturnReason[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [type, setType] = useState<"refund" | "exchange" | "store_credit">("refund");
  const [reasonCode, setReasonCode] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    me().then((result) => {
      if (!result.loggedIn) {
        router.replace("/account/login");
        return;
      }
      orderDetail(orderId).then(setOrder).catch((err) => setError(err instanceof Error ? err.message : "Failed to load order"));
      listReturnReasons().then(setReasons).catch(() => undefined);
    });
  }, [orderId, router]);

  async function submit() {
    if (!order) return;
    const items = order.items.filter((item) => (quantities[item.id] ?? 0) > 0).map((item) => ({ orderItemId: item.id, quantity: quantities[item.id]! }));
    if (items.length === 0) {
      setError(locale === "bn" ? "অন্তত একটি পণ্য নির্বাচন করুন।" : "Select at least one item.");
      return;
    }
    setError(null);
    try {
      await createReturnRequest({ orderId: order.id, type, reasonCode: reasonCode || null, customerComment: comment || null, items });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request");
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-sm text-success">{locale === "bn" ? "আপনার রিটার্ন অনুরোধ জমা দেওয়া হয়েছে।" : "Your return request has been submitted."}</p>
        <button onClick={() => router.push("/account/returns")} className="mt-4 text-sm text-brand underline">
          {locale === "bn" ? "আমার রিটার্ন দেখুন" : "View my returns"}
        </button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        {error && <p className="text-sm text-danger">{error}</p>}
        {!error && <p className="text-sm text-surface-foreground/50">…</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-surface-foreground">{locale === "bn" ? "রিটার্ন অনুরোধ" : "Request a return"}</h1>
      <p className="mb-4 text-sm text-surface-foreground/70">{order.orderNumber}</p>

      <div className="mb-4 divide-y divide-border border-y border-border">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm">
            <div>
              <p className="text-surface-foreground">{item.title.en ?? item.title.bn ?? item.sku}</p>
              <p className="text-surface-foreground/60">{formatBdt(item.unitPrice)}</p>
            </div>
            <input
              type="number"
              min={0}
              max={item.quantity}
              value={quantities[item.id] ?? 0}
              onChange={(e) => setQuantities({ ...quantities, [item.id]: Math.min(item.quantity, Number(e.target.value)) })}
              className="w-16 rounded-theme border border-border px-2 py-1 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="rounded-theme border border-border px-3 py-2 text-sm">
          <option value="refund">{locale === "bn" ? "রিফান্ড" : "Refund"}</option>
          <option value="exchange">{locale === "bn" ? "এক্সচেঞ্জ" : "Exchange"}</option>
          <option value="store_credit">{locale === "bn" ? "স্টোর ক্রেডিট" : "Store credit"}</option>
        </select>
        <select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className="rounded-theme border border-border px-3 py-2 text-sm">
          <option value="">{locale === "bn" ? "কারণ নির্বাচন করুন" : "Select a reason"}</option>
          {reasons.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label.en ?? r.label.bn ?? r.code}
            </option>
          ))}
        </select>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={locale === "bn" ? "মন্তব্য (ঐচ্ছিক)" : "Comment (optional)"} className="rounded-theme border border-border px-3 py-2 text-sm" rows={3} />
      </div>

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      <button onClick={() => void submit()} className="w-full rounded-theme bg-brand px-4 py-2 text-sm font-medium text-brand-foreground">
        {locale === "bn" ? "জমা দিন" : "Submit request"}
      </button>
    </div>
  );
}
