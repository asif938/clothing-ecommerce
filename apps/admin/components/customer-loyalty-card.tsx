"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../lib/api";
import { localized, money, shortDate } from "../lib/format";
import { useCurrentStaff } from "../lib/use-current-staff";
import { Banner, Button, Card, TextField } from "./ui";

interface LoyaltyView {
  summary: {
    enabled: boolean;
    balance: number;
    balanceValue: number;
    pending: number;
    expiringWithin30Days: number;
    tier: { name: { bn?: string; en?: string } } | null;
    nextTier: { name: { bn?: string; en?: string }; remaining: number } | null;
  };
  ledger: { items: { id: string; points: number; reason: string; status: string; note: string | null; createdAt: string; expiresAt: string | null; availableAt: string | null }[]; total: number };
}

/** Points, tier and the ledger on the customer profile, with a manual adjustment (§5.8, §16 M13). */
export function CustomerLoyaltyCard({ customerId }: { customerId: string }) {
  const t = useTranslations("loyalty");
  const locale = useLocale();
  const { staff } = useCurrentStaff();
  const [view, setView] = useState<LoyaltyView | null>(null);
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const allowed = Boolean(staff?.permissions.includes("loyalty.manage"));

  const load = useCallback(async () => {
    try {
      setView(await api.get<LoyaltyView>(`/admin/loyalty/customers/${customerId}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }, [customerId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed || !view) return null;

  async function adjust() {
    setError(null);
    try {
      await api.post(`/admin/loyalty/customers/${customerId}/adjust`, { points: Number.parseInt(points, 10), note });
      setPoints("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  const { summary, ledger } = view;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-medium text-surface-foreground">{t("customerCardTitle")}</h2>
      {!summary.enabled && <Banner kind="info">{t("programOff")}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div>
          <p className="text-xs text-surface-foreground/60">{t("balance")}</p>
          <p className="text-lg font-semibold">
            {summary.balance} <span className="text-xs font-normal text-surface-foreground/60">({money(summary.balanceValue)})</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-surface-foreground/60">{t("pending")}</p>
          <p className="text-lg font-semibold">{summary.pending}</p>
        </div>
        <div>
          <p className="text-xs text-surface-foreground/60">{t("expiringSoon")}</p>
          <p className="text-lg font-semibold">{summary.expiringWithin30Days}</p>
        </div>
        <div>
          <p className="text-xs text-surface-foreground/60">{t("tier")}</p>
          <p className="text-lg font-semibold">{summary.tier ? localized(summary.tier.name, locale) : "—"}</p>
          {summary.nextTier && <p className="text-xs text-surface-foreground/60">{t("toNextTier", { amount: money(summary.nextTier.remaining), tier: localized(summary.nextTier.name, locale) })}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <TextField label={t("adjustPoints")} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="+100 / -50" />
        <TextField label={t("adjustNote")} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button variant="secondary" disabled={!points || note.trim().length < 3 || Number.isNaN(Number.parseInt(points, 10))} onClick={() => void adjust()}>
          {t("adjust")}
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-surface-foreground/60">
            <th className="py-1">{t("date")}</th>
            <th>{t("reason")}</th>
            <th>{t("points")}</th>
            <th>{t("status")}</th>
            <th>{t("expires")}</th>
          </tr>
        </thead>
        <tbody>
          {ledger.items.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="py-1">{shortDate(row.createdAt)}</td>
              <td>
                {t(`reason_${row.reason}`)}
                {row.note ? <span className="text-xs text-surface-foreground/50"> — {row.note}</span> : null}
              </td>
              <td className={row.points < 0 ? "text-danger" : "text-success"}>{row.points > 0 ? `+${row.points}` : row.points}</td>
              <td>{t(`status_${row.status}`)}</td>
              <td>{row.status === "pending" ? `${t("availableFrom")} ${shortDate(row.availableAt)}` : shortDate(row.expiresAt)}</td>
            </tr>
          ))}
          {ledger.items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-2 text-surface-foreground/50">
                —
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
