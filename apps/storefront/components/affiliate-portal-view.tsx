"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatBdt } from "../lib/money";
import { affiliatePortal, type AffiliatePortal } from "../lib/rewards-api";
import { AccountSkeleton } from "./skeletons";

const STATUS: Record<string, { bn: string; en: string }> = {
  pending: { bn: "অপেক্ষমাণ", en: "Pending" },
  approved: { bn: "অনুমোদিত", en: "Approved" },
  rejected: { bn: "বাতিল", en: "Rejected" },
  paid: { bn: "পরিশোধিত", en: "Paid" },
};

/** A partner's private, read-only stats page (§16 M16 affiliate/influencer tracking). No customer details are shown. */
export function AffiliatePortalView() {
  const params = useParams<{ locale: string; token: string }>();
  const bn = (params.locale ?? "bn") === "bn";
  const [data, setData] = useState<AffiliatePortal | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    affiliatePortal(params.token)
      .then(setData)
      .catch(() => setError(true));
  }, [params.token]);

  if (error) return <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-danger">{bn ? "লিংকটি বৈধ নয়।" : "This link isn't valid."}</div>;
  if (!data) return <AccountSkeleton />;

  const clicks = data.clickDays.reduce((sum, d) => sum + d.clicks, 0);
  const max = Math.max(1, ...data.clickDays.map((d) => d.clicks));
  const rate = data.commission.type === "percent" ? `${data.commission.value / 100}%` : formatBdt(data.commission.value);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-surface-foreground">{data.name}</h1>
      <p className="mb-6 text-sm text-surface-foreground/70">
        {bn ? `প্রতি অর্ডারে কমিশন: ${rate}` : `Commission per order: ${rate}`}
        {data.status === "paused" && (bn ? " · এখন বিরতিতে" : " · currently paused")}
      </p>

      <div className="mb-6 space-y-2 rounded-theme border border-border p-4 text-sm">
        <p className="text-xs text-surface-foreground/60">{bn ? "আপনার লিংক" : "Your link"}</p>
        <p className="break-all font-mono text-xs">{data.link}</p>
        {data.couponCode && (
          <p>
            {bn ? "কুপন কোড: " : "Coupon code: "}
            <span className="font-mono font-semibold">{data.couponCode}</span>
          </p>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          [bn ? "ক্লিক (৩০ দিন)" : "Clicks (30 days)", String(clicks)],
          [bn ? "অপেক্ষমাণ" : "Pending", formatBdt(data.balances.pending.amount)],
          [bn ? "অনুমোদিত" : "Approved", formatBdt(data.balances.approved.amount)],
          [bn ? "পরিশোধিত" : "Paid", formatBdt(data.balances.paid.amount)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-theme border border-border p-3">
            <p className="text-xs text-surface-foreground/60">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {data.clickDays.length > 0 && (
        <div className="mb-6" aria-label={bn ? "দৈনিক ক্লিক" : "Clicks per day"}>
          <div className="flex h-20 items-end gap-0.5">
            {data.clickDays.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.clicks}`} className="flex-1 rounded-t bg-brand" style={{ height: `${Math.max(4, (d.clicks / max) * 100)}%` }} />
            ))}
          </div>
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold text-surface-foreground">{bn ? "সাম্প্রতিক অর্ডার" : "Recent orders"}</h2>
      <div className="divide-y divide-border border-y border-border text-sm">
        {data.recent.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2">
            <div>
              <p>{formatBdt(c.orderAmount)}</p>
              <p className="text-xs text-surface-foreground/60">
                {new Date(c.createdAt).toLocaleDateString(bn ? "bn-BD" : "en-GB")} · {c.source === "coupon" ? (bn ? "কুপন" : "coupon") : bn ? "লিংক" : "link"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium">{formatBdt(c.commission)}</p>
              <p className="text-xs text-surface-foreground/60">{bn ? STATUS[c.status]?.bn : STATUS[c.status]?.en}</p>
            </div>
          </div>
        ))}
        {data.recent.length === 0 && <p className="py-3 text-surface-foreground/60">{bn ? "এখনো কোনো অর্ডার নেই।" : "No orders yet."}</p>}
      </div>
    </div>
  );
}
