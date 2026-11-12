"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { shortDate } from "../../../../../lib/format";
import { Banner, Button, Card, FieldLabel, TextField } from "../../../../../components/ui";
import { LineItemsEditor, type LineItem } from "../../../../../components/line-items-editor";
import { InventoryTabs } from "../../../../../components/inventory-tabs";

const STATUSES = ["draft", "in_transit", "received", "cancelled"] as const;

interface TransferRow {
  id: string;
  number: string;
  status: (typeof STATUSES)[number];
  fromLocation: { name: string };
  toLocation: { name: string };
  units: number;
  unitsReceived: number;
  createdAt: string;
  shippedAt: string | null;
}

/** Stock transfers between locations (docs/PROJECT_SPEC.md §8.2 Inventory, §16 M12). */
export default function TransfersPage() {
  const t = useTranslations("stockOps");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "">("");
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ fromLocationId: "", toLocationId: "", note: "" });
  const [items, setItems] = useState<LineItem[]>([]);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<TransferRow[]>(`/admin/inventory/transfers${status ? `?status=${status}` : ""}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load transfers");
    }
  }, [status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / filter change.
    void load();
  }, [load]);

  async function startCreate() {
    setCreating(true);
    const locs = await api.get<{ id: string; name: string }[]>("/admin/lookups/stock-locations").catch(() => []);
    setLocations(locs);
    setForm((f) => ({ ...f, fromLocationId: f.fromLocationId || locs[0]?.id || "", toLocationId: f.toLocationId || locs[1]?.id || "" }));
  }

  async function create() {
    setError(null);
    try {
      const transfer = await api.post<{ id: string }>("/admin/inventory/transfers", {
        fromLocationId: form.fromLocationId,
        toLocationId: form.toLocationId,
        note: form.note || null,
        items: items.map((i) => ({ variantId: i.variant.id, quantity: i.quantity })),
      });
      router.push(`/inventory/transfers/${transfer.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    }
  }

  const selectClass = "rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground";
  const locationSelect = (key: "fromLocationId" | "toLocationId", label: string) => (
    <FieldLabel>
      {label}
      <select className={selectClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </FieldLabel>
  );

  return (
    <div className="flex flex-col gap-6">
      <InventoryTabs />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("transfersTitle")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("transfersSubtitle")}</p>
        </div>
        {!creating && <Button onClick={() => void startCreate()}>{t("newTransfer")}</Button>}
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      {creating && (
        <Card className="flex flex-col gap-4">
          {locations.length < 2 && <Banner kind="warning">{t("needTwoLocations")}</Banner>}
          <div className="grid gap-3 md:grid-cols-2">
            {locationSelect("fromLocationId", t("from"))}
            {locationSelect("toLocationId", t("to"))}
          </div>
          <TextField label={t("note")} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <LineItemsEditor items={items} onChange={setItems} />
          <div className="flex gap-2">
            <Button onClick={() => void create()} disabled={!form.fromLocationId || !form.toLocationId || form.fromLocationId === form.toLocationId || items.length === 0}>
              {t("createDraft")}
            </Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {(["", ...STATUSES] as const).map((s) => (
          <Button key={s || "all"} variant={s === status ? "primary" : "secondary"} onClick={() => setStatus(s)}>
            {s ? t(`transferStatus_${s}`) : t("all")}
          </Button>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("number")}</th>
              <th className="py-2 pr-4">{t("route")}</th>
              <th className="py-2 pr-4">{t("statusLabel")}</th>
              <th className="py-2 pr-4">{t("units")}</th>
              <th className="py-2 pr-4">{t("dispatched")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted" onClick={() => router.push(`/inventory/transfers/${r.id}`)}>
                <td className="py-2 pr-4 font-mono text-surface-foreground">{r.number}</td>
                <td className="py-2 pr-4 text-surface-foreground">
                  {r.fromLocation.name} → {r.toLocation.name}
                </td>
                <td className="py-2 pr-4 text-surface-foreground/80">{t(`transferStatus_${r.status}`)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{r.status === "received" ? `${r.unitsReceived} / ${r.units}` : r.units}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{shortDate(r.shippedAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-surface-foreground/50">
                  {t("noTransfers")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
