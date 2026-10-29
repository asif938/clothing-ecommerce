"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../../i18n/navigation";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card } from "../../../../components/ui";

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  riskLevel: string;
  total: number;
  codAmount: number;
  tags: string[];
  possibleDuplicateOrderIds: string[];
  createdAt: string;
  billingContact: { name?: string; phone?: string };
  items: { id: string }[];
}

const STATUSES = ["pending_payment", "pending", "confirmed", "on_hold", "processing", "packed", "shipped", "out_for_delivery", "delivered", "partially_delivered", "rejected_at_door", "returned_to_sender", "returned_to_warehouse", "completed", "cancelled", "expired"];

function money(poisha: number) {
  return `৳${(poisha / 100).toFixed(2)}`;
}

export default function OrdersPage() {
  const t = useTranslations("orders");
  const router = useRouter();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const params = new URLSearchParams({ pageSize: "50" });
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      if (duplicatesOnly) params.set("duplicatesOnly", "true");
      const result = await api.get<{ data: OrderRow[]; meta: { total: number } }>(`/admin/orders?${params.toString()}`);
      setRows(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load orders");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filter change reload
    void load();
  }, [status, duplicatesOnly]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulk(action: "confirm" | "cancel") {
    if (selected.size === 0) return;
    const reason = action === "cancel" ? window.prompt(t("bulkCancelReasonPrompt")) : null;
    if (action === "cancel" && !reason) return;
    setError(null);
    try {
      await api.post("/admin/orders/bulk", { orderIds: [...selected], action, reason });
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Bulk action failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <Button onClick={() => router.push("/orders/new")}>{t("createManual")}</Button>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-wrap items-end gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
          <option value="">{t("allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
        <input
          className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void load()}
        />
        <Button onClick={() => void load()}>{t("search")}</Button>
        <label className="flex items-center gap-2 text-sm text-surface-foreground">
          <input type="checkbox" checked={duplicatesOnly} onChange={(e) => setDuplicatesOnly(e.target.checked)} />
          {t("duplicatesOnly")}
        </label>
        {selected.size > 0 && (
          <div className="ml-auto flex gap-2">
            <Button onClick={() => void bulk("confirm")}>{t("bulkConfirm")} ({selected.size})</Button>
            <Button variant="danger" onClick={() => void bulk("cancel")}>
              {t("bulkCancel")}
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">{t("orderNumber")}</th>
              <th className="px-4 py-3">{t("customer")}</th>
              <th className="px-4 py-3">{t("status.label")}</th>
              <th className="px-4 py-3">{t("paymentStatus")}</th>
              <th className="px-4 py-3">{t("risk")}</th>
              <th className="px-4 py-3">{t("total")}</th>
              <th className="px-4 py-3">{t("cod")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted">
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} />
                </td>
                <td className="cursor-pointer px-4 py-3 text-surface-foreground" onClick={() => router.push(`/orders/${row.id}`)}>
                  {row.orderNumber}
                  {row.possibleDuplicateOrderIds.length > 0 && <span className="ml-2 rounded bg-warning/20 px-1.5 py-0.5 text-xs text-warning">{t("duplicate")}</span>}
                </td>
                <td className="cursor-pointer px-4 py-3 text-surface-foreground/70" onClick={() => router.push(`/orders/${row.id}`)}>
                  {row.billingContact?.name ?? row.billingContact?.phone ?? "—"}
                </td>
                <td className="cursor-pointer px-4 py-3 text-surface-foreground/70" onClick={() => router.push(`/orders/${row.id}`)}>
                  {t(`status.${row.status}`)}
                </td>
                <td className="cursor-pointer px-4 py-3 text-surface-foreground/70" onClick={() => router.push(`/orders/${row.id}`)}>
                  {row.paymentStatus}
                </td>
                <td className="cursor-pointer px-4 py-3" onClick={() => router.push(`/orders/${row.id}`)}>
                  <span className={row.riskLevel === "high" ? "text-danger" : row.riskLevel === "medium" ? "text-warning" : "text-surface-foreground/70"}>{row.riskLevel}</span>
                </td>
                <td className="cursor-pointer px-4 py-3 text-surface-foreground" onClick={() => router.push(`/orders/${row.id}`)}>
                  {money(row.total)}
                </td>
                <td className="cursor-pointer px-4 py-3 text-surface-foreground/70" onClick={() => router.push(`/orders/${row.id}`)}>
                  {money(row.codAmount)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={8}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-surface-foreground/50">{total} total</p>
    </div>
  );
}
