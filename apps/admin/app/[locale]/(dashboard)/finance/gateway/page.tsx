"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { dateInput, money, parseTaka, shortDate, takaInput } from "../../../../../lib/format";
import { Banner, Button, Card, FieldLabel, TextField } from "../../../../../components/ui";
import { FinanceTabs } from "../../../../../components/finance-tabs";

const METHODS = ["bkash", "nagad", "sslcommerz", "mock"] as const;

interface GatewaySettlement {
  id: string;
  method: (typeof METHODS)[number];
  settlementRef: string | null;
  periodFrom: string;
  periodTo: string;
  gross: number;
  fees: number;
  net: number;
  expectedGross: number;
  variance: number;
  receivedAt: string | null;
  note: string | null;
}

const blank = () => ({ method: "bkash" as (typeof METHODS)[number], settlementRef: "", periodFrom: dateInput(new Date(Date.now() - 7 * 86_400_000)), periodTo: dateInput(new Date()), gross: "", fees: "", note: "" });

/** Gateway settlements (bKash/Nagad/SSLCommerz payouts) with expected-vs-received variance (§8.2 Finance, §16 M12). */
export default function GatewaySettlementsPage() {
  const t = useTranslations("finance");
  const tCommon = useTranslations("common");
  const [rows, setRows] = useState<GatewaySettlement[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; form: ReturnType<typeof blank> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<GatewaySettlement[]>("/admin/finance/gateway-settlements"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  async function save() {
    if (!editing) return;
    const f = editing.form;
    const gross = parseTaka(f.gross);
    const fees = parseTaka(f.fees || "0");
    if (gross === null || fees === null) {
      setError(t("invalidAmount"));
      return;
    }
    const body = {
      method: f.method,
      settlementRef: f.settlementRef || null,
      periodFrom: new Date(`${f.periodFrom}T00:00:00+06:00`).toISOString(),
      periodTo: new Date(`${f.periodTo}T23:59:59+06:00`).toISOString(),
      gross,
      fees,
      receivedAt: new Date().toISOString(),
      note: f.note || null,
    };
    setError(null);
    try {
      if (editing.id) await api.put(`/admin/finance/gateway-settlements/${editing.id}`, body);
      else await api.post("/admin/finance/gateway-settlements", body);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("deleteGatewayConfirm"))) return;
    try {
      await api.delete(`/admin/finance/gateway-settlements/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  const set = (patch: Partial<ReturnType<typeof blank>>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });

  return (
    <div className="flex flex-col gap-6">
      <FinanceTabs />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("gatewayTitle")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("gatewaySubtitle")}</p>
        </div>
        {!editing && <Button onClick={() => setEditing({ id: null, form: blank() })}>{t("recordPayout")}</Button>}
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      {editing && (
        <Card className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-3">
            <FieldLabel>
              {t("method")}
              <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground" value={editing.form.method} onChange={(e) => set({ method: e.target.value as (typeof METHODS)[number] })}>
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <TextField label={t("settlementRef")} value={editing.form.settlementRef} onChange={(e) => set({ settlementRef: e.target.value })} />
            <TextField label={t("note")} value={editing.form.note} onChange={(e) => set({ note: e.target.value })} />
            <TextField label={t("periodFrom")} type="date" value={editing.form.periodFrom} onChange={(e) => set({ periodFrom: e.target.value })} />
            <TextField label={t("periodTo")} type="date" value={editing.form.periodTo} onChange={(e) => set({ periodTo: e.target.value })} />
            <div />
            <TextField label={t("grossTaka")} inputMode="decimal" value={editing.form.gross} onChange={(e) => set({ gross: e.target.value })} />
            <TextField label={t("feesTaka")} inputMode="decimal" value={editing.form.fees} onChange={(e) => set({ fees: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void save()}>{tCommon("save")}</Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("method")}</th>
              <th className="py-2 pr-4">{t("period")}</th>
              <th className="py-2 pr-4">{t("settlementRef")}</th>
              <th className="py-2 pr-4">{t("gross")}</th>
              <th className="py-2 pr-4">{t("fees")}</th>
              <th className="py-2 pr-4">{t("net")}</th>
              <th className="py-2 pr-4">{t("ourPayments")}</th>
              <th className="py-2 pr-4">{t("variance")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-4 text-surface-foreground">{r.method}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">
                  {shortDate(r.periodFrom)} – {shortDate(r.periodTo)}
                </td>
                <td className="py-2 pr-4 text-surface-foreground/80">{r.settlementRef ?? "—"}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(r.gross)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(r.fees)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(r.net)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(r.expectedGross)}</td>
                <td className={`py-2 pr-4 ${r.variance < 0 ? "text-danger" : r.variance > 0 ? "text-warning" : "text-success"}`}>{money(r.variance)}</td>
                <td className="py-2 text-right">
                  <button
                    className="mr-3 text-xs text-brand hover:underline"
                    onClick={() =>
                      setEditing({
                        id: r.id,
                        form: { method: r.method, settlementRef: r.settlementRef ?? "", periodFrom: r.periodFrom.slice(0, 10), periodTo: r.periodTo.slice(0, 10), gross: takaInput(r.gross), fees: takaInput(r.fees), note: r.note ?? "" },
                      })
                    }
                  >
                    {tCommon("edit")}
                  </button>
                  <button className="text-xs text-danger hover:underline" onClick={() => void remove(r.id)}>
                    {tCommon("delete")}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-4 text-surface-foreground/50">
                  {t("noGateway")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
