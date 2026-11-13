"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import { me } from "../lib/account-api";
import { myReferrals, type MyReferrals } from "../lib/rewards-api";

const STATUS: Record<string, { bn: string; en: string }> = {
  pending: { bn: "অপেক্ষমাণ", en: "Pending" },
  rewarded: { bn: "পুরস্কার পেয়েছেন", en: "Rewarded" },
  void: { bn: "বাতিল", en: "Not eligible" },
};

/** §7.3 `/account/*` "referrals" — the customer's code and share link, what friends get, and who they referred (§6.12, §16 M16). */
export function AccountReferralsView() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "bn";
  const bn = locale === "bn";
  const router = useRouter();
  const [data, setData] = useState<MyReferrals | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    me().then((result) => {
      if (!result.loggedIn) {
        router.replace("/account/login");
        return;
      }
      myReferrals(locale)
        .then(setData)
        .catch(() => undefined);
    });
  }, [router, locale]);

  if (!data) return <div className="mx-auto max-w-2xl px-4 py-10">…</div>;

  const { discount } = data.rules;
  const friendGets = discount.type === "percent" ? `${discount.value}%${discount.maxDiscount > 0 ? (bn ? ` (সর্বোচ্চ ${formatBdt(discount.maxDiscount)})` : ` (up to ${formatBdt(discount.maxDiscount)})`) : ""}` : formatBdt(discount.value);
  const youGet = data.rules.rewardType === "points" ? (bn ? `${data.rules.rewardPoints} পয়েন্ট` : `${data.rules.rewardPoints} points`) : formatBdt(data.rules.rewardAmount);
  const shareText = bn ? `আমার লিংক দিয়ে প্রথম অর্ডারে ${friendGets} ছাড় পান: ${data.link ?? ""}` : `Get ${friendGets} off your first order with my link: ${data.link ?? ""}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(data?.link ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is visible to copy by hand */
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/account" className="text-sm text-surface-foreground/60 underline">
        ← {bn ? "আমার অ্যাকাউন্ট" : "My account"}
      </Link>
      <h1 className="mb-6 mt-3 text-2xl font-semibold text-surface-foreground">{bn ? "বন্ধুদের রেফার করুন" : "Refer friends"}</h1>
      {!data.enabled || !data.code ? (
        <p className="text-sm text-surface-foreground/60">{bn ? "রেফারেল প্রোগ্রাম এখন চালু নেই।" : "The referral program isn't running right now."}</p>
      ) : (
        <>
          <div className="mb-6 rounded-theme border border-border p-4">
            <p className="text-sm">
              {bn ? `আপনার বন্ধু প্রথম অর্ডারে পাবেন ${friendGets} ছাড়। তাঁর অর্ডার সম্পন্ন হলে আপনি পাবেন ${youGet}।` : `Your friend gets ${friendGets} off their first order. You get ${youGet} once their order is complete.`}
            </p>
            <p className="mt-3 text-xs text-surface-foreground/60">{bn ? "আপনার কোড" : "Your code"}</p>
            <p className="font-mono text-2xl font-semibold tracking-widest text-surface-foreground">{data.code}</p>
            <p className="mt-3 break-all rounded-theme bg-muted px-3 py-2 text-xs">{data.link}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void copy()} className="rounded-theme border border-brand px-4 py-2 text-sm text-brand">
                {copied ? (bn ? "কপি হয়েছে" : "Copied") : bn ? "লিংক কপি করুন" : "Copy link"}
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="rounded-theme bg-brand px-4 py-2 text-sm text-brand-foreground">
                {bn ? "হোয়াটসঅ্যাপে শেয়ার" : "Share on WhatsApp"}
              </a>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-theme border border-border p-3">
              <p className="text-xs text-surface-foreground/60">{bn ? "অপেক্ষমাণ" : "Pending"}</p>
              <p className="text-xl font-semibold">{data.totals.pending}</p>
            </div>
            <div className="rounded-theme border border-border p-3">
              <p className="text-xs text-surface-foreground/60">{bn ? "আয় করেছেন" : "Earned"}</p>
              <p className="text-xl font-semibold">
                {formatBdt(data.totals.earnedCredit)}
                {data.totals.earnedPoints > 0 ? ` + ${data.totals.earnedPoints} ${bn ? "পয়েন্ট" : "pts"}` : ""}
              </p>
            </div>
          </div>

          <h2 className="mb-2 text-sm font-semibold text-surface-foreground">{bn ? "আপনার রেফারেল" : "Your referrals"}</h2>
          <div className="divide-y divide-border border-y border-border text-sm">
            {data.referrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2">
                <div>
                  <p>{r.refereePhone}</p>
                  <p className="text-xs text-surface-foreground/60">{new Date(r.createdAt).toLocaleDateString(bn ? "bn-BD" : "en-GB")}</p>
                </div>
                <span className={r.status === "rewarded" ? "text-success" : r.status === "void" ? "text-surface-foreground/50" : ""}>{bn ? STATUS[r.status]?.bn : STATUS[r.status]?.en}</span>
              </div>
            ))}
            {data.referrals.length === 0 && <p className="py-3 text-surface-foreground/60">{bn ? "এখনো কেউ নেই — লিংকটি শেয়ার করুন!" : "No one yet — share your link!"}</p>}
          </div>
        </>
      )}
    </div>
  );
}
