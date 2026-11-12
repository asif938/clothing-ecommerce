"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  purchaseOrderCount: number;
}

type Draft = Omit<Supplier, "id" | "purchaseOrderCount">;
const EMPTY: Draft = { name: "", contactName: "", phone: "", email: "", address: "", notes: "", isActive: true };

/** Suppliers (docs/PROJECT_SPEC.md §5.4, §16 M12). */
export default function SuppliersPage() {
  const t = useTranslations("procurement");
  const tCommon = useTranslations("common");
  const [rows, setRows] = useState<Supplier[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<Supplier[]>("/admin/suppliers"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load suppliers");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  async function save() {
    if (!editing) return;
    setError(null);
    const body = Object.fromEntries(Object.entries(editing.draft).map(([k, v]) => [k, v === "" ? null : v]));
    try {
      if (editing.id) await api.patch(`/admin/suppliers/${editing.id}`, body);
      else await api.post("/admin/suppliers", body);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  async function remove(supplier: Supplier) {
    if (!window.confirm(t("deleteSupplierConfirm", { name: supplier.name }))) return;
    setError(null);
    try {
      await api.delete(`/admin/suppliers/${supplier.id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  const field = (key: keyof Draft, label: string, type = "text") =>
    editing && (
      <TextField label={label} type={type} value={(editing.draft[key] as string | null) ?? ""} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, [key]: e.target.value } })} />
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("suppliersTitle")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("suppliersSubtitle")}</p>
        </div>
        <Button onClick={() => setEditing({ id: null, draft: { ...EMPTY } })}>{t("newSupplier")}</Button>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      {editing && (
        <Card className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            {field("name", t("supplierName"))}
            {field("contactName", t("contactName"))}
            {field("phone", t("phone"), "tel")}
            {field("email", t("email"), "email")}
            {field("address", t("address"))}
            {field("notes", t("notes"))}
          </div>
          <label className="flex items-center gap-2 text-sm text-surface-foreground">
            <Toggle checked={editing.draft.isActive} onChange={(v) => setEditing({ ...editing, draft: { ...editing.draft, isActive: v } })} />
            {t("active")}
          </label>
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={!editing.draft.name.trim()}>
              {tCommon("save")}
            </Button>
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
              <th className="py-2 pr-4">{t("supplierName")}</th>
              <th className="py-2 pr-4">{t("contactName")}</th>
              <th className="py-2 pr-4">{t("phone")}</th>
              <th className="py-2 pr-4">{t("purchaseOrders")}</th>
              <th className="py-2 pr-4">{t("active")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-4 font-medium text-surface-foreground">{s.name}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{s.contactName ?? "—"}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{s.phone ?? "—"}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{s.purchaseOrderCount}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{s.isActive ? tCommon("enabled") : tCommon("disabled")}</td>
                <td className="py-2 text-right">
                  <button
                    className="mr-3 text-xs text-brand hover:underline"
                    onClick={() => setEditing({ id: s.id, draft: { name: s.name, contactName: s.contactName, phone: s.phone, email: s.email, address: s.address, notes: s.notes, isActive: s.isActive } })}
                  >
                    {tCommon("edit")}
                  </button>
                  {s.purchaseOrderCount === 0 && (
                    <button className="text-xs text-danger hover:underline" onClick={() => void remove(s)}>
                      {tCommon("delete")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-surface-foreground/50">
                  {t("noSuppliers")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
