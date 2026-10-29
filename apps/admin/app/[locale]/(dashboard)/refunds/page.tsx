"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card } from "../../../../components/ui";

interface Refund {
  id: string;
  orderId: string;
  amount: number;
  method: string;
  status: string;
  reason: string | null;
  createdAt: string;
  order: { orderNumber: string; total: number; paidTotal: number; refundedTotal: number };
}

function money(poisha: number) {
  return `৳${(poisha / 100).toFixed(2)}`;
}

export default function RefundsPage() {
  const t = useTranslations("refunds");
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [trxRef, setTrxRef] = useState<Record<string, string>>({});

  async function load() {
    try {
      setRefunds(await api.get<Refund[]>("/admin/refunds?status=pending"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function complete(id: string) {
    setError(null);
    try {
      await api.post(`/admin/refunds/${id}/complete`, { externalRef: trxRef[id] || null });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to complete");
    }
  }

  async function reject(id: string) {
    const reason = window.prompt(t("rejectReasonPrompt"));
    if (!reason) return;
    setError(null);
    try {
      await api.post(`/admin/refunds/${id}/reject`, { reason });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reject");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="px-4 py-3">{t("order")}</th>
              <th className="px-4 py-3">{t("amount")}</th>
              <th className="px-4 py-3">{t("method")}</th>
              <th className="px-4 py-3">{t("reason")}</th>
              <th className="px-4 py-3">{t("trxRef")}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-surface-foreground">{r.order.orderNumber}</td>
                <td className="px-4 py-3 text-surface-foreground">{money(r.amount)}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{r.method}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{r.reason ?? "—"}</td>
                <td className="px-4 py-3">
                  <input
                    className="rounded-theme border border-border bg-surface px-2 py-1 text-xs"
                    placeholder={t("trxRef")}
                    value={trxRef[r.id] ?? ""}
                    onChange={(e) => setTrxRef({ ...trxRef, [r.id]: e.target.value })}
                  />
                </td>
                <td className="flex gap-2 px-4 py-3 text-right">
                  <Button onClick={() => void complete(r.id)}>{t("complete")}</Button>
                  <Button variant="danger" onClick={() => void reject(r.id)}>
                    {t("reject")}
                  </Button>
                </td>
              </tr>
            ))}
            {refunds.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={6}>
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
