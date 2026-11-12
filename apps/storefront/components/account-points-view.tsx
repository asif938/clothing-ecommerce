"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import { me, myLoyalty, type LoyaltyEntry, type LoyaltySummary } from "../lib/account-api";

const REASONS: Record<string, { bn: string; en: string }> = {
  order_delivered: { bn: "অর্ডার ডেলিভার", en: "Order delivered" },
  order_redeem: { bn: "চেকআউটে ব্যবহার", en: "Used at checkout" },
  redeem_reversal: { bn: "ফেরত (অর্ডার বাতিল)", en: "Returned (order cancelled)" },
  review_photo: { bn: "ছবিসহ রিভিউ", en: "Photo review" },
  birthday: { bn: "জন্মদিনের উপহার", en: "Birthday gift" },
  referral: { bn: "রেফারেল", en: "Referral" },
  expire: { bn: "মেয়াদ শেষ", en: "Expired" },
  adjust: { bn: "সমন্বয়", en: "Adjustment" },
};

/** Loyalty points, tier and history (§6.12, §16 M13). */
export function AccountPointsView() {
  const params = useParams<{ locale: string }>();
  const bn = (params.locale ?? "bn") === "bn";
  const router = useRouter();
  const [summary, setSummary] = useState<LoyaltySummary | null>(null);
  const [ledger, setLedger] = useState<LoyaltyEntry[]>([]);

  useEffect(() => {
    me().then((result) => {
      if (!result.loggedIn) {
        router.replace("/account/login");
        return;
      }
      myLoyalty()
        .then((r) => {
          setSummary(r.summary);
          setLedger(r.ledger.items);
        })
        .catch(() => undefined);
    });
  }, [router]);

  if (!summary) return <div className="mx-auto max-w-2xl px-4 py-10">…</div>;
  const name = (v: { bn?: string; en?: string } | null | undefined) => (v ? (bn ? v.bn || v.en : v.en || v.bn) : "") ?? "";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/account" className="text-sm text-surface-foreground/60 underline">
        ← {bn ? "আমার অ্যাকাউন্ট" : "My account"}
      </Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold text-surface-foreground">{bn ? "আমার পয়েন্ট" : "My points"}</h1>
      {!summary.enabled ? (
        <p className="text-sm text-surface-foreground/60">{bn ? "পয়েন্ট প্রোগ্রাম এখন চালু নেই।" : "The points program isn't running right now."}</p>
      ) : (
        <>
          <div className="mb-6 rounded-theme border border-border p-4">
            <p className="text-3xl font-semibold text-surface-foreground">{summary.balance}</p>
            <p className="text-sm text-surface-foreground/60">{bn ? `পয়েন্ট — ${formatBdt(summary.balanceValue)} মূল্যের` : `points — worth ${formatBdt(summary.balanceValue)}`}</p>
            {summary.pending > 0 && <p className="mt-2 text-xs text-surface-foreground/60">{bn ? `${summary.pending} পয়েন্ট শীঘ্রই যোগ হবে (রিটার্ন সময় শেষে)` : `${summary.pending} points on the way (after the return window)`}</p>}
            {summary.expiringWithin30Days > 0 && <p className="mt-1 text-xs text-danger">{bn ? `${summary.expiringWithin30Days} পয়েন্টের মেয়াদ ৩০ দিনের মধ্যে শেষ হবে` : `${summary.expiringWithin30Days} points expire within 30 days`}</p>}
            {summary.tier && (
              <p className="mt-3 text-sm">
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: summary.tier.color ?? "currentColor" }} />
                {name(summary.tier.name)}
                {summary.tier.perks && <span className="text-surface-foreground/60"> — {name(summary.tier.perks)}</span>}
              </p>
            )}
            {summary.nextTier && <p className="mt-1 text-xs text-surface-foreground/60">{bn ? `${name(summary.nextTier.name)} হতে আরও ${formatBdt(summary.nextTier.remaining)} কেনাকাটা` : `${formatBdt(summary.nextTier.remaining)} more to reach ${name(summary.nextTier.name)}`}</p>}
          </div>
          <p className="mb-6 text-xs text-surface-foreground/60">
            {bn
              ? `প্রতি ${formatBdt(summary.rules.spendPerPoint)} কেনাকাটায় ১ পয়েন্ট, ডেলিভারির পর যোগ হয়। ১ পয়েন্ট = ${formatBdt(summary.rules.pointValue)}। চেকআউটে পণ্যের মূল্যের সর্বোচ্চ ${summary.rules.maxRedeemPercent}% পয়েন্টে দেওয়া যায়।`
              : `Earn 1 point per ${formatBdt(summary.rules.spendPerPoint)} spent, added after delivery. 1 point = ${formatBdt(summary.rules.pointValue)}. Use points for up to ${summary.rules.maxRedeemPercent}% of your goods at checkout.`}
          </p>
          <h2 className="mb-2 text-sm font-semibold text-surface-foreground">{bn ? "ইতিহাস" : "History"}</h2>
          <div className="divide-y divide-border border-y border-border text-sm">
            {ledger.map((row) => (
              <div key={row.id} className="flex items-center justify-between py-2">
                <div>
                  <p>{REASONS[row.reason] ? (bn ? REASONS[row.reason]!.bn : REASONS[row.reason]!.en) : row.reason}</p>
                  <p className="text-xs text-surface-foreground/60">
                    {new Date(row.createdAt).toLocaleDateString(bn ? "bn-BD" : "en-GB")}
                    {row.status === "pending" && row.availableAt ? (bn ? ` · ${new Date(row.availableAt).toLocaleDateString("bn-BD")} থেকে ব্যবহারযোগ্য` : ` · usable from ${new Date(row.availableAt).toLocaleDateString("en-GB")}`) : ""}
                  </p>
                </div>
                <span className={row.points < 0 ? "text-danger" : "text-success"}>{row.points > 0 ? `+${row.points}` : row.points}</span>
              </div>
            ))}
            {ledger.length === 0 && <p className="py-3 text-surface-foreground/60">{bn ? "এখনো কিছু নেই।" : "Nothing yet."}</p>}
          </div>
        </>
      )}
    </div>
  );
}
