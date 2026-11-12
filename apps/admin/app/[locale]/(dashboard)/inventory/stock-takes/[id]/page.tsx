"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "../../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../../lib/api";
import { localized, money } from "../../../../../../lib/format";
import { Banner, Button, Card } from "../../../../../../components/ui";
import { BarcodeScanner } from "../../../../../../components/barcode-scanner";

interface Line {
  id: string;
  variantId: string;
  expectedQty: number;
  countedQty: number | null;
  variance: number | null;
  variant: { sku: string; barcode: string | null; costPrice: number | null; product: { title: { bn?: string; en?: string } } };
}

interface StockTake {
  id: string;
  number: string;
  status: "counting" | "applied" | "cancelled";
  note: string | null;
  location: { name: string };
  lines: Line[];
  summary: { linesCounted: number; linesUncounted: number; linesWithVariance: number; unitsOver: number; unitsShort: number; valueVariance: number; uncostedLines: number };
}

/** Count sheet + scanner + variance report + apply (docs/PROJECT_SPEC.md §8.2 Inventory "count sheet, scan, variance report, apply"). */
export default function StockTakeDetailPage() {
  const t = useTranslations("stockOps");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const [take, setTake] = useState<StockTake | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "uncounted" | "variance">("all");
  const [scanCode, setScanCode] = useState("");
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((data: StockTake) => {
    setTake(data);
    setCounts(Object.fromEntries(data.lines.map((l) => [l.variantId, l.countedQty === null ? "" : String(l.countedQty)])));
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await api.get<StockTake>(`/admin/inventory/stock-takes/${params.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [params.id, apply]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (!take) return [];
    if (filter === "uncounted") return take.lines.filter((l) => l.countedQty === null);
    if (filter === "variance") return take.lines.filter((l) => l.variance !== null && l.variance !== 0);
    return take.lines;
  }, [take, filter]);

  async function saveCounts() {
    if (!take) return;
    const changed = take.lines
      .filter((l) => (counts[l.variantId] ?? "") !== (l.countedQty === null ? "" : String(l.countedQty)))
      .map((l) => ({ variantId: l.variantId, countedQty: counts[l.variantId] === "" ? null : Math.max(0, Number.parseInt(counts[l.variantId] ?? "0", 10)) }));
    if (changed.length === 0) return;
    setError(null);
    try {
      apply(await api.post<StockTake>(`/admin/inventory/stock-takes/${params.id}/count`, { lines: changed }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  async function scan(code: string) {
    const value = code.trim();
    if (!value) return;
    setError(null);
    try {
      const result = await api.post<{ sku: string; countedQty: number }>(`/admin/inventory/stock-takes/${params.id}/scan`, { code: value, quantity: 1 });
      setLastScan(t("scanned", { sku: result.sku, count: result.countedQty }));
      setScanCode("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Scan failed");
    }
  }

  async function finish(action: "apply" | "cancel") {
    if (!take) return;
    if (action === "cancel" && !window.confirm(t("cancelTakeConfirm"))) return;
    let body: { zeroUncounted: boolean } | undefined;
    if (action === "apply") {
      if (!window.confirm(t("applyConfirm", { lines: take.summary.linesWithVariance }))) return;
      body = { zeroUncounted: take.summary.linesUncounted > 0 ? window.confirm(t("zeroUncountedConfirm", { lines: take.summary.linesUncounted })) : false };
    }
    setError(null);
    try {
      apply(await api.post<StockTake>(`/admin/inventory/stock-takes/${params.id}/${action}`, body));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    }
  }

  if (!take) return error ? <Banner kind="error">{error}</Banner> : <p className="text-sm text-surface-foreground/60">{tCommon("loading")}</p>;
  const counting = take.status === "counting";
  const s = take.summary;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/inventory/stock-takes" className="text-sm text-brand hover:underline">
        ← {t("stockTakesTitle")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-mono text-2xl font-semibold text-surface-foreground">{take.number}</h1>
          <p className="text-sm text-surface-foreground/60">
            {take.location.name} · {t(`takeStatus_${take.status}`)}
          </p>
          {take.note && <p className="mt-1 text-sm text-surface-foreground/80">{take.note}</p>}
        </div>
        {counting && (
          <div className="flex gap-2">
            <Button onClick={() => void finish("apply")}>{t("applyTake")}</Button>
            <Button variant="secondary" onClick={() => void finish("cancel")}>
              {t("cancelTake")}
            </Button>
          </div>
        )}
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card><p className="text-xs text-surface-foreground/60">{t("counted")}</p><p className="text-xl font-semibold text-surface-foreground">{s.linesCounted} / {s.linesCounted + s.linesUncounted}</p></Card>
        <Card><p className="text-xs text-surface-foreground/60">{t("linesWithVariance")}</p><p className="text-xl font-semibold text-surface-foreground">{s.linesWithVariance}</p></Card>
        <Card><p className="text-xs text-surface-foreground/60">{t("unitsOver")}</p><p className="text-xl font-semibold text-success">+{s.unitsOver}</p></Card>
        <Card><p className="text-xs text-surface-foreground/60">{t("unitsShort")}</p><p className="text-xl font-semibold text-danger">-{s.unitsShort}</p></Card>
        <Card><p className="text-xs text-surface-foreground/60">{t("valueVariance")}</p><p className={`text-xl font-semibold ${s.valueVariance < 0 ? "text-danger" : "text-surface-foreground"}`}>{money(s.valueVariance)}</p></Card>
      </div>
      {s.uncostedLines > 0 && <p className="text-xs text-surface-foreground/50">{t("uncostedNote", { lines: s.uncostedLines })}</p>}

      {counting && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium text-surface-foreground">{t("scanTitle")}</h2>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void scan(scanCode);
            }}
          >
            <input
              autoFocus
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              placeholder={t("scanPlaceholder")}
              className="w-full max-w-sm rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground"
            />
            <Button type="submit">{t("addOne")}</Button>
          </form>
          <BarcodeScanner onScan={(value) => void scan(value)} />
          {lastScan && <p className="text-sm text-success">{lastScan}</p>}
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["all", "uncounted", "variance"] as const).map((f) => (
            <Button key={f} variant={filter === f ? "primary" : "secondary"} onClick={() => setFilter(f)}>
              {t(`filter_${f}`)}
            </Button>
          ))}
        </div>
        {counting && <Button onClick={() => void saveCounts()}>{t("saveCounts")}</Button>}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("product")}</th>
              <th className="py-2 pr-4">SKU</th>
              <th className="py-2 pr-4">{t("expected")}</th>
              <th className="py-2 pr-4">{t("countedCol")}</th>
              <th className="py-2 pr-4">{t("variance")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((line) => (
              <tr key={line.id} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-4 text-surface-foreground">{localized(line.variant.product.title, locale)}</td>
                <td className="py-2 pr-4 font-mono text-surface-foreground/80">{line.variant.sku}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{line.expectedQty}</td>
                <td className="py-2 pr-4">
                  {counting ? (
                    <input
                      type="number"
                      min={0}
                      value={counts[line.variantId] ?? ""}
                      onChange={(e) => setCounts({ ...counts, [line.variantId]: e.target.value })}
                      className="w-24 rounded-theme border border-border bg-surface px-2 py-1 text-sm text-surface-foreground"
                    />
                  ) : (
                    <span className="text-surface-foreground/80">{line.countedQty ?? "—"}</span>
                  )}
                </td>
                <td className={`py-2 pr-4 ${line.variance === null || line.variance === 0 ? "text-surface-foreground/60" : line.variance > 0 ? "text-success" : "text-danger"}`}>
                  {line.variance === null ? "—" : line.variance > 0 ? `+${line.variance}` : line.variance}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
