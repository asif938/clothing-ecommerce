"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { money, parseTaka, shortDate } from "../../../../../lib/format";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";
import { Link } from "../../../../../i18n/navigation";

interface Detail {
  id: string;
  last4: string;
  initialAmount: number;
  balance: number;
  status: "pending" | "active" | "disabled" | "redeemed" | "expired" | "cancelled";
  source: "admin" | "purchase";
  expiresAt: string | null;
  purchaserName: string | null;
  purchaserPhone: string | null;
  purchaserEmail: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  message: string | null;
  deliveredAt: string | null;
  paymentMethod: string | null;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
  transactions: { id: string; amount: number; reason: string; orderId: string | null; balanceAfter: number; note: string | null; createdAt: string }[];
}

/** One gift card: who it's for, its ledger, and the staff actions (disable/enable, adjust balance, new code). */
export default function GiftCardDetailPage() {
  const t = useTranslations("giftCards");
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<Detail | null>(null);
  const [adjust, setAdjust] = useState({ amount: "", note: "", negative: false });
  const [newCode, setNewCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCard(await api.get<Detail>(`/admin/gift-cards/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  async function act(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  if (!card) return error ? <Banner kind="error">{error}</Banner> : <p className="text-sm text-surface-foreground/60">…</p>;

  const amount = parseTaka(adjust.amount);
  return (
    <div className="flex flex-col gap-6">
      <Link href="/gift-cards" className="text-sm text-surface-foreground/60 underline">
        ← {t("title")}
      </Link>
      <div>
        <h1 className="font-mono text-2xl font-semibold text-surface-foreground">••{card.last4}</h1>
        <p className="text-sm text-surface-foreground/60">
          {t(`status_${card.status}`)} · {card.source === "purchase" ? t("source_purchase") : t("source_admin")} · {t("created")} {shortDate(card.createdAt)}
        </p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {newCode && (
        <Banner kind="success">
          {t("issuedCode")} <span className="font-mono text-base font-semibold">{newCode}</span> — {t("issuedOnce")}
        </Banner>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-surface-foreground/60">{t("balance")}</p>
          <p className="text-2xl font-semibold">{money(card.balance)}</p>
          <p className="text-xs text-surface-foreground/60">
            {t("initial")} {money(card.initialAmount)} · {t("expires")} {card.expiresAt ? shortDate(card.expiresAt) : t("never")}
          </p>
        </Card>
        <Card className="p-4 text-sm">
          <p className="text-xs text-surface-foreground/60">{t("recipient")}</p>
          <p>{card.recipientName ?? "—"}</p>
          <p>{card.recipientPhone ?? ""}</p>
          <p>{card.recipientEmail ?? ""}</p>
          <p className="text-xs text-surface-foreground/60">{card.deliveredAt ? `${t("sentAt")} ${shortDate(card.deliveredAt)}` : t("notSent")}</p>
        </Card>
        <Card className="p-4 text-sm">
          <p className="text-xs text-surface-foreground/60">{card.source === "purchase" ? t("purchaser") : t("internalNote")}</p>
          {card.source === "purchase" ? (
            <>
              <p>{card.purchaserName}</p>
              <p>{card.purchaserPhone}</p>
              <p className="text-xs text-surface-foreground/60">
                {card.paymentMethod?.toUpperCase()} · {card.paidAt ? `${t("paidAt")} ${shortDate(card.paidAt)}` : t("unpaid")}
              </p>
            </>
          ) : (
            <p>{card.note ?? "—"}</p>
          )}
          {card.message && <p className="mt-1 italic text-surface-foreground/70">“{card.message}”</p>}
        </Card>
      </div>

      {(card.status === "active" || card.status === "disabled" || card.status === "redeemed" || card.status === "expired") && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium text-surface-foreground">{t("actions")}</h2>
          <div className="flex flex-wrap gap-2">
            {card.status === "active" && (
              <Button variant="danger" onClick={() => void act(() => api.patch(`/admin/gift-cards/${id}/status`, { status: "disabled" }))}>
                {t("disable")}
              </Button>
            )}
            {card.status === "disabled" && (
              <Button variant="secondary" onClick={() => void act(() => api.patch(`/admin/gift-cards/${id}/status`, { status: "active" }))}>
                {t("enable")}
              </Button>
            )}
            {(card.status === "active" || card.status === "disabled") && (
              <Button
                variant="secondary"
                onClick={() =>
                  void act(async () => {
                    const result = await api.post<{ code: string }>(`/admin/gift-cards/${id}/reissue`, {});
                    setNewCode(result.code);
                  })
                }
              >
                {t("reissue")}
              </Button>
            )}
          </div>
          <p className="text-xs text-surface-foreground/60">{t("reissueHelp")}</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={adjust.negative} onChange={(e) => setAdjust({ ...adjust, negative: e.target.checked })} />
              {t("deduct")}
            </label>
            <TextField label={t("amountTaka")} value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} inputMode="decimal" />
            <TextField label={t("reasonNote")} value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
            <Button
              variant="secondary"
              disabled={!amount || adjust.note.trim().length < 3}
              onClick={() =>
                void act(async () => {
                  await api.post(`/admin/gift-cards/${id}/adjust`, { amount: adjust.negative ? -(amount ?? 0) : amount, note: adjust.note });
                  setAdjust({ amount: "", note: "", negative: false });
                })
              }
            >
              {t("adjust")}
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <h2 className="font-medium text-surface-foreground">{t("history")}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-surface-foreground/60">
              <th className="py-1">{t("date")}</th>
              <th>{t("reason")}</th>
              <th>{t("amount")}</th>
              <th>{t("balanceAfter")}</th>
            </tr>
          </thead>
          <tbody>
            {card.transactions.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="py-1">{shortDate(row.createdAt)}</td>
                <td>
                  {t(`reason_${row.reason}`)}
                  {row.orderId && (
                    <Link href={`/orders/${row.orderId}`} className="ml-1 text-xs text-brand underline">
                      {t("order")}
                    </Link>
                  )}
                  {row.note ? <span className="text-xs text-surface-foreground/50"> — {row.note}</span> : null}
                </td>
                <td className={row.amount < 0 ? "text-danger" : "text-success"}>{row.amount > 0 ? `+${money(row.amount)}` : money(row.amount)}</td>
                <td>{money(row.balanceAfter)}</td>
              </tr>
            ))}
            {card.transactions.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2 text-surface-foreground/50">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
