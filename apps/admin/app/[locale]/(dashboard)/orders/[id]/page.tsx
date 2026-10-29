"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card } from "../../../../../components/ui";

interface OrderItem {
  id: string;
  variantId: string;
  sku: string;
  title: { en?: string; bn?: string };
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  fulfilledQty: number;
  returnedQty: number;
  rejectedQty: number;
}
interface OrderEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  actor: { type: string; id?: string } | null;
  createdAt: string;
}
interface Payment {
  id: string;
  method: string;
  purpose: string;
  amount: number;
  status: string;
  externalRef: string | null;
}
interface Refund {
  id: string;
  amount: number;
  method: string;
  status: string;
  reason: string | null;
}
interface Shipment {
  id: string;
  status: string;
  trackingCode: string | null;
  trackingUrl: string | null;
  courierDriver: string;
  events: { status: string; occurredAt: string; message: string | null }[];
}
interface ReturnRow {
  id: string;
  type: string;
  status: string;
}
interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  riskLevel: string;
  riskScore: number;
  riskReasonCodes: string[];
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  total: number;
  paidTotal: number;
  codAmount: number;
  tags: string[];
  assignedTo: string | null;
  possibleDuplicateOrderIds: string[];
  customerNote: string | null;
  shippingAddress: { recipientName?: string; phone?: string; addressLine?: string; landmark?: string };
  billingContact: { name?: string; phone?: string; email?: string };
  items: OrderItem[];
  events: OrderEvent[];
  payments: Payment[];
  refunds: Refund[];
  shipments: Shipment[];
  returns: ReturnRow[];
}

function money(poisha: number) {
  return `৳${(poisha / 100).toFixed(2)}`;
}

const CALL_OUTCOMES = ["no_answer", "confirmed", "call_later", "wrong_number", "cancelled"];

export default function OrderDetailPage() {
  const t = useTranslations("orders");
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [courier, setCourier] = useState<{ instanceId: string | null; driver: string; label: string }[]>([]);
  const [selectedCourier, setSelectedCourier] = useState("");
  const [manualTrackingCode, setManualTrackingCode] = useState("");

  async function load() {
    try {
      setOrder(await api.get<OrderDetail>(`/admin/orders/${params.id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load order");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
    void api.get<{ instanceId: string | null; driver: string; label: string }[]>("/admin/couriers/available").then(setCourier).catch(() => undefined);
  }, []);

  async function act(path: string, body?: unknown, method: "post" | "patch" = "post") {
    setError(null);
    try {
      await (method === "post" ? api.post(path, body) : api.patch(path, body));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    }
  }

  async function transition(to: string) {
    const reason = ["on_hold", "cancelled"].includes(to) ? window.prompt(t("reasonPrompt")) : null;
    if (["on_hold", "cancelled"].includes(to) && !reason) return;
    await act(`/admin/orders/${params.id}/transition`, { to, reason });
  }

  async function addNote() {
    if (!note.trim()) return;
    await act(`/admin/orders/${params.id}/notes`, { note });
    setNote("");
  }

  async function addTag() {
    if (!order || !tagInput.trim()) return;
    await act(`/admin/orders/${params.id}/tags`, { tags: [...order.tags, tagInput.trim()] }, "patch");
    setTagInput("");
  }

  async function bookShipment() {
    await act(`/admin/orders/${params.id}/shipments`, { courierProviderInstanceId: selectedCourier || null, manualTrackingCode: selectedCourier ? null : manualTrackingCode, manualCourierName: selectedCourier ? null : "Manual" });
  }

  if (!order) {
    return (
      <div className="flex flex-col gap-4">
        {error && <Banner kind="error">{error}</Banner>}
        <p className="text-sm text-surface-foreground/50">…</p>
      </div>
    );
  }

  const canConfirm = order.status === "pending";
  const canHold = ["pending", "confirmed", "on_hold", "processing"].includes(order.status);
  const canCancel = ["pending_payment", "pending", "confirmed", "on_hold", "processing", "packed"].includes(order.status);
  const canBookShipment = order.status === "packed";
  const canEdit = ["pending_payment", "pending", "confirmed", "on_hold", "processing", "packed"].includes(order.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-surface-foreground">{order.orderNumber}</h1>
        <div className="flex items-center gap-2">
          <span className="rounded-theme bg-muted px-3 py-1 text-xs font-medium text-surface-foreground">{t(`status.${order.status}`)}</span>
          <span className={`rounded-theme px-3 py-1 text-xs font-medium ${order.riskLevel === "high" ? "bg-danger/10 text-danger" : order.riskLevel === "medium" ? "bg-warning/10 text-warning" : "bg-muted text-surface-foreground/70"}`}>
            {t("risk")}: {order.riskLevel} ({order.riskScore})
          </span>
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {order.possibleDuplicateOrderIds.length > 0 && (
        <Banner kind="warning">
          {t("duplicateWarning")}:{" "}
          {order.possibleDuplicateOrderIds.map((id) => (
            <Link key={id} href={`/orders/${id}`} className="underline">
              {id}{" "}
            </Link>
          ))}
        </Banner>
      )}

      <div className="flex flex-wrap gap-2">
        {canConfirm && <Button onClick={() => void transition("confirmed")}>{t("actions.confirm")}</Button>}
        {canHold && <Button variant="secondary" onClick={() => void transition("on_hold")}>{t("actions.hold")}</Button>}
        {order.status === "on_hold" && <Button onClick={() => void transition("pending")}>{t("actions.releaseHold")}</Button>}
        {canCancel && <Button variant="danger" onClick={() => void transition("cancelled")}>{t("actions.cancel")}</Button>}
        {canEdit && (
          <Link href={`/orders/${order.id}/edit`}>
            <Button variant="secondary">{t("actions.edit")}</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-surface-foreground">{t("items")}</h2>
          <table className="w-full text-sm">
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="py-2 text-surface-foreground">{item.title.en ?? item.title.bn ?? item.sku}</td>
                  <td className="py-2 text-surface-foreground/70">×{item.quantity}</td>
                  <td className="py-2 text-right text-surface-foreground">{money(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-col gap-1 text-sm text-surface-foreground/70">
            <div className="flex justify-between"><span>{t("subtotal")}</span><span>{money(order.subtotal)}</span></div>
            <div className="flex justify-between"><span>{t("discount")}</span><span>-{money(order.discountTotal)}</span></div>
            <div className="flex justify-between"><span>{t("shippingFee")}</span><span>{money(order.shippingFee)}</span></div>
            <div className="flex justify-between font-semibold text-surface-foreground"><span>{t("total")}</span><span>{money(order.total)}</span></div>
            <div className="flex justify-between"><span>{t("paid")}</span><span>{money(order.paidTotal)}</span></div>
            <div className="flex justify-between"><span>{t("cod")}</span><span>{money(order.codAmount)}</span></div>
          </div>
        </Card>

        <Card className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-surface-foreground">{t("addressAndContact")}</h2>
          <p className="text-sm text-surface-foreground">{order.shippingAddress.recipientName}</p>
          <p className="text-sm text-surface-foreground/70">{order.shippingAddress.phone}</p>
          <p className="text-sm text-surface-foreground/70">{order.shippingAddress.addressLine}{order.shippingAddress.landmark ? `, ${order.shippingAddress.landmark}` : ""}</p>
          {order.customerNote && <p className="text-sm text-surface-foreground/70">{t("customerNote")}: {order.customerNote}</p>}
          <div className="mt-2 flex flex-wrap gap-1">
            {order.tags.map((tag) => (
              <span key={tag} className="rounded bg-muted px-2 py-0.5 text-xs text-surface-foreground">{tag}</span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="flex-1 rounded-theme border border-border bg-surface px-2 py-1 text-xs" placeholder={t("addTag")} value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addTag()} />
            <Button onClick={() => void addTag()}>{t("addTag")}</Button>
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-surface-foreground">{t("payments")}</h2>
        {order.payments.map((p) => (
          <div key={p.id} className="flex justify-between text-sm text-surface-foreground/70">
            <span>{p.method} · {p.purpose} · {p.status}{p.externalRef ? ` · ${p.externalRef}` : ""}</span>
            <span>{money(p.amount)}</span>
          </div>
        ))}
        {order.refunds.map((r) => (
          <div key={r.id} className="flex justify-between text-sm text-warning">
            <span>{t("refund")}: {r.method} · {r.status}{r.reason ? ` · ${r.reason}` : ""}</span>
            <span>{money(r.amount)}</span>
          </div>
        ))}
        {order.payments.length === 0 && order.refunds.length === 0 && <p className="text-sm text-surface-foreground/50">—</p>}
      </Card>

      {order.returns.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-surface-foreground">{t("returns")}</h2>
          {order.returns.map((r) => (
            <Link key={r.id} href={`/returns/${r.id}`} className="text-sm text-surface-foreground underline">
              {r.type} · {r.status}
            </Link>
          ))}
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-surface-foreground">{t("shipments")}</h2>
        {order.shipments.map((s) => (
          <div key={s.id} className="flex flex-col gap-1 border-b border-border pb-2 last:border-0">
            <div className="flex justify-between text-sm text-surface-foreground">
              <span>{s.courierDriver} · {s.trackingCode ?? "—"}</span>
              <span className="font-medium">{s.status}</span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-surface-foreground/50">
              {s.events.map((e, i) => (
                <span key={i}>{e.status}{i < s.events.length - 1 ? " →" : ""}</span>
              ))}
            </div>
          </div>
        ))}
        {canBookShipment && (
          <div className="flex flex-wrap items-end gap-2">
            <select value={selectedCourier} onChange={(e) => setSelectedCourier(e.target.value)} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
              <option value="">{t("manual")}</option>
              {courier.filter((c) => c.instanceId).map((c) => (
                <option key={c.instanceId} value={c.instanceId!}>{c.driver}</option>
              ))}
            </select>
            {!selectedCourier && (
              <input className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" placeholder={t("trackingCode")} value={manualTrackingCode} onChange={(e) => setManualTrackingCode(e.target.value)} />
            )}
            <Button onClick={() => void bookShipment()}>{t("bookShipment")}</Button>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-surface-foreground">{t("timeline")}</h2>
        <div className="flex flex-col gap-2 text-sm">
          {order.events.map((e) => (
            <div key={e.id} className="flex justify-between border-b border-border pb-1 last:border-0">
              <span className="text-surface-foreground">{e.type}: {JSON.stringify(e.data)}</span>
              <span className="text-xs text-surface-foreground/50">{new Date(e.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="flex-1 rounded-theme border border-border bg-surface px-3 py-2 text-sm" placeholder={t("addNote")} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addNote()} />
          <Button onClick={() => void addNote()}>{t("addNote")}</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {CALL_OUTCOMES.map((outcome) => (
            <Button key={outcome} variant="secondary" onClick={() => void act(`/admin/orders/${params.id}/call-outcomes`, { outcome })}>
              {t(`callOutcomes.${outcome}`)}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
