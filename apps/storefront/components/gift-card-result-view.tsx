"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Link } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import { giftCardPurchaseStatus, type GiftCardPurchaseStatus } from "../lib/rewards-api";

const POLL_MS = 3000;
const MAX_POLLS = 20;

/** Where the payment gateway sends the buyer back (§16 M16). Polls until the purchase settles; never shows the code — that goes to the recipient. */
export function GiftCardResultView() {
  const params = useParams<{ locale: string }>();
  const search = useSearchParams();
  const bn = (params.locale ?? "bn") === "bn";
  const token = search.get("token") ?? "";
  const [status, setStatus] = useState<GiftCardPurchaseStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      giftCardPurchaseStatus(token)
        .then((s) => {
          setStatus(s);
          polls += 1;
          if (s.status === "pending" && polls < MAX_POLLS) timer = setTimeout(tick, POLL_MS);
        })
        .catch(() => setError(true));
    };
    tick();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [token]);

  if (!token || error) return <div className="mx-auto max-w-xl px-4 py-10 text-sm text-danger">{bn ? "কেনাকাটার তথ্য পাওয়া যায়নি।" : "We couldn't find this purchase."}</div>;
  if (!status) return <div className="mx-auto max-w-xl px-4 py-10">…</div>;

  const paid = status.status === "active" || status.status === "redeemed";
  return (
    <div className="mx-auto max-w-xl px-4 py-10 text-center">
      {paid ? (
        <>
          <h1 className="mb-2 text-2xl font-semibold text-surface-foreground">{bn ? "ধন্যবাদ!" : "Thank you!"}</h1>
          <p className="text-sm text-surface-foreground/80">
            {bn
              ? `${formatBdt(status.amount)} এর গিফট কার্ড (••${status.last4 ?? ""}) ${status.recipientName ?? ""} এর কাছে ${status.sentTo ?? ""} এ পাঠানো হচ্ছে।`
              : `Your ${formatBdt(status.amount)} gift card (••${status.last4 ?? ""}) is on its way to ${status.recipientName ?? ""} at ${status.sentTo ?? ""}.`}
          </p>
        </>
      ) : status.status === "pending" ? (
        <>
          <h1 className="mb-2 text-2xl font-semibold text-surface-foreground">{bn ? "পেমেন্ট যাচাই হচ্ছে…" : "Confirming your payment…"}</h1>
          <p className="text-sm text-surface-foreground/70">{bn ? "এই পাতা খোলা রাখুন। কিছুক্ষণ পর নিজেই আপডেট হবে।" : "Keep this page open — it updates by itself."}</p>
        </>
      ) : (
        <>
          <h1 className="mb-2 text-2xl font-semibold text-surface-foreground">{bn ? "পেমেন্ট সম্পন্ন হয়নি" : "Payment didn't go through"}</h1>
          <p className="mb-4 text-sm text-surface-foreground/70">{bn ? "আপনার কাছ থেকে কোনো টাকা কাটা হয়ে থাকলে আমাদের সাথে যোগাযোগ করুন।" : "If you were charged, please contact us."}</p>
          <Link href="/gift-cards" className="rounded-theme bg-brand px-6 py-3 text-sm text-brand-foreground">
            {bn ? "আবার চেষ্টা করুন" : "Try again"}
          </Link>
        </>
      )}
    </div>
  );
}
