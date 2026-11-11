"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatBdt } from "../lib/money";

interface ConfirmationInfo {
  orderNumber: string;
  state: "open" | "confirmed" | "cancelled" | "expired" | "closed";
  total: number;
  codAmount: number;
  items: { title: { en?: string; bn?: string }; quantity: number; lineTotal: number }[];
  canCancel: boolean;
}

async function callApi<T>(token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/store/order-confirmation/${encodeURIComponent(token)}`, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: { message?: string }; message?: string; code?: string }) | null;
  if (!response.ok) throw new Error(data?.error?.message ?? data?.message ?? "Request failed");
  return data as T;
}

const COPY = {
  bn: {
    title: "আপনার অর্ডার কনফার্ম করুন",
    order: "অর্ডার নম্বর",
    total: "মোট",
    cod: "ডেলিভারিতে পরিশোধ",
    confirm: "হ্যাঁ, অর্ডার কনফার্ম করুন",
    cancel: "অর্ডার বাতিল করুন",
    confirmed: "ধন্যবাদ! আপনার অর্ডার কনফার্ম হয়েছে।",
    cancelled: "অর্ডারটি বাতিল করা হয়েছে।",
    expired: "এই লিংকের মেয়াদ শেষ হয়ে গেছে। অনুগ্রহ করে আমাদের সাথে যোগাযোগ করুন।",
    closed: "এই অর্ডারটি আর এই লিংক থেকে পরিবর্তন করা যাবে না।",
    invalid: "লিংকটি সঠিক নয়।",
    loading: "লোড হচ্ছে…",
  },
  en: {
    title: "Confirm your order",
    order: "Order number",
    total: "Total",
    cod: "Pay on delivery",
    confirm: "Yes, confirm my order",
    cancel: "Cancel the order",
    confirmed: "Thank you! Your order is confirmed.",
    cancelled: "The order has been cancelled.",
    expired: "This link has expired. Please contact us.",
    closed: "This order can no longer be changed from this link.",
    invalid: "This link isn't valid.",
    loading: "Loading…",
  },
};

/** Customer self-confirmation page (docs/PROJECT_SPEC.md §6.8, §16 M11) - opened from the SMS/WhatsApp link. The token in the URL is the whole credential; all rules (expiry, whether cancelling is allowed) are enforced by the API. */
export function ConfirmOrderView() {
  const params = useParams<{ locale: string; token: string }>();
  const copy = COPY[params.locale === "en" ? "en" : "bn"];
  const [info, setInfo] = useState<ConfirmationInfo | null>(null);
  const [state, setState] = useState<ConfirmationInfo["state"] | "invalid" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = params.locale === "en" ? "en" : "bn";

  useEffect(() => {
    callApi<ConfirmationInfo>(params.token)
      .then((result) => {
        setInfo(result);
        setState(result.state);
      })
      .catch(() => setState("invalid"));
  }, [params.token]);

  async function respond(action: "confirm" | "cancel") {
    setBusy(true);
    setError(null);
    try {
      const result = await callApi<{ state: ConfirmationInfo["state"] }>(params.token, { method: "POST", body: JSON.stringify({ action }) });
      setState(result.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (state === null) return <p className="p-6 text-sm text-surface-foreground/70">{copy.loading}</p>;
  if (state === "invalid") return <p className="p-6 text-sm text-danger">{copy.invalid}</p>;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold text-surface-foreground">{copy.title}</h1>
      {info && (
        <div className="flex flex-col gap-2 rounded-theme border border-border p-4 text-sm text-surface-foreground">
          <div className="flex justify-between">
            <span>{copy.order}</span>
            <span className="font-medium">{info.orderNumber}</span>
          </div>
          {info.items.map((item, index) => (
            <div key={index} className="flex justify-between text-surface-foreground/80">
              <span>
                {item.title[locale] ?? item.title.bn ?? item.title.en} × {item.quantity}
              </span>
              <span>{formatBdt(item.lineTotal)}</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold">
            <span>{copy.total}</span>
            <span>{formatBdt(info.total)}</span>
          </div>
          {info.codAmount > 0 && (
            <div className="flex justify-between">
              <span>{copy.cod}</span>
              <span>{formatBdt(info.codAmount)}</span>
            </div>
          )}
        </div>
      )}

      {state === "open" && info && (
        <div className="flex flex-col gap-2">
          <button type="button" disabled={busy} onClick={() => void respond("confirm")} className="rounded-theme bg-brand px-4 py-3 text-sm font-medium text-brand-foreground disabled:opacity-50">
            {copy.confirm}
          </button>
          {info.canCancel && (
            <button type="button" disabled={busy} onClick={() => void respond("cancel")} className="rounded-theme border border-border px-4 py-3 text-sm text-surface-foreground disabled:opacity-50">
              {copy.cancel}
            </button>
          )}
        </div>
      )}
      {state === "confirmed" && <p className="text-sm text-success">{copy.confirmed}</p>}
      {state === "cancelled" && <p className="text-sm text-surface-foreground">{copy.cancelled}</p>}
      {state === "expired" && <p className="text-sm text-warning">{copy.expired}</p>}
      {state === "closed" && <p className="text-sm text-surface-foreground/70">{copy.closed}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
