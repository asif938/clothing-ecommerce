"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../lib/api";
import { money, parseTaka, shortDate } from "../lib/format";
import { useCurrentStaff } from "../lib/use-current-staff";
import { Link } from "../i18n/navigation";
import { Banner, Button, Card, TextField } from "./ui";

interface Wallet {
  enabled: boolean;
  balance: number;
  ledger: { items: { id: string; amount: number; reason: string; orderId: string | null; balanceAfter: number; note: string | null; createdAt: string }[]; total: number };
}

/** The store credit wallet on the customer profile (§8.2 Customers "credit ledger", §16 M16), with a manual adjustment. */
export function CustomerStoreCreditCard({ customerId }: { customerId: string }) {
  const t = useTranslations("storeCredit");
  const { staff } = useCurrentStaff();
  const canAdjust = Boolean(staff?.permissions.includes("store_credit.manage"));
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("");
  const [deduct, setDeduct] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setWallet(await api.get<Wallet>(`/admin/store-credit/customers/${customerId}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }, [customerId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  if (!wallet) return error ? <Banner kind="error">{error}</Banner> : null;
  const poisha = parseTaka(amount);

  async function adjust() {
    if (!poisha) return;
    setError(null);
    try {
      setWallet(await api.post<Wallet>(`/admin/store-credit/customers/${customerId}/adjust`, { amount: deduct ? -poisha : poisha, note }));
      setAmount("");
      setNote("");
      setDeduct(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium text-surface-foreground">{t("cardTitle")}</h2>
        <p className="text-xl font-semibold">{money(wallet.balance)}</p>
      </div>
      {!wallet.enabled && <Banner kind="info">{t("featureOffCustomer")}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}
      {canAdjust && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} />
            {t("deduct")}
          </label>
          <TextField label={t("amountTaka")} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          <TextField label={t("note")} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button variant="secondary" disabled={!poisha || note.trim().length < 3} onClick={() => void adjust()}>
            {t("adjust")}
          </Button>
        </div>
      )}
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
          {wallet.ledger.items.map((row) => (
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
          {wallet.ledger.items.length === 0 && (
            <tr>
              <td colSpan={4} className="py-2 text-surface-foreground/50">
                —
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
