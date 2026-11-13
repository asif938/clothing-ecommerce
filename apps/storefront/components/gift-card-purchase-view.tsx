"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Link } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import { giftCardOptions, purchaseGiftCard, type GiftCardOptions, type GiftCardPurchaseInput } from "../lib/rewards-api";

const inputClass = "w-full rounded-theme border border-border px-3 py-2 text-sm";

/** §7.3 `/gift-cards` — buy a digital gift card (§16 M16). Paid online; the code goes to the recipient by SMS/email once payment is confirmed. */
export function GiftCardPurchaseView() {
  const params = useParams<{ locale: string }>();
  const locale = (params.locale ?? "bn") === "en" ? "en" : "bn";
  const bn = locale === "bn";
  const [options, setOptions] = useState<GiftCardOptions | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState<GiftCardPurchaseInput["paymentMethod"] | null>(null);
  const [form, setForm] = useState({ purchaserName: "", purchaserPhone: "", purchaserEmail: "", recipientName: "", recipientPhone: "", recipientEmail: "", message: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    giftCardOptions()
      .then((o) => {
        setOptions(o);
        setAmount(o.presets[0] ?? null);
        setMethod((o.paymentMethods[0] as GiftCardPurchaseInput["paymentMethod"] | undefined) ?? null);
      })
      .catch(() => setLoadFailed(true));
  }, []);

  if (loadFailed) return <div className="mx-auto max-w-xl px-4 py-10 text-sm text-danger">{bn ? "লোড করা যায়নি।" : "Couldn't load."}</div>;
  if (!options) return <div className="mx-auto max-w-xl px-4 py-10">…</div>;
  if (!options.purchaseEnabled) {
    return <div className="mx-auto max-w-xl px-4 py-10 text-sm text-surface-foreground/70">{bn ? "এখন গিফট কার্ড বিক্রি হচ্ছে না।" : "Gift cards aren't on sale right now."}</div>;
  }

  const customPoisha = custom.trim() ? Math.round(Number.parseFloat(custom) * 100) : null;
  const chosen = custom.trim() ? customPoisha : amount;
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen || !method) return;
    setBusy(true);
    setError(null);
    try {
      const result = await purchaseGiftCard({
        amount: chosen,
        paymentMethod: method,
        purchaserName: form.purchaserName,
        purchaserPhone: form.purchaserPhone,
        purchaserEmail: form.purchaserEmail || undefined,
        recipientName: form.recipientName,
        recipientPhone: form.recipientPhone || undefined,
        recipientEmail: form.recipientEmail || undefined,
        message: form.message || undefined,
        locale,
      });
      window.location.href = result.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold text-surface-foreground">{bn ? "গিফট কার্ড" : "Gift cards"}</h1>
      <p className="mb-6 text-sm text-surface-foreground/70">
        {bn ? "প্রিয়জনকে পছন্দের পোশাক বেছে নেওয়ার সুযোগ দিন। কোডটি SMS বা ইমেইলে পাঠানো হবে।" : "Let someone choose what they love. The code is sent by SMS or email."}
        {options.expiryMonths > 0 && (bn ? ` মেয়াদ ${options.expiryMonths} মাস।` : ` Valid for ${options.expiryMonths} months.`)}
      </p>

      <form onSubmit={(e) => void submit(e)} className="space-y-6">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-surface-foreground">{bn ? "মূল্য" : "Amount"}</h2>
          <div className="flex flex-wrap gap-2">
            {options.presets.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => {
                  setAmount(p);
                  setCustom("");
                }}
                className={`rounded-theme border px-4 py-2 text-sm ${amount === p && !custom ? "border-brand bg-brand text-brand-foreground" : "border-border"}`}
              >
                {formatBdt(p)}
              </button>
            ))}
          </div>
          {options.allowCustom && (
            <input
              inputMode="numeric"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))}
              placeholder={bn ? `অন্য পরিমাণ (${formatBdt(options.minAmount)}–${formatBdt(options.maxAmount)})` : `Other amount (${formatBdt(options.minAmount)}–${formatBdt(options.maxAmount)})`}
              className={inputClass}
            />
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-surface-foreground">{bn ? "কাকে পাঠাবেন" : "Who it's for"}</h2>
          <input required value={form.recipientName} onChange={set("recipientName")} placeholder={bn ? "প্রাপকের নাম" : "Recipient's name"} className={inputClass} />
          <input value={form.recipientPhone} onChange={set("recipientPhone")} inputMode="tel" placeholder={bn ? "প্রাপকের মোবাইল নম্বর" : "Recipient's mobile number"} className={inputClass} />
          <input value={form.recipientEmail} onChange={set("recipientEmail")} type="email" placeholder={bn ? "প্রাপকের ইমেইল (ঐচ্ছিক)" : "Recipient's email (optional)"} className={inputClass} />
          <textarea value={form.message} onChange={set("message")} maxLength={300} rows={2} placeholder={bn ? "শুভেচ্ছা বার্তা (ঐচ্ছিক)" : "A message (optional)"} className={inputClass} />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-surface-foreground">{bn ? "আপনার তথ্য" : "Your details"}</h2>
          <input required value={form.purchaserName} onChange={set("purchaserName")} placeholder={bn ? "আপনার নাম" : "Your name"} className={inputClass} />
          <input required value={form.purchaserPhone} onChange={set("purchaserPhone")} inputMode="tel" placeholder={bn ? "আপনার মোবাইল নম্বর" : "Your mobile number"} className={inputClass} />
          <input value={form.purchaserEmail} onChange={set("purchaserEmail")} type="email" placeholder={bn ? "আপনার ইমেইল (ঐচ্ছিক)" : "Your email (optional)"} className={inputClass} />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-surface-foreground">{bn ? "পেমেন্ট" : "Payment"}</h2>
          {options.paymentMethods.length === 0 && <p className="text-sm text-danger">{bn ? "অনলাইন পেমেন্ট এখন উপলব্ধ নয়।" : "Online payment isn't available right now."}</p>}
          {options.paymentMethods.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m as GiftCardPurchaseInput["paymentMethod"])} />
              {m.toUpperCase()}
            </label>
          ))}
        </section>

        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={busy || !chosen || !method || (!form.recipientPhone && !form.recipientEmail)} className="w-full rounded-theme bg-brand px-6 py-3 text-sm font-medium text-brand-foreground disabled:opacity-60">
          {busy ? "…" : bn ? `${chosen ? formatBdt(chosen) : ""} পরিশোধ করুন` : `Pay ${chosen ? formatBdt(chosen) : ""}`}
        </button>
        <p className="text-center text-xs text-surface-foreground/60">
          <Link href="/account/credit" className="underline">
            {bn ? "গিফট কার্ডের ব্যালান্স দেখুন" : "Check a gift card balance"}
          </Link>
        </p>
      </form>
    </div>
  );
}
