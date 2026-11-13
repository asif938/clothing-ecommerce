"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { money, parseTaka, shortDate } from "../../../../lib/format";
import { Banner, Button, Card, TextField } from "../../../../components/ui";
import { MarketingTabs, selectClass, textareaClass } from "../../../../components/marketing-tabs";
import { Link } from "../../../../i18n/navigation";

interface GiftCardRow {
  id: string;
  last4: string;
  initialAmount: number;
  balance: number;
  status: "pending" | "active" | "disabled" | "redeemed" | "expired" | "cancelled";
  source: "admin" | "purchase";
  expiresAt: string | null;
  purchaserName: string | null;
  purchaserPhone: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  createdAt: string;
}

interface Stats {
  enabled: boolean;
  outstandingBalance: number;
  activeCards: number;
  soldLast30Days: number;
  soldCountLast30Days: number;
  redeemedLast30Days: number;
}

const STATUSES = ["active", "pending", "disabled", "redeemed", "expired", "cancelled"] as const;
const EMPTY = { amount: "", recipientName: "", recipientPhone: "", recipientEmail: "", message: "", expiresAt: "", noExpiry: false, locale: "bn", send: true, note: "" };

/** Gift cards (§5.8, §16 M16): what's outstanding, issue a card by hand, find a card by its last 4 characters or a phone. */
export default function GiftCardsPage() {
  const t = useTranslations("giftCards");
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<GiftCardRow[]>([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [issued, setIssued] = useState<{ code: string; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const [s, list] = await Promise.all([api.get<Stats>("/admin/gift-cards/stats"), api.get<{ items: GiftCardRow[] }>(`/admin/gift-cards?${params.toString()}`)]);
      setStats(s);
      setRows(list.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [status, q]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / on filter change
    void load();
  }, [load]);

  async function issue() {
    setError(null);
    setIssued(null);
    const amount = parseTaka(form.amount);
    if (!amount) return setError(t("invalidAmount"));
    try {
      const result = await api.post<{ code: string; card: { id: string } }>("/admin/gift-cards", {
        amount,
        recipientName: form.recipientName || undefined,
        recipientPhone: form.recipientPhone || undefined,
        recipientEmail: form.recipientEmail || undefined,
        message: form.message || undefined,
        expiresAt: form.noExpiry ? null : form.expiresAt || undefined,
        locale: form.locale,
        send: form.send,
        note: form.note || undefined,
      });
      setIssued({ code: result.code, id: result.card.id });
      setForm(EMPTY);
      await load();
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
        <Link href="/settings" className="rounded-theme bg-muted px-4 py-2 text-sm text-surface-foreground">
          {t("rulesInSettings")}
        </Link>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {stats && !stats.enabled && <Banner kind="warning">{t("featureOff")}</Banner>}

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [t("outstanding"), money(stats.outstandingBalance)],
            [t("activeCards"), String(stats.activeCards)],
            [t("sold30"), `${money(stats.soldLast30Days)} (${stats.soldCountLast30Days})`],
            [t("redeemed30"), money(stats.redeemedLast30Days)],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="text-xs text-surface-foreground/60">{label}</p>
              <p className="text-xl font-semibold text-surface-foreground">{value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="font-medium text-surface-foreground">{t("issueTitle")}</h2>
        <p className="text-xs text-surface-foreground/60">{t("issueHelp")}</p>
        {issued && (
          <Banner kind="success">
            {t("issuedCode")} <span className="font-mono text-base font-semibold">{issued.code}</span> — {t("issuedOnce")}{" "}
            <Link href={`/gift-cards/${issued.id}`} className="underline">
              {t("open")}
            </Link>
          </Banner>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <TextField label={t("amountTaka")} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" />
          <TextField label={t("recipientName")} value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} />
          <TextField label={t("recipientPhone")} value={form.recipientPhone} onChange={(e) => setForm({ ...form, recipientPhone: e.target.value })} inputMode="tel" />
          <TextField label={t("recipientEmail")} value={form.recipientEmail} onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })} type="email" />
          <TextField label={t("expiresAt")} value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} type="date" disabled={form.noExpiry} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("messageLanguage")}</span>
            <select className={selectClass} value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })}>
              <option value="bn">বাংলা</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("message")}</span>
          <textarea className={textareaClass} rows={2} maxLength={300} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </label>
        <TextField label={t("internalNote")} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.noExpiry} onChange={(e) => setForm({ ...form, noExpiry: e.target.checked })} />
            {t("noExpiry")}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.send} onChange={(e) => setForm({ ...form, send: e.target.checked })} />
            {t("sendNow")}
          </label>
          <Button disabled={!form.amount} onClick={() => void issue()}>
            {t("issue")}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("status")}</span>
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t("allStatuses")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status_${s}`)}
                </option>
              ))}
            </select>
          </label>
          <TextField label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-surface-foreground/60">
                <th className="py-1">{t("card")}</th>
                <th>{t("balance")}</th>
                <th>{t("status")}</th>
                <th>{t("recipient")}</th>
                <th>{t("source")}</th>
                <th>{t("expires")}</th>
                <th>{t("created")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="py-1.5">
                    <Link href={`/gift-cards/${row.id}`} className="font-mono text-brand underline">
                      ••{row.last4}
                    </Link>
                  </td>
                  <td>
                    {money(row.balance)} <span className="text-xs text-surface-foreground/50">/ {money(row.initialAmount)}</span>
                  </td>
                  <td>{t(`status_${row.status}`)}</td>
                  <td>{row.recipientName ?? row.recipientPhone ?? row.recipientEmail ?? "—"}</td>
                  <td>{row.source === "purchase" ? `${t("source_purchase")} · ${row.purchaserName ?? ""}` : t("source_admin")}</td>
                  <td>{shortDate(row.expiresAt)}</td>
                  <td>{shortDate(row.createdAt)}</td>
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
