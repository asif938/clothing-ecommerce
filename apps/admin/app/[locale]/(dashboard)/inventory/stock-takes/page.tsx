"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { shortDate } from "../../../../../lib/format";
import { Banner, Button, Card, FieldLabel, TextField } from "../../../../../components/ui";
import { InventoryTabs } from "../../../../../components/inventory-tabs";

interface StockTakeRow {
  id: string;
  number: string;
  status: "counting" | "applied" | "cancelled";
  location: { name: string };
  lineCount: number;
  createdAt: string;
  appliedAt: string | null;
}

/** Stock takes list + start a count (docs/PROJECT_SPEC.md §8.2 Inventory, §16 M12). */
export default function StockTakesPage() {
  const t = useTranslations("stockOps");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [rows, setRows] = useState<StockTakeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await api.get<StockTakeRow[]>("/admin/inventory/stock-takes"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load stock takes");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  async function startCreate() {
    setCreating(true);
    const locs = await api.get<{ id: string; name: string }[]>("/admin/lookups/stock-locations").catch(() => []);
    setLocations(locs);
    setLocationId((id) => id || locs[0]?.id || "");
  }

  async function create() {
    setError(null);
    try {
      const take = await api.post<{ id: string }>("/admin/inventory/stock-takes", { locationId, note: note || null });
      router.push(`/inventory/stock-takes/${take.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <InventoryTabs />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("stockTakesTitle")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("stockTakesSubtitle")}</p>
        </div>
        {!creating && <Button onClick={() => void startCreate()}>{t("newStockTake")}</Button>}
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      {creating && (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-surface-foreground/60">{t("stockTakeStartHint")}</p>
          <FieldLabel>
            {t("location")}
            <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </FieldLabel>
          <TextField label={t("note")} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={() => void create()} disabled={!locationId}>
              {t("startCount")}
            </Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("number")}</th>
              <th className="py-2 pr-4">{t("location")}</th>
              <th className="py-2 pr-4">{t("statusLabel")}</th>
              <th className="py-2 pr-4">{t("lines")}</th>
              <th className="py-2 pr-4">{t("started")}</th>
              <th className="py-2 pr-4">{t("appliedOn")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted" onClick={() => router.push(`/inventory/stock-takes/${r.id}`)}>
                <td className="py-2 pr-4 font-mono text-surface-foreground">{r.number}</td>
                <td className="py-2 pr-4 text-surface-foreground">{r.location.name}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{t(`takeStatus_${r.status}`)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{r.lineCount}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{shortDate(r.createdAt)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{shortDate(r.appliedAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-surface-foreground/50">
                  {t("noStockTakes")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
