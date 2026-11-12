"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "../../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../../lib/api";
import { localized, shortDate } from "../../../../../../lib/format";
import { Banner, Button, Card, TextField } from "../../../../../../components/ui";

interface Transfer {
  id: string;
  number: string;
  status: "draft" | "in_transit" | "received" | "cancelled";
  note: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  fromLocation: { name: string };
  toLocation: { name: string };
  items: { id: string; variantId: string; quantity: number; quantityReceived: number; variant: { sku: string; product: { title: { bn?: string; en?: string } } } }[];
}

/** One stock transfer: dispatch, receive (with shortfalls), cancel. */
export default function TransferDetailPage() {
  const t = useTranslations("stockOps");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const params = useParams<{ id: string }>();
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Transfer>(`/admin/inventory/transfers/${params.id}`);
      setTransfer(data);
      setReceived(Object.fromEntries(data.items.map((i) => [i.variantId, String(i.quantity)])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [params.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  async function act(action: "dispatch" | "cancel" | "receive") {
    if (action === "cancel" && !window.confirm(t("cancelTransferConfirm"))) return;
    setError(null);
    try {
      const body =
        action === "receive"
          ? { lines: Object.entries(received).map(([variantId, qty]) => ({ variantId, quantity: Math.max(0, Number.parseInt(qty || "0", 10)) })), note: note || null }
          : undefined;
      setTransfer(await api.post<Transfer>(`/admin/inventory/transfers/${params.id}/${action}`, body));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    }
  }

  if (!transfer) return error ? <Banner kind="error">{error}</Banner> : <p className="text-sm text-surface-foreground/60">{tCommon("loading")}</p>;
  const inTransit = transfer.status === "in_transit";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/inventory/transfers" className="text-sm text-brand hover:underline">
        ← {t("transfersTitle")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-mono text-2xl font-semibold text-surface-foreground">{transfer.number}</h1>
          <p className="text-sm text-surface-foreground/60">
            {transfer.fromLocation.name} → {transfer.toLocation.name} · {t(`transferStatus_${transfer.status}`)}
          </p>
          <p className="text-xs text-surface-foreground/50">
            {t("dispatched")}: {shortDate(transfer.shippedAt)} · {t("receivedOn")}: {shortDate(transfer.receivedAt)}
          </p>
          {transfer.note && <p className="mt-1 text-sm text-surface-foreground/80">{transfer.note}</p>}
        </div>
        <div className="flex gap-2">
          {transfer.status === "draft" && <Button onClick={() => void act("dispatch")}>{t("dispatch")}</Button>}
          {(transfer.status === "draft" || inTransit) && (
            <Button variant="secondary" onClick={() => void act("cancel")}>
              {t("cancelTransfer")}
            </Button>
          )}
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {transfer.status === "draft" && <Banner kind="info">{t("dispatchHint")}</Banner>}

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-surface-foreground/50">
              <th className="py-2 pr-4">{t("product")}</th>
              <th className="py-2 pr-4">SKU</th>
              <th className="py-2 pr-4">{t("sent")}</th>
              <th className="py-2 pr-4">{inTransit ? t("receivedNow") : t("receivedCol")}</th>
            </tr>
          </thead>
          <tbody>
            {transfer.items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-4 text-surface-foreground">{localized(item.variant.product.title, locale)}</td>
                <td className="py-2 pr-4 font-mono text-surface-foreground/80">{item.variant.sku}</td>
                <td className="py-2 pr-4 text-surface-foreground/80">{item.quantity}</td>
                <td className="py-2 pr-4">
                  {inTransit ? (
                    <input
                      type="number"
                      min={0}
                      max={item.quantity}
                      value={received[item.variantId] ?? ""}
                      onChange={(e) => setReceived({ ...received, [item.variantId]: e.target.value })}
                      className="w-24 rounded-theme border border-border bg-surface px-2 py-1 text-sm text-surface-foreground"
                    />
                  ) : (
                    <span className={transfer.status === "received" && item.quantityReceived < item.quantity ? "text-danger" : "text-surface-foreground/80"}>
                      {transfer.status === "received" ? item.quantityReceived : "—"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {inTransit && (
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-surface-foreground/60">{t("receiveTransferHint")}</p>
          <TextField label={t("note")} value={note} onChange={(e) => setNote(e.target.value)} />
          <div>
            <Button onClick={() => void act("receive")}>{t("receiveTransfer")}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
