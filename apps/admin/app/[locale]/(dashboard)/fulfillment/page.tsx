"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card } from "../../../../components/ui";

interface PickListLine {
  variantId: string;
  sku: string;
  title: { en?: string; bn?: string };
  binLocation: string | null;
  totalQuantity: number;
  orders: { orderId: string; orderNumber: string; quantity: number }[];
}

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  items: { id: string; sku: string; quantity: number; title: { en?: string; bn?: string } }[];
}

interface Shipment {
  id: string;
  trackingCode: string | null;
  codAmount: number;
  courierDriver: string;
  order: { orderNumber: string; shippingAddress: { recipientName?: string } };
}

type Tab = "pick" | "pack" | "handover";

export default function FulfillmentPage() {
  const t = useTranslations("fulfillment");
  const [tab, setTab] = useState<Tab>("pick");
  const [error, setError] = useState<string | null>(null);

  const [pickList, setPickList] = useState<{ groupBy: string; lines: PickListLine[] } | null>(null);
  const [barcode, setBarcode] = useState("");
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [itemScan, setItemScan] = useState("");
  const [manifest, setManifest] = useState<{ totalCod: number; shipments: Shipment[] } | null>(null);

  function reportError(err: unknown, fallback: string) {
    setError(err instanceof ApiError ? err.message : fallback);
  }

  useEffect(() => {
    if (tab !== "pick") return;
    void api.get<{ groupBy: string; lines: PickListLine[] }>("/admin/fulfillment/pick-list").then(setPickList).catch((err) => reportError(err, "Failed to load pick list"));
  }, [tab]);

  useEffect(() => {
    if (tab !== "handover") return;
    void api.get<{ totalCod: number; shipments: Shipment[] }>("/admin/fulfillment/handover-manifest").then(setManifest).catch((err) => reportError(err, "Failed to load manifest"));
  }, [tab]);

  async function loadOrder() {
    setError(null);
    try {
      const found = await api.get<OrderSummary>(`/admin/fulfillment/orders/by-barcode/${encodeURIComponent(barcode)}`);
      if (found.status === "confirmed") {
        await api.post(`/admin/fulfillment/orders/${found.id}/start-processing`);
        found.status = "processing";
      }
      setOrder(found);
      setScanned({});
    } catch (err) {
      reportError(err, "Order not found");
    }
  }

  function scanItem() {
    if (!order) return;
    const item = order.items.find((i) => i.sku === itemScan);
    if (!item) {
      setError(t("itemNotOnOrder"));
      return;
    }
    setScanned((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }));
    setItemScan("");
  }

  async function completePacking() {
    if (!order) return;
    setError(null);
    try {
      await api.post(`/admin/fulfillment/orders/${order.id}/complete-packing`, {
        scannedItems: order.items.map((i) => ({ orderItemId: i.id, scannedQuantity: scanned[i.id] ?? 0 })),
      });
      setOrder(null);
      setBarcode("");
    } catch (err) {
      reportError(err, "Packing failed");
    }
  }

  async function markHandedOver(shipmentId: string) {
    try {
      await api.post("/admin/fulfillment/handover-manifest/mark-handed-over", { shipmentIds: [shipmentId] });
      setManifest(await api.get<{ totalCod: number; shipments: Shipment[] }>("/admin/fulfillment/handover-manifest"));
    } catch (err) {
      reportError(err, "Failed to mark handed over");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <div className="flex gap-2">
        {(["pick", "pack", "handover"] as const).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`rounded-theme px-4 py-2 text-sm ${tab === tabKey ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground"}`}
          >
            {t(`tabs.${tabKey}`)}
          </button>
        ))}
      </div>

      {tab === "pick" && (
        <Card className="p-0 print:shadow-none">
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-surface-foreground/70">{t("groupedBy")}: {pickList?.groupBy ?? "—"}</span>
            <Button onClick={() => window.print()}>{t("print")}</Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
                <th className="px-4 py-3">{t("sku")}</th>
                <th className="px-4 py-3">{t("bin")}</th>
                <th className="px-4 py-3">{t("totalQty")}</th>
                <th className="px-4 py-3">{t("orders")}</th>
              </tr>
            </thead>
            <tbody>
              {pickList?.lines.map((line) => (
                <tr key={line.variantId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-surface-foreground">{line.sku}</td>
                  <td className="px-4 py-3 text-surface-foreground/70">{line.binLocation ?? "—"}</td>
                  <td className="px-4 py-3 font-semibold text-surface-foreground">{line.totalQuantity}</td>
                  <td className="px-4 py-3 text-surface-foreground/70">{line.orders.map((o) => o.orderNumber).join(", ")}</td>
                </tr>
              ))}
              {(!pickList || pickList.lines.length === 0) && (
                <tr>
                  <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={4}>
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "pack" && (
        <div className="flex flex-col gap-4">
          {!order ? (
            <Card className="flex gap-3">
              <input
                autoFocus
                className="flex-1 rounded-theme border border-border bg-surface px-3 py-2 text-sm"
                placeholder={t("scanOrderBarcode")}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadOrder()}
              />
              <Button onClick={() => void loadOrder()}>{t("load")}</Button>
            </Card>
          ) : (
            <Card className="flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-surface-foreground">{t("packing")}: {order.orderNumber}</h2>
              <input
                autoFocus
                className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
                placeholder={t("scanItemBarcode")}
                value={itemScan}
                onChange={(e) => setItemScan(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && scanItem()}
              />
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
                    <th className="py-2">{t("sku")}</th>
                    <th className="py-2">{t("expected")}</th>
                    <th className="py-2">{t("scanned")}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="py-2 text-surface-foreground">{item.sku}</td>
                      <td className="py-2 text-surface-foreground/70">{item.quantity}</td>
                      <td className={`py-2 font-semibold ${(scanned[item.id] ?? 0) === item.quantity ? "text-success" : "text-surface-foreground"}`}>{scanned[item.id] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-2">
                <Button onClick={() => void completePacking()}>{t("completePacking")}</Button>
                <Button variant="secondary" onClick={() => setOrder(null)}>
                  {t("cancel")}
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "handover" && (
        <Card className="p-0">
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-surface-foreground/70">{t("totalCod")}: ৳{((manifest?.totalCod ?? 0) / 100).toFixed(2)}</span>
            <Button onClick={() => window.print()}>{t("print")}</Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
                <th className="px-4 py-3">{t("order")}</th>
                <th className="px-4 py-3">{t("courier")}</th>
                <th className="px-4 py-3">{t("trackingCode")}</th>
                <th className="px-4 py-3">{t("cod")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {manifest?.shipments.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-surface-foreground">{s.order.orderNumber}</td>
                  <td className="px-4 py-3 text-surface-foreground/70">{s.courierDriver}</td>
                  <td className="px-4 py-3 font-mono text-surface-foreground/70">{s.trackingCode ?? "—"}</td>
                  <td className="px-4 py-3 text-surface-foreground">৳{(s.codAmount / 100).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right print:hidden">
                    <Button onClick={() => void markHandedOver(s.id)}>{t("markHandedOver")}</Button>
                  </td>
                </tr>
              ))}
              {(!manifest || manifest.shipments.length === 0) && (
                <tr>
                  <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={5}>
                    {t("empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
