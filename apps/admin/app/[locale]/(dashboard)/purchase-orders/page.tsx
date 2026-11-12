"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "../../../../i18n/navigation";
import { api, ApiError } from "../../../../lib/api";
import { money, shortDate } from "../../../../lib/format";
import { Banner, Button, Card, FieldLabel, TextField } from "../../../../components/ui";
import { LineItemsEditor, type LineItem } from "../../../../components/line-items-editor";

const STATUSES = ["draft", "sent", "partially_received", "received", "cancelled"] as const;

interface PurchaseOrderRow {
  id: string;
  number: string;
  type: "purchase" | "production";
  status: (typeof STATUSES)[number];
  totalCost: number;
  expectedAt: string | null;
  createdAt: string;
  supplier: { name: string };
  location: { name: string };
  unitsOrdered: number;
  unitsReceived: number;
}

interface Option {
  id: string;
  name: string;
}

/** Purchase & production orders list + create (docs/PROJECT_SPEC.md §16 M12). */
export default function PurchaseOrdersPage() {
  const t = useTranslations("procurement");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "">("");
  const [rows, setRows] = useState<PurchaseOrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [suppliers, setSuppliers] = useState<(Option & { isActive: boolean })[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [form, setForm] = useState({ supplierId: "", type: "purchase" as "purchase" | "production", locationId: "", expectedAt: "", notes: "" });
  const [items, setItems] = useState<LineItem[]>([]);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<PurchaseOrderRow[]>(`/admin/purchase-orders${status ? `?status=${status}` : ""}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load purchase orders");
    }
  }, [status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / filter change.
    void load();
  }, [load]);

  async function startCreate() {
    setCreating(true);
    try {
      const [s, l] = await Promise.all([api.get<(Option & { isActive: boolean })[]>("/admin/suppliers"), api.get<Option[]>("/admin/lookups/stock-locations")]);
      setSuppliers(s.filter((x) => x.isActive));
      setLocations(l);
      setForm((f) => ({ ...f, supplierId: f.supplierId || s.find((x) => x.isActive)?.id || "", locationId: f.locationId || l[0]?.id || "" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load suppliers");
    }
  }

  async function create() {
    setError(null);
    try {
      const po = await api.post<{ id: string }>("/admin/purchase-orders", {
        supplierId: form.supplierId,
        type: form.type,
        locationId: form.locationId,
        expectedAt: form.expectedAt || null,
        notes: form.notes || null,
        items: items.map((i) => ({ variantId: i.variant.id, qtyOrdered: i.quantity, unitCost: i.unitCost ?? 0 })),
      });
      router.push(`/purchase-orders/${po.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    }
  }

  const selectClass = "rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("poTitle")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("poSubtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/suppliers" className="rounded-theme bg-muted px-4 py-2 text-sm text-surface-foreground hover:opacity-80">
            {t("suppliersTitle")}
          </Link>
          {!creating && <Button onClick={() => void startCreate()}>{t("newPo")}</Button>}
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      {creating && (
        <Card className="flex flex-col gap-4">
          {suppliers.length === 0 && <Banner kind="warning">{t("needSupplier")}</Banner>}
          <div className="grid gap-3 md:grid-cols-2">
            <FieldLabel>
              {t("supplier")}
              <select className={selectClass} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel>
              {t("type")}
              <select className={selectClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "purchase" | "production" })}>
                <option value="purchase">{t("type_purchase")}</option>
                <option value="production">{t("type_production")}</option>
              </select>
            </FieldLabel>
            <FieldLabel>
              {t("receiveInto")}
              <select className={selectClass} value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <TextField label={t("expectedAt")} type="date" value={form.expectedAt} onChange={(e) => setForm({ ...form, expectedAt: e.target.value })} />
          </div>
          <TextField label={t("notes")} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <LineItemsEditor items={items} onChange={setItems} withCost />
          <div className="flex gap-2">
            <Button onClick={() => void create()} disabled={!form.supplierId || !form.locationId || items.length === 0}>
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
            {s ? t(`status_${s}`) : t("all")}
          </Button>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("number")}</th>
              <th className="py-2 pr-4">{t("supplier")}</th>
              <th className="py-2 pr-4">{t("type")}</th>
              <th className="py-2 pr-4">{t("statusLabel")}</th>
              <th className="py-2 pr-4">{t("units")}</th>
              <th className="py-2 pr-4">{t("totalCost")}</th>
              <th className="py-2 pr-4">{t("expectedAt")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((po) => (
              <tr key={po.id} className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted" onClick={() => router.push(`/purchase-orders/${po.id}`)}>
                <td className="py-2 pr-4 font-mono text-surface-foreground">{po.number}</td>
                <td className="py-2 pr-4 text-surface-foreground">{po.supplier.name}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{t(`type_${po.type}`)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{t(`status_${po.status}`)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">
                  {po.unitsReceived} / {po.unitsOrdered}
                </td>
                <td className="py-2 pr-4 text-surface-foreground/80">{money(po.totalCost)}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{shortDate(po.expectedAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-surface-foreground/50">
                  {t("noPos")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
