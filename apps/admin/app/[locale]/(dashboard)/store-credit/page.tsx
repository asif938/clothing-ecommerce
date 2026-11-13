"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { money, shortDate } from "../../../../lib/format";
import { Banner, Card } from "../../../../components/ui";
import { MarketingTabs } from "../../../../components/marketing-tabs";
import { Link } from "../../../../i18n/navigation";

interface Stats {
  enabled: boolean;
  outstanding: number;
  holders: number;
  issuedLast30Days: number;
  spentLast30Days: number;
  recent: { id: string; amount: number; reason: string; orderId: string | null; note: string | null; createdAt: string; customer: { id: string; name: string | null; phone: string | null } }[];
}

/** Store credit across all customers (§16 M16): what the shop owes and the latest wallet movements. Per-customer wallets live on the customer profile. */
export default function StoreCreditPage() {
  const t = useTranslations("storeCredit");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await api.get<Stats>("/admin/store-credit/stats"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <MarketingTabs />
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {stats && !stats.enabled && <Banner kind="warning">{t("featureOff")}</Banner>}
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              [t("outstanding"), money(stats.outstanding)],
              [t("holders"), String(stats.holders)],
              [t("issued30"), money(stats.issuedLast30Days)],
              [t("spent30"), money(stats.spentLast30Days)],
            ].map(([label, value]) => (
              <Card key={label} className="p-4">
                <p className="text-xs text-surface-foreground/60">{label}</p>
                <p className="text-xl font-semibold text-surface-foreground">{value}</p>
              </Card>
            ))}
          </div>
          <Card className="overflow-x-auto">
            <h2 className="mb-2 font-medium text-surface-foreground">{t("recent")}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-foreground/60">
                  <th className="py-1">{t("date")}</th>
                  <th>{t("customer")}</th>
                  <th>{t("reason")}</th>
                  <th>{t("amount")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="py-1">{shortDate(row.createdAt)}</td>
                    <td>
                      <Link href={`/customers/${row.customer.id}`} className="text-brand underline">
                        {row.customer.name ?? row.customer.phone ?? row.customer.id}
                      </Link>
                    </td>
                    <td>
                      {t(`reason_${row.reason}`)}
                      {row.note ? <span className="text-xs text-surface-foreground/50"> — {row.note}</span> : null}
                    </td>
                    <td className={row.amount < 0 ? "text-danger" : "text-success"}>{row.amount > 0 ? `+${money(row.amount)}` : money(row.amount)}</td>
                  </tr>
                ))}
                {stats.recent.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-2 text-surface-foreground/50">
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
