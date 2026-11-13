"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { money, shortDate } from "../../../../lib/format";
import { Banner, Button, Card } from "../../../../components/ui";
import { MarketingTabs, selectClass } from "../../../../components/marketing-tabs";
import { Link } from "../../../../i18n/navigation";

interface Person {
  id: string;
  name: string | null;
  phone: string | null;
}

interface Row {
  id: string;
  code: string;
  status: "pending" | "rewarded" | "void";
  refereePhone: string;
  refereeDiscount: number;
  rewardType: string | null;
  rewardAmount: number | null;
  voidReason: string | null;
  createdAt: string;
  referrer: Person;
  referee: Person | null;
  order: { id: string; orderNumber: string; status: string; total: number } | null;
}

interface Stats {
  settings: {
    enabled: boolean;
    discount: { type: "percent" | "fixed"; value: number; maxDiscount: number; minOrder: number };
    rewardType: "store_credit" | "points";
    rewardAmount: number;
    rewardPoints: number;
    maxRewardsPerMonth: number;
  };
  pending: number;
  rewarded: number;
  voided: number;
  rewardedLast30Days: number;
  discountsGiven: number;
  topReferrers: { customer: Person | null; referrals: number }[];
}

/** Referral program (§6.12, §16 M16): how it's set up, how it's doing, and every referral with its order. */
export default function ReferralsPage() {
  const t = useTranslations("referrals");
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([api.get<Stats>("/admin/referrals/stats"), api.get<{ items: Row[] }>(`/admin/referrals${status ? `?status=${status}` : ""}`)]);
      setStats(s);
      setRows(list.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / on filter change
    void load();
  }, [load]);

  async function voidReferral(id: string) {
    const reason = window.prompt(t("voidReasonPrompt"));
    if (!reason || reason.trim().length < 3) return;
    try {
      await api.post(`/admin/referrals/${id}/void`, { reason });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function runSweep() {
    setNotice(null);
    try {
      const result = await api.post<{ rewarded: number; voided: number }>("/admin/referrals/run-sweep");
      setNotice(t("sweepDone", result));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  const s = stats?.settings;
  return (
    <div className="flex flex-col gap-6">
      <MarketingTabs />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/settings" className="rounded-theme bg-muted px-4 py-2 text-sm text-surface-foreground">
            {t("rulesInSettings")}
          </Link>
          <Button variant="secondary" onClick={() => void runSweep()}>
            {t("runSweep")}
          </Button>
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}
      {s && !s.enabled && <Banner kind="warning">{t("programOff")}</Banner>}

      {stats && s && (
        <>
          <Card className="p-4 text-sm">
            {t("rulesSummary", {
              friend: s.discount.type === "percent" ? `${s.discount.value}%${s.discount.maxDiscount > 0 ? ` (≤ ${money(s.discount.maxDiscount)})` : ""}` : money(s.discount.value),
              reward: s.rewardType === "points" ? t("pointsValue", { points: s.rewardPoints }) : money(s.rewardAmount),
              cap: s.maxRewardsPerMonth > 0 ? String(s.maxRewardsPerMonth) : "∞",
            })}
          </Card>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              [t("pending"), String(stats.pending)],
              [t("rewarded"), String(stats.rewarded)],
              [t("voided"), String(stats.voided)],
              [t("rewarded30"), String(stats.rewardedLast30Days)],
              [t("discountsGiven"), money(stats.discountsGiven)],
            ].map(([label, value]) => (
              <Card key={label} className="p-4">
                <p className="text-xs text-surface-foreground/60">{label}</p>
                <p className="text-xl font-semibold text-surface-foreground">{value}</p>
              </Card>
            ))}
          </div>
          {stats.topReferrers.length > 0 && (
            <Card className="p-4 text-sm">
              <h2 className="mb-2 font-medium text-surface-foreground">{t("topReferrers")}</h2>
              <ol className="list-decimal space-y-1 pl-5">
                {stats.topReferrers.map((r, index) => (
                  <li key={r.customer?.id ?? `deleted-${index}`}>
                    {r.customer ? (
                      <Link href={`/customers/${r.customer.id}`} className="text-brand underline">
                        {r.customer.name ?? r.customer.phone}
                      </Link>
                    ) : (
                      "—"
                    )}{" "}
                    — {r.referrals}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </>
      )}

      <Card className="flex flex-col gap-3">
        <label className="flex w-48 flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("status")}</span>
          <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("all")}</option>
            <option value="pending">{t("status_pending")}</option>
            <option value="rewarded">{t("status_rewarded")}</option>
            <option value="void">{t("status_void")}</option>
          </select>
        </label>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-surface-foreground/60">
                <th className="py-1">{t("date")}</th>
                <th>{t("referrer")}</th>
                <th>{t("friend")}</th>
                <th>{t("order")}</th>
                <th>{t("friendDiscount")}</th>
                <th>{t("status")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="py-1.5">{shortDate(row.createdAt)}</td>
                  <td>
                    <Link href={`/customers/${row.referrer.id}`} className="text-brand underline">
                      {row.referrer.name ?? row.referrer.phone}
                    </Link>
                  </td>
                  <td>{row.referee ? <Link href={`/customers/${row.referee.id}`} className="text-brand underline">{row.referee.name ?? row.refereePhone}</Link> : row.refereePhone}</td>
                  <td>
                    {row.order ? (
                      <Link href={`/orders/${row.order.id}`} className="text-brand underline">
                        {row.order.orderNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {row.order && <span className="text-xs text-surface-foreground/50"> · {row.order.status}</span>}
                  </td>
                  <td>{money(row.refereeDiscount)}</td>
                  <td>
                    {t(`status_${row.status}`)}
                    {row.status === "rewarded" && row.rewardAmount !== null && (
                      <span className="text-xs text-surface-foreground/60"> · {row.rewardType === "points" ? t("pointsValue", { points: row.rewardAmount }) : money(row.rewardAmount)}</span>
                    )}
                    {row.voidReason && <span className="text-xs text-surface-foreground/50"> · {row.voidReason}</span>}
                  </td>
                  <td>
                    {row.status === "pending" && (
                      <button type="button" className="text-xs text-danger underline" onClick={() => void voidReferral(row.id)}>
                        {t("void")}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-3 text-surface-foreground/50">
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
