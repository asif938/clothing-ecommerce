"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { money, shortDate } from "../../../../../lib/format";
import { useCurrentStaff } from "../../../../../lib/use-current-staff";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";
import { AffiliateForm, type AffiliateValues } from "../../../../../components/affiliate-form";
import { Link } from "../../../../../i18n/navigation";

interface Balance {
  amount: number;
  count: number;
}

interface Detail extends AffiliateValues {
  id: string;
  coupon: { id: string; code: string | null; name: string } | null;
  link: string;
  portalUrl: string;
  clickDays: { day: string; clicks: number }[];
  balances: { pending: Balance; approved: Balance; paid: Balance; rejected: Balance; minPayout: number };
  payouts: { id: string; amount: number; method: string; externalRef: string | null; note: string | null; createdAt: string }[];
}

interface Conversion {
  id: string;
  source: string;
  orderAmount: number;
  commission: number;
  status: "pending" | "approved" | "rejected" | "paid";
  rejectedReason: string | null;
  createdAt: string;
  order: { id: string; orderNumber: string; status: string } | null;
}

/** One affiliate: links, balances, attributed orders (reject one by hand), payouts and settings. */
export default function AffiliateDetailPage() {
  const t = useTranslations("affiliates");
  const { id } = useParams<{ id: string }>();
  const { staff } = useCurrentStaff();
  const canPay = Boolean(staff?.permissions.includes("affiliates.payouts"));
  const [detail, setDetail] = useState<Detail | null>(null);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [payout, setPayout] = useState({ method: "", externalRef: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([api.get<Detail>(`/admin/affiliates/${id}`), api.get<{ items: Conversion[] }>(`/admin/affiliates/conversions?affiliateId=${id}`)]);
      setDetail(d);
      setConversions(c.items);
      setPayout((p) => (p.method ? p : { ...p, method: d.payoutMethod ?? "" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  async function act(action: () => Promise<unknown>, success?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  if (!detail) return error ? <Banner kind="error">{error}</Banner> : <p className="text-sm text-surface-foreground/60">…</p>;

  const clicks = detail.clickDays.reduce((sum, d) => sum + d.clicks, 0);
  const due = detail.balances.approved.amount;
  return (
    <div className="flex flex-col gap-6">
      <Link href="/affiliates" className="text-sm text-surface-foreground/60 underline">
        ← {t("title")}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{detail.name}</h1>
        <p className="font-mono text-sm text-surface-foreground/60">{detail.code}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      <Card className="flex flex-col gap-2 text-sm">
        <p>
          <span className="text-surface-foreground/60">{t("trackingLink")}: </span>
          <span className="break-all font-mono text-xs">{detail.link}</span>
        </p>
        {detail.coupon?.code && (
          <p>
            <span className="text-surface-foreground/60">{t("coupon")}: </span>
            <span className="font-mono">{detail.coupon.code}</span>
          </p>
        )}
        <p>
          <span className="text-surface-foreground/60">{t("portalLink")}: </span>
          <span className="break-all font-mono text-xs">{detail.portalUrl}</span>
        </p>
        <p className="text-xs text-surface-foreground/60">{t("portalHelp")}</p>
        <div>
          <Button variant="secondary" onClick={() => void act(() => api.post(`/admin/affiliates/${id}/rotate-portal`), t("portalRotated"))}>
            {t("rotatePortal")}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          [t("clicks30"), String(clicks)],
          [t("pending"), `${money(detail.balances.pending.amount)} (${detail.balances.pending.count})`],
          [t("approved"), `${money(detail.balances.approved.amount)} (${detail.balances.approved.count})`],
          [t("paid"), `${money(detail.balances.paid.amount)} (${detail.balances.paid.count})`],
          [t("rejected"), String(detail.balances.rejected.count)],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-surface-foreground/60">{label}</p>
            <p className="text-lg font-semibold text-surface-foreground">{value}</p>
          </Card>
        ))}
      </div>

      {canPay && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium text-surface-foreground">{t("recordPayout")}</h2>
          <p className="text-sm">{t("payoutDue", { amount: money(due) })}</p>
          {due > 0 && due < detail.balances.minPayout && <Banner kind="warning">{t("belowMinPayout", { min: money(detail.balances.minPayout) })}</Banner>}
          {detail.payoutDetails && <p className="text-xs text-surface-foreground/60">{t("payTo", { method: detail.payoutMethod ?? "", details: detail.payoutDetails })}</p>}
          <div className="flex flex-wrap items-end gap-2">
            <TextField label={t("payoutMethod")} value={payout.method} onChange={(e) => setPayout({ ...payout, method: e.target.value })} />
            <TextField label={t("transactionId")} value={payout.externalRef} onChange={(e) => setPayout({ ...payout, externalRef: e.target.value })} />
            <TextField label={t("notes")} value={payout.note} onChange={(e) => setPayout({ ...payout, note: e.target.value })} />
            <Button
              disabled={due <= 0 || !payout.method.trim()}
              onClick={() =>
                void act(async () => {
                  await api.post(`/admin/affiliates/${id}/payouts`, { method: payout.method, externalRef: payout.externalRef || null, note: payout.note || null });
                  setPayout({ method: detail.payoutMethod ?? "", externalRef: "", note: "" });
                }, t("payoutRecorded"))
              }
            >
              {t("markPaid")}
            </Button>
          </div>
          {detail.payouts.length > 0 && (
            <table className="w-full text-sm">
              <tbody>
                {detail.payouts.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-1">{shortDate(p.createdAt)}</td>
                    <td>{money(p.amount)}</td>
                    <td>{p.method}</td>
                    <td className="font-mono text-xs">{p.externalRef ?? ""}</td>
                    <td className="text-xs text-surface-foreground/60">{p.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-2 overflow-x-auto">
        <h2 className="font-medium text-surface-foreground">{t("attributedOrders")}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-surface-foreground/60">
              <th className="py-1">{t("date")}</th>
              <th>{t("order")}</th>
              <th>{t("source")}</th>
              <th>{t("sales")}</th>
              <th>{t("commission")}</th>
              <th>{t("status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {conversions.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="py-1.5">{shortDate(c.createdAt)}</td>
                <td>
                  {c.order ? (
                    <Link href={`/orders/${c.order.id}`} className="text-brand underline">
                      {c.order.orderNumber}
                    </Link>
                  ) : (
                    "—"
                  )}
                  {c.order && <span className="text-xs text-surface-foreground/50"> · {c.order.status}</span>}
                </td>
                <td>{t(`source_${c.source}`)}</td>
                <td>{money(c.orderAmount)}</td>
                <td>{money(c.commission)}</td>
                <td>
                  {t(`conversion_${c.status}`)}
                  {c.rejectedReason && <span className="text-xs text-surface-foreground/50"> · {c.rejectedReason}</span>}
                </td>
                <td>
                  {(c.status === "pending" || c.status === "approved") && (
                    <button
                      type="button"
                      className="text-xs text-danger underline"
                      onClick={() => {
                        const reason = window.prompt(t("rejectPrompt"));
                        if (reason && reason.trim().length >= 3) void act(() => api.post(`/admin/affiliates/conversions/${c.id}/reject`, { reason }));
                      }}
                    >
                      {t("reject")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {conversions.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-surface-foreground/50">
                  {t("noOrders")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="mb-3 font-medium text-surface-foreground">{t("settings")}</h2>
        <AffiliateForm initial={detail} submitLabel={t("save")} onSubmit={(values) => act(() => api.put(`/admin/affiliates/${id}`, values), t("saved"))} />
      </Card>
    </div>
  );
}
