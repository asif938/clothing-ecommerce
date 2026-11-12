"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "../../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../../lib/api";
import { money, parseTaka, shortDate } from "../../../../../../lib/format";
import { Banner, Button, Card, TextField } from "../../../../../../components/ui";

interface Line {
  id: string;
  consignmentId: string;
  collected: number;
  charge: number;
  expected: number | null;
  matched: boolean;
  variance: number;
  flag: string | null;
  note: string | null;
  shipmentId: string | null;
  shipment: { id: string; status: string; order: { id: string; orderNumber: string } } | null;
}

interface Settlement {
  id: string;
  courierDriver: string;
  settlementRef: string | null;
  source: string;
  fileName: string | null;
  status: "draft" | "confirmed";
  netAmount: number;
  receivedAmount: number | null;
  receivedAt: string | null;
  confirmedAt: string | null;
  note: string | null;
  lines: Line[];
  summary: { totalCollected: number; totalCharges: number; netAmount: number; matchedLines: number; flaggedLines: number; totalVariance: number };
}

/** One COD settlement: matched lines, variance flags, manual match, confirm (§8.2 Finance, §16 M12). */
export default function CodSettlementDetailPage() {
  const t = useTranslations("finance");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [received, setReceived] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Settlement>(`/admin/finance/cod-settlements/${params.id}`);
      setSettlement(data);
      setReceived((r) => r || String(Math.round(data.summary.netAmount / 100)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [params.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  const lines = useMemo(() => (settlement ? (onlyFlagged ? settlement.lines.filter((l) => l.flag) : settlement.lines) : []), [settlement, onlyFlagged]);

  async function call(path: string, body?: unknown) {
    setError(null);
    try {
      setSettlement(await api.post<Settlement>(`/admin/finance/cod-settlements/${params.id}/${path}`, body));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    }
  }

  async function linkShipment(line: Line) {
    const shipmentId = window.prompt(t("linkShipmentPrompt"), line.shipmentId ?? "");
    if (shipmentId === null) return;
    setError(null);
    try {
      setSettlement(await api.patch<Settlement>(`/admin/finance/cod-settlements/${params.id}/lines/${line.id}`, { shipmentId: shipmentId.trim() || null }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  async function confirm() {
    if (!settlement || !window.confirm(t("confirmSettlementConfirm", { flagged: settlement.summary.flaggedLines }))) return;
    await call("confirm", { receivedAmount: parseTaka(received), receivedAt: new Date().toISOString() });
  }

  async function remove() {
    if (!window.confirm(t("deleteSettlementConfirm"))) return;
    try {
      await api.delete(`/admin/finance/cod-settlements/${params.id}`);
      router.push("/finance/cod");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  if (!settlement) return error ? <Banner kind="error">{error}</Banner> : <p className="text-sm text-surface-foreground/60">{tCommon("loading")}</p>;
  const s = settlement.summary;
  const draft = settlement.status === "draft";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/finance/cod" className="text-sm text-brand hover:underline">
        ← {t("codTitle")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">
            {settlement.courierDriver} · {settlement.settlementRef ?? settlement.fileName ?? settlement.id}
          </h1>
          <p className="text-sm text-surface-foreground/60">
            {t(`source_${settlement.source}`)} · {t(`settlementStatus_${settlement.status}`)}
            {settlement.confirmedAt && ` · ${shortDate(settlement.confirmedAt)}`}
            {settlement.receivedAmount !== null && ` · ${t("receivedInBank")}: ${money(settlement.receivedAmount)}`}
          </p>
        </div>
        {draft && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void call("rematch")}>
              {t("rematch")}
            </Button>
            <Button variant="danger" onClick={() => void remove()}>
              {tCommon("delete")}
            </Button>
          </div>
        )}
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card><p className="text-xs text-surface-foreground/60">{t("collected")}</p><p className="text-xl font-semibold text-surface-foreground">{money(s.totalCollected)}</p></Card>
        <Card><p className="text-xs text-surface-foreground/60">{t("charges")}</p><p className="text-xl font-semibold text-surface-foreground">{money(s.totalCharges)}</p></Card>
        <Card><p className="text-xs text-surface-foreground/60">{t("net")}</p><p className="text-xl font-semibold text-surface-foreground">{money(s.netAmount)}</p></Card>
        <Card><p className="text-xs text-surface-foreground/60">{t("matched")}</p><p className="text-xl font-semibold text-surface-foreground">{s.matchedLines} / {settlement.lines.length}</p></Card>
        <Card><p className="text-xs text-surface-foreground/60">{t("variance")}</p><p className={`text-xl font-semibold ${s.totalVariance < 0 ? "text-danger" : "text-surface-foreground"}`}>{money(s.totalVariance)}</p></Card>
      </div>

      {draft && (
        <Card className="flex flex-wrap items-end gap-3">
          <TextField label={t("receivedInBankTaka")} inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} />
          <Button onClick={() => void confirm()}>{t("confirmSettlement")}</Button>
          <p className="w-full text-xs text-surface-foreground/50">{t("confirmHint")}</p>
        </Card>
      )}

      <label className="flex items-center gap-2 text-sm text-surface-foreground">
        <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
        {t("onlyFlagged", { count: s.flaggedLines })}
      </label>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("consignment")}</th>
              <th className="py-2 pr-4">{t("order")}</th>
              <th className="py-2 pr-4">{t("expected")}</th>
              <th className="py-2 pr-4">{t("collected")}</th>
              <th className="py-2 pr-4">{t("charge")}</th>
              <th className="py-2 pr-4">{t("variance")}</th>
              <th className="py-2 pr-4">{t("flag")}</th>
              {draft && <th />}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className={`border-b border-border last:border-b-0 ${line.flag ? "bg-warning/5" : ""}`}>
                <td className="py-2 pr-4 font-mono text-surface-foreground">{line.consignmentId}</td>
                <td className="py-2 pr-4">
                  {line.shipment ? (
                    <Link href={`/orders/${line.shipment.order.id}`} className="text-brand hover:underline">
                      {line.shipment.order.orderNumber}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(line.expected)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(line.collected)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(line.charge)}</td>
                <td className={`py-2 pr-4 ${line.variance < 0 ? "text-danger" : line.variance > 0 ? "text-warning" : "text-surface-foreground/60"}`}>{money(line.variance)}</td>
                <td className="py-2 pr-4 text-xs">{line.flag ? <span className="rounded bg-warning/15 px-2 py-0.5 text-warning">{t(`flag_${line.flag}`)}</span> : <span className="text-success">{t("ok")}</span>}</td>
                {draft && (
                  <td className="py-2 text-right">
                    <button className="text-xs text-brand hover:underline" onClick={() => void linkShipment(line)}>
                      {t("linkShipment")}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
