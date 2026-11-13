"use client";

import { useEffect, useState } from "react";
import { formatBdt } from "../lib/money";
import { setCartGiftCard, setCartReferral, setCartStoreCredit, type CartPricing, type CartResponse } from "../lib/cart-api";
import { giftCardOptions } from "../lib/rewards-api";

const REFERRAL_REASONS: Record<string, { bn: string; en: string }> = {
  NOT_FIRST_ORDER: { bn: "রেফারেল ছাড় শুধু প্রথম অর্ডারে।", en: "The referral discount is only for a first order." },
  ALREADY_REFERRED: { bn: "এই নম্বরে আগেই রেফারেল ব্যবহার হয়েছে।", en: "This phone number has already used a referral." },
  SELF_REFERRAL: { bn: "নিজের রেফারেল কোড ব্যবহার করা যায় না।", en: "You can't use your own referral code." },
  COUPON_IN_USE: { bn: "কুপনের সাথে রেফারেল ছাড় একসাথে হয় না।", en: "The referral discount can't be combined with a coupon." },
  BELOW_MINIMUM: { bn: "রেফারেল ছাড় পেতে আরও কিছু যোগ করুন।", en: "Add a little more to get the referral discount." },
};

/**
 * §16 M16 checkout block: the friend's referral discount, a gift card code and
 * the store credit wallet. Every change goes to the server, which re-prices
 * the cart (golden rule 6) — this only shows what came back.
 */
export function CheckoutCredits({ pricing, locale, onCart }: { pricing: CartPricing; locale: string; onCart: (cart: CartResponse) => void }) {
  const bn = locale === "bn";
  const [giftCardsOn, setGiftCardsOn] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    giftCardOptions()
      .then((o) => setGiftCardsOn(o.enabled))
      .catch(() => undefined);
  }, []);

  async function run(action: () => Promise<CartResponse>) {
    setBusy(true);
    setError(null);
    try {
      onCart(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const { referral, giftCard, storeCredit } = pricing;
  const showStoreCredit = storeCredit !== null && storeCredit.balance > 0;
  if (!referral && !giftCardsOn && !giftCard && !showStoreCredit) return null;

  return (
    <section className="mb-6 space-y-3 rounded-theme border border-border p-3 text-sm">
      {referral && (
        <div className="flex items-start justify-between gap-2">
          <div>
            {referral.rejection ? (
              <p className="text-surface-foreground/70">{(bn ? REFERRAL_REASONS[referral.rejection]?.bn : REFERRAL_REASONS[referral.rejection]?.en) ?? (bn ? "রেফারেল কোডটি বৈধ নয়।" : "That referral code isn't valid.")}</p>
            ) : (
              <p className="text-success">
                {bn
                  ? `${referral.referrerName ?? "আপনার বন্ধু"} এর রেফারেলে প্রথম অর্ডারে ${formatBdt(referral.discount)} ছাড়`
                  : `${formatBdt(referral.discount)} off your first order, from ${referral.referrerName ?? "your friend"}'s referral`}
              </p>
            )}
          </div>
          <button type="button" disabled={busy} onClick={() => void run(() => setCartReferral(null))} className="shrink-0 text-xs text-surface-foreground/60 underline">
            {bn ? "সরান" : "Remove"}
          </button>
        </div>
      )}

      {giftCard ? (
        <div className="flex items-start justify-between gap-2">
          <p className={giftCard.rejection ? "text-danger" : ""}>
            {bn ? `গিফট কার্ড ••${giftCard.last4}` : `Gift card ••${giftCard.last4}`}
            {giftCard.rejection
              ? bn
                ? " — ব্যবহার করা যাচ্ছে না"
                : " — can't be used"
              : bn
                ? ` — ${formatBdt(giftCard.applied)} ব্যবহার হচ্ছে (ব্যালান্স ${formatBdt(giftCard.balance)})`
                : ` — using ${formatBdt(giftCard.applied)} (balance ${formatBdt(giftCard.balance)})`}
          </p>
          <button type="button" disabled={busy} onClick={() => void run(() => setCartGiftCard(null))} className="shrink-0 text-xs text-surface-foreground/60 underline">
            {bn ? "সরান" : "Remove"}
          </button>
        </div>
      ) : (
        giftCardsOn && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) void run(() => setCartGiftCard(code.trim())).then(() => setCode(""));
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={bn ? "গিফট কার্ড কোড" : "Gift card code"}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-theme border border-border px-3 py-2 uppercase"
            />
            <button type="submit" disabled={busy || !code.trim()} className="rounded-theme border border-brand px-3 py-2 text-brand disabled:opacity-60">
              {bn ? "প্রয়োগ" : "Apply"}
            </button>
          </form>
        )
      )}

      {showStoreCredit && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={storeCredit.use} disabled={busy} onChange={(e) => void run(() => setCartStoreCredit(e.target.checked))} />
          {bn ? `স্টোর ক্রেডিট ব্যবহার করুন (ব্যালান্স ${formatBdt(storeCredit.balance)})` : `Use store credit (balance ${formatBdt(storeCredit.balance)})`}
        </label>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}

/** Totals rows for the M16 lines — rendered inside the checkout summary. */
export function CreditTotals({ pricing, locale }: { pricing: CartPricing; locale: string }) {
  const bn = locale === "bn";
  const referralDiscount = pricing.referral && !pricing.referral.rejection ? pricing.referral.discount : 0;
  const giftCard = pricing.giftCard?.applied ?? 0;
  const storeCredit = pricing.storeCredit?.applied ?? 0;
  return (
    <>
      {referralDiscount > 0 && (
        <div className="flex justify-between">
          <span>{bn ? "রেফারেল ছাড়" : "Referral discount"}</span>
          <span>−{formatBdt(referralDiscount)}</span>
        </div>
      )}
      {(giftCard > 0 || storeCredit > 0) && (
        <>
          <div className="flex justify-between font-semibold text-surface-foreground">
            <span>{bn ? "সর্বমোট" : "Total"}</span>
            <span>{formatBdt(pricing.total)}</span>
          </div>
          {giftCard > 0 && (
            <div className="flex justify-between">
              <span>{bn ? "গিফট কার্ড" : "Gift card"}</span>
              <span>−{formatBdt(giftCard)}</span>
            </div>
          )}
          {storeCredit > 0 && (
            <div className="flex justify-between">
              <span>{bn ? "স্টোর ক্রেডিট" : "Store credit"}</span>
              <span>−{formatBdt(storeCredit)}</span>
            </div>
          )}
        </>
      )}
    </>
  );
}
