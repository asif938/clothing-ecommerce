"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card } from "../../../../../components/ui";

interface ReturnItem {
  orderItemId: string;
  quantity: number;
  exchangeForVariantId: string | null;
  condition?: "pass" | "fail";
  restock?: boolean;
}

interface ReturnDetail {
  id: string;
  type: "refund" | "exchange" | "store_credit";
  status: string;
  reasonCode: string | null;
  customerComment: string | null;
  items: ReturnItem[];
  rejectedReason: string | null;
  exchangeOrderId: string | null;
  order: { orderNumber: string; items: { id: string; sku: string; title: { en?: string; bn?: string }; unitPrice: number }[] };
}

export default function ReturnDetailPage() {
  const t = useTranslations("returns");
  const params = useParams<{ id: string }>();
  const [record, setRecord] = useState<ReturnDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passed, setPassed] = useState<Record<string, boolean>>({});

  async function load() {
    try {
      setRecord(await api.get<ReturnDetail>(`/admin/returns/${params.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function act(action: string, body?: unknown) {
    setError(null);
    try {
      await api.post(`/admin/returns/${params.id}/${action}`, body);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    }
  }

  async function reject() {
    const rejectedReason = window.prompt(t("rejectReasonPrompt"));
    if (!rejectedReason) return;
    await act("reject", { rejectedReason });
  }

  async function inspect() {
    if (!record) return;
    await act(
      "inspect",
      { items: record.items.map((i) => ({ orderItemId: i.orderItemId, passed: passed[i.orderItemId] ?? false, restock: passed[i.orderItemId] ?? false })) },
    );
  }

  if (!record) {
    return (
      <div className="flex flex-col gap-4">
        {error && <Banner kind="error">{error}</Banner>}
        <p className="text-sm text-surface-foreground/50">…</p>
      </div>
    );
  }

  const itemsBySku = new Map(record.order.items.map((i) => [i.id, i]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-surface-foreground">
          {t("title")} — <Link href={`/orders/${record.order.orderNumber}`}>{record.order.orderNumber}</Link>
        </h1>
        <span className="rounded-theme bg-muted px-3 py-1 text-xs font-medium text-surface-foreground">{t(`statuses.${record.status}`)}</span>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-2">
        <p className="text-sm text-surface-foreground">
          <strong>{t("type")}:</strong> {t(`types.${record.type}`)}
        </p>
        <p className="text-sm text-surface-foreground">
          <strong>{t("reason")}:</strong> {record.reasonCode ?? "—"}
        </p>
        {record.customerComment && <p className="text-sm text-surface-foreground/70">{record.customerComment}</p>}
        {record.rejectedReason && <p className="text-sm text-danger">{t("rejectedReason")}: {record.rejectedReason}</p>}
        {record.exchangeOrderId && (
          <p className="text-sm text-surface-foreground">
            {t("exchangeOrder")}: <Link href={`/orders/${record.exchangeOrderId}`}>{record.exchangeOrderId}</Link>
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-surface-foreground">{t("items")}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="py-2">{t("sku")}</th>
              <th className="py-2">{t("quantity")}</th>
              {record.status === "received" && <th className="py-2">{t("qc")}</th>}
              {record.items.some((i) => i.condition) && <th className="py-2">{t("qc")}</th>}
            </tr>
          </thead>
          <tbody>
            {record.items.map((item) => {
              const original = itemsBySku.get(item.orderItemId);
              return (
                <tr key={item.orderItemId} className="border-b border-border last:border-0">
                  <td className="py-2 text-surface-foreground">{original?.sku ?? item.orderItemId}</td>
                  <td className="py-2 text-surface-foreground/70">{item.quantity}</td>
                  {record.status === "received" && (
                    <td className="py-2">
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={passed[item.orderItemId] ?? false} onChange={(e) => setPassed({ ...passed, [item.orderItemId]: e.target.checked })} />
                        {t("passedRestock")}
                      </label>
                    </td>
                  )}
                  {item.condition && (
                    <td className="py-2 text-surface-foreground/70">
                      {item.condition} / {item.restock ? t("restocked") : t("notRestocked")}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card className="flex gap-2">
        {record.status === "requested" && (
          <>
            <Button onClick={() => void act("approve", {})}>{t("approve")}</Button>
            <Button variant="danger" onClick={() => void reject()}>
              {t("reject")}
            </Button>
          </>
        )}
        {record.status === "approved" && <Button onClick={() => void act("schedule-pickup")}>{t("schedulePickup")}</Button>}
        {(record.status === "approved" || record.status === "pickup_scheduled") && <Button onClick={() => void act("receive")}>{t("receive")}</Button>}
        {record.status === "received" && <Button onClick={() => void inspect()}>{t("completeInspection")}</Button>}
        {record.status === "inspected" && <Button onClick={() => void act("resolve")}>{t("resolve")}</Button>}
        {["rejected", "completed", "cancelled"].includes(record.status) && <span className="text-sm text-surface-foreground/50">{t("noActions")}</span>}
      </Card>
    </div>
  );
}
