"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import { me } from "../lib/account-api";
import { giftCardBalance, giftCardOptions, giftCardToWallet, myStoreCredit, type StoreCreditEntry } from "../lib/rewards-api";
import { AccountSkeleton } from "./skeletons";

const REASONS: Record<string, { bn: string; en: string }> = {
  refund: { bn: "রিফান্ড", en: "Refund" },
  return: { bn: "রিটার্ন", en: "Return" },
  gift_card: { bn: "গিফট কার্ড যোগ", en: "Gift card added" },
  referral: { bn: "রেফারেল পুরস্কার", en: "Referral reward" },
  cashback: { bn: "ক্যাশব্যাক", en: "Cashback" },
  adjust: { bn: "সমন্বয়", en: "Adjustment" },
  order_payment: { bn: "অর্ডারে ব্যবহার", en: "Used on an order" },
  order_reversal: { bn: "ফেরত (অর্ডার বাতিল)", en: "Returned (order cancelled)" },
};

/** §7.3 `/account/*` "store credit" + gift card balance check and "add to wallet" (§16 M16). */
export function AccountCreditView() {
  const params = useParams<{ locale: string }>();
  const bn = (params.locale ?? "bn") === "bn";
  const router = useRouter();
  const [wallet, setWallet] = useState<{ enabled: boolean; balance: number; items: StoreCreditEntry[] } | null>(null);
  const [giftCardsOn, setGiftCardsOn] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(() => {
    myStoreCredit()
      .then((r) => setWallet({ enabled: r.enabled, balance: r.balance, items: r.ledger.items }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    me().then((result) => {
      if (!result.loggedIn) {
        router.replace("/account/login");
        return;
      }
      load();
      giftCardOptions()
        .then((o) => setGiftCardsOn(o.enabled))
        .catch(() => undefined);
    });
  }, [router, load]);

  async function check() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await giftCardBalance(code);
      const expiry = r.expiresAt ? new Date(r.expiresAt).toLocaleDateString(bn ? "bn-BD" : "en-GB") : null;
      setMessage({
        kind: r.usable ? "ok" : "error",
        text: r.usable
          ? bn
            ? `কার্ড ••${r.last4}: ব্যালান্স ${formatBdt(r.balance)}${expiry ? `, মেয়াদ ${expiry}` : ""}`
            : `Card ••${r.last4}: balance ${formatBdt(r.balance)}${expiry ? `, valid until ${expiry}` : ""}`
          : bn
            ? `কার্ড ••${r.last4} ব্যবহার করা যাচ্ছে না।`
            : `Card ••${r.last4} can't be used.`,
      });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  async function addToWallet() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await giftCardToWallet(code);
      setMessage({ kind: "ok", text: bn ? `${formatBdt(r.amount)} আপনার ওয়ালেটে যোগ হয়েছে।` : `${formatBdt(r.amount)} added to your wallet.` });
      setCode("");
      load();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  if (!wallet) return <AccountSkeleton />;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/account" className="text-sm text-surface-foreground/60 underline">
        ← {bn ? "আমার অ্যাকাউন্ট" : "My account"}
      </Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold text-surface-foreground">{bn ? "স্টোর ক্রেডিট" : "Store credit"}</h1>

      <div className="mb-6 rounded-theme border border-border p-4">
        <p className="text-3xl font-semibold text-surface-foreground">{formatBdt(wallet.balance)}</p>
        <p className="text-sm text-surface-foreground/60">
          {wallet.enabled
            ? bn
              ? "চেকআউটে “স্টোর ক্রেডিট ব্যবহার করুন” বেছে নিন।"
              : "Choose “Use store credit” at checkout."
            : bn
              ? "স্টোর ক্রেডিট দিয়ে পরিশোধ এখন বন্ধ আছে। আপনার ব্যালান্স সুরক্ষিত আছে।"
              : "Paying with store credit is switched off right now. Your balance is safe."}
        </p>
      </div>

      {giftCardsOn && (
        <section className="mb-8 space-y-2">
          <h2 className="text-sm font-semibold text-surface-foreground">{bn ? "গিফট কার্ড" : "Gift card"}</h2>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={bn ? "গিফট কার্ড কোড" : "Gift card code"}
            autoComplete="off"
            className="w-full rounded-theme border border-border px-3 py-2 text-sm uppercase"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || code.trim().length < 4} onClick={() => void check()} className="rounded-theme border border-brand px-4 py-2 text-sm text-brand disabled:opacity-60">
              {bn ? "ব্যালান্স দেখুন" : "Check balance"}
            </button>
            {wallet.enabled && (
              <button type="button" disabled={busy || code.trim().length < 4} onClick={() => void addToWallet()} className="rounded-theme bg-brand px-4 py-2 text-sm text-brand-foreground disabled:opacity-60">
                {bn ? "ওয়ালেটে যোগ করুন" : "Add to my wallet"}
              </button>
            )}
          </div>
          {message && <p className={`text-sm ${message.kind === "ok" ? "text-success" : "text-danger"}`}>{message.text}</p>}
          <p className="text-xs text-surface-foreground/60">
            {bn ? "ওয়ালেটে যোগ করলে কার্ডের পুরো ব্যালান্স আপনার স্টোর ক্রেডিটে চলে আসে।" : "Adding a card moves its whole balance into your store credit."}{" "}
            <Link href="/gift-cards" className="underline">
              {bn ? "গিফট কার্ড কিনুন" : "Buy a gift card"}
            </Link>
          </p>
        </section>
      )}

      <h2 className="mb-2 text-sm font-semibold text-surface-foreground">{bn ? "ইতিহাস" : "History"}</h2>
      <div className="divide-y divide-border border-y border-border text-sm">
        {wallet.items.map((row) => (
          <div key={row.id} className="flex items-center justify-between py-2">
            <div>
              <p>{REASONS[row.reason] ? (bn ? REASONS[row.reason]!.bn : REASONS[row.reason]!.en) : row.reason}</p>
              <p className="text-xs text-surface-foreground/60">{new Date(row.createdAt).toLocaleDateString(bn ? "bn-BD" : "en-GB")}</p>
            </div>
            <span className={row.amount < 0 ? "text-danger" : "text-success"}>
              {row.amount > 0 ? "+" : "−"}
              {formatBdt(Math.abs(row.amount))}
            </span>
          </div>
        ))}
        {wallet.items.length === 0 && <p className="py-3 text-surface-foreground/60">{bn ? "এখনো কিছু নেই।" : "Nothing yet."}</p>}
      </div>
    </div>
  );
}
