"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { money } from "../../../../lib/format";
import { Banner, Button, Card } from "../../../../components/ui";
import { MarketingTabs } from "../../../../components/marketing-tabs";
import { AffiliateForm, type AffiliateValues } from "../../../../components/affiliate-form";
import { Link, useRouter } from "../../../../i18n/navigation";

interface Row extends AffiliateValues {
  id: string;
  coupon: { code: string | null } | null;
  link: string;
  clicksLast30Days: number;
  conversions: number;
  revenue: number;
  pendingCommission: number;
  approvedCommission: number;
  paidCommission: number;
}

/** Affiliates / influencers (§5.8, §16 M16): each partner's link, coupon, clicks, attributed sales and commission owed. */
export default function AffiliatesPage() {
  const t = useTranslations("affiliates");
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.get<{ enabled: boolean; items: Row[] }>("/admin/affiliates");
      setRows(list.items);
      setEnabled(list.enabled);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  async function create(values: AffiliateValues) {
    setError(null);
    try {
      const created = await api.post<{ id: string }>("/admin/affiliates", values);
      router.push(`/affiliates/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

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
          <Button onClick={() => setCreating((v) => !v)}>{creating ? t("close") : t("add")}</Button>
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {!enabled && <Banner kind="warning">{t("featureOff")}</Banner>}

      {creating && (
        <Card>
          <AffiliateForm submitLabel={t("create")} onSubmit={create} />
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-surface-foreground/60">
              <th className="py-1">{t("name")}</th>
              <th>{t("code")}</th>
              <th>{t("clicks30")}</th>
              <th>{t("orders")}</th>
              <th>{t("sales")}</th>
              <th>{t("pending")}</th>
              <th>{t("approved")}</th>
              <th>{t("paid")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="py-1.5">
                  <Link href={`/affiliates/${row.id}`} className="text-brand underline">
                    {row.name}
                  </Link>
                  {row.status === "paused" && <span className="ml-1 text-xs text-surface-foreground/50">({t("status_paused")})</span>}
                </td>
                <td className="font-mono">
                  {row.code}
                  {row.coupon?.code && <span className="block text-xs text-surface-foreground/60">{row.coupon.code}</span>}
                </td>
                <td>{row.clicksLast30Days}</td>
                <td>{row.conversions}</td>
                <td>{money(row.revenue)}</td>
                <td>{money(row.pendingCommission)}</td>
                <td className="font-medium">{money(row.approvedCommission)}</td>
                <td>{money(row.paidCommission)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-3 text-surface-foreground/50">
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
