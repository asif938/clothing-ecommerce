"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { fileToBase64, money, shortDate } from "../../../../../lib/format";
import { Banner, Button, Card, FieldLabel, TextField } from "../../../../../components/ui";
import { FinanceTabs } from "../../../../../components/finance-tabs";

interface Settlement {
  id: string;
  courierDriver: string;
  settlementRef: string | null;
  source: string;
  status: "draft" | "confirmed";
  totalCollected: number;
  totalCharges: number;
  netAmount: number;
  createdAt: string;
  _count: { lines: number };
}
interface Outstanding {
  courierDriver: string;
  shipments: number;
  amount: number;
  oldestDeliveredAt: string | null;
}
interface Courier {
  instanceId: string | null;
  driver: string;
  label: string;
}
interface Inspect {
  headers: string[];
  rowCount: number;
  sample: Record<string, unknown>[];
}

/** Guess a column from common courier export headers so most imports need no manual mapping. */
function guess(headers: string[], patterns: RegExp[]): string {
  for (const p of patterns) {
    const hit = headers.find((h) => p.test(h));
    if (hit) return hit;
  }
  return "";
}

/** COD reconciliation: settlements list, outstanding COD, file import with column mapping, API fetch (§8.2 Finance, §16 M12). */
export default function CodReconciliationPage() {
  const t = useTranslations("finance");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [rows, setRows] = useState<Settlement[]>([]);
  const [outstanding, setOutstanding] = useState<Outstanding[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  const [courier, setCourier] = useState("");
  const [ref, setRef] = useState("");
  const [mapping, setMapping] = useState({ consignmentId: "", collected: "", charge: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o, c] = await Promise.all([
        api.get<Settlement[]>("/admin/finance/cod-settlements"),
        api.get<Outstanding[]>("/admin/finance/cod-settlements/outstanding"),
        api.get<Courier[]>("/admin/finance/cod-settlements/couriers"),
      ]);
      setRows(s);
      setOutstanding(o);
      setCouriers(c);
      setCourier((cur) => cur || c[0]?.instanceId || "manual");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  async function pickFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      const base64 = await fileToBase64(f);
      setFile({ name: f.name, base64 });
      const result = await api.post<Inspect>("/admin/finance/cod-settlements/inspect", { fileName: f.name, contentBase64: base64 });
      setInspect(result);
      setMapping({
        consignmentId: guess(result.headers, [/consignment/i, /tracking/i, /parcel.?id/i, /cid/i, /invoice/i]),
        collected: guess(result.headers, [/collect/i, /cod/i, /cash/i, /amount/i]),
        charge: guess(result.headers, [/charge/i, /fee/i, /cost/i]),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't read the file");
    }
  }

  async function runImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const instance = couriers.find((c) => (c.instanceId ?? "manual") === courier);
      const result = await api.post<{ id: string }>("/admin/finance/cod-settlements/import", {
        fileName: file.name,
        contentBase64: file.base64,
        courierProviderInstanceId: instance?.instanceId ?? null,
        courierDriver: instance?.driver ?? "manual",
        settlementRef: ref || null,
        mapping: { consignmentId: mapping.consignmentId, collected: mapping.collected, charge: mapping.charge || null },
      });
      router.push(`/finance/cod/${result.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function fetchFromApi() {
    const instance = couriers.find((c) => c.instanceId === courier);
    if (!instance?.instanceId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ id: string }>("/admin/finance/cod-settlements/fetch", { courierProviderInstanceId: instance.instanceId, settlementRef: ref || null });
      router.push(`/finance/cod/${result.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Fetch failed");
    } finally {
      setBusy(false);
    }
  }

  const selectClass = "rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground";
  const columnSelect = (key: keyof typeof mapping, label: string, optional = false) => (
    <FieldLabel>
      {label}
      <select className={selectClass} value={mapping[key]} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}>
        <option value="">{optional ? t("none") : "—"}</option>
        {inspect?.headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </FieldLabel>
  );
  const totalOutstanding = outstanding.reduce((a, o) => a + o.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <FinanceTabs />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("codTitle")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("codSubtitle")}</p>
        </div>
        {!importing && <Button onClick={() => setImporting(true)}>{t("newSettlement")}</Button>}
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card>
        <h2 className="mb-2 font-medium text-surface-foreground">
          {t("outstandingTitle")}: {money(totalOutstanding)}
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          {outstanding.map((o) => (
            <li key={o.courierDriver} className="flex justify-between border-b border-border py-1 last:border-b-0">
              <span className="text-surface-foreground">{o.courierDriver}</span>
              <span className="text-surface-foreground/70">{t("outstandingRow", { count: o.shipments, amount: money(o.amount), since: shortDate(o.oldestDeliveredAt) })}</span>
            </li>
          ))}
          {outstanding.length === 0 && <li className="text-surface-foreground/50">{t("nothingOutstanding")}</li>}
        </ul>
      </Card>

      {importing && (
        <Card className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <FieldLabel>
              {t("courier")}
              <select className={selectClass} value={courier} onChange={(e) => setCourier(e.target.value)}>
                {couriers.map((c) => (
                  <option key={c.instanceId ?? "manual"} value={c.instanceId ?? "manual"}>
                    {c.label}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <TextField label={t("settlementRef")} value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-surface-foreground">{t("uploadFile")}</span>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => void pickFile(e.target.files?.[0])} className="text-sm text-surface-foreground" />
            <p className="text-xs text-surface-foreground/50">{t("uploadHint")}</p>
          </div>
          {inspect && (
            <>
              <p className="text-sm text-surface-foreground/70">{t("rowsFound", { count: inspect.rowCount })}</p>
              <div className="grid gap-3 md:grid-cols-3">
                {columnSelect("consignmentId", t("colConsignment"))}
                {columnSelect("collected", t("colCollected"))}
                {columnSelect("charge", t("colCharge"), true)}
              </div>
              {inspect.sample.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-surface-foreground/50">
                        {inspect.headers.map((h) => (
                          <th key={h} className="py-1 pr-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {inspect.sample.map((row, i) => (
                        <tr key={i} className="border-b border-border last:border-b-0">
                          {inspect.headers.map((h) => (
                            <td key={h} className="py-1 pr-3 text-surface-foreground/80">
                              {String(row[h] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void runImport()} disabled={busy || !file || !mapping.consignmentId || !mapping.collected}>
              {t("importAndMatch")}
            </Button>
            {courier !== "manual" && (
              <Button variant="secondary" onClick={() => void fetchFromApi()} disabled={busy}>
                {t("fetchFromApi")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setImporting(false)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("imported")}</th>
              <th className="py-2 pr-4">{t("courier")}</th>
              <th className="py-2 pr-4">{t("settlementRef")}</th>
              <th className="py-2 pr-4">{t("lines")}</th>
              <th className="py-2 pr-4">{t("collected")}</th>
              <th className="py-2 pr-4">{t("charges")}</th>
              <th className="py-2 pr-4">{t("net")}</th>
              <th className="py-2 pr-4">{t("statusLabel")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted" onClick={() => router.push(`/finance/cod/${s.id}`)}>
                <td className="py-2 pr-4 text-surface-foreground">{shortDate(s.createdAt)}</td>
                <td className="py-2 pr-4 text-surface-foreground">
                  {s.courierDriver} <span className="text-xs text-surface-foreground/50">({t(`source_${s.source}`)})</span>
                </td>
                <td className="py-2 pr-4 text-surface-foreground/80">{s.settlementRef ?? "—"}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{s._count.lines}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(s.totalCollected)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(s.totalCharges)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(s.netAmount)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{t(`settlementStatus_${s.status}`)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-4 text-surface-foreground/50">
                  {t("noSettlements")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
