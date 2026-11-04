"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";

interface FlashSaleItem {
  variantId: string;
  salePrice: number;
  stockCap: number | null;
  soldCount: number;
}
interface FlashSale {
  id: string;
  name: { bn?: string; en?: string };
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "active" | "ended" | "disabled";
  items: FlashSaleItem[];
}

/** Flash sales UI (docs/PROJECT_SPEC.md §16 M8) — the M5 engine (countdown/stock-cap evaluation in `CartPricingService`) already exists; this is its admin CRUD. */
export default function FlashSalesPage() {
  const t = useTranslations("flashSales");
  const tCommon = useTranslations("common");
  const [sales, setSales] = useState<FlashSale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState("");
  const [nameBn, setNameBn] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [items, setItems] = useState<{ variantId: string; salePrice: string; stockCap: string }[]>([{ variantId: "", salePrice: "0", stockCap: "" }]);

  async function load() {
    try {
      setSales(await api.get<FlashSale[]>("/admin/flash-sales"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load flash sales");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  function updateItem(index: number, patch: Partial<{ variantId: string; salePrice: string; stockCap: string }>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function handleCreate() {
    try {
      await api.post("/admin/flash-sales", {
        name: { en: nameEn, bn: nameBn || undefined },
        startsAt,
        endsAt,
        status: "scheduled",
        items: items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId, salePrice: Number(i.salePrice), stockCap: i.stockCap ? Number(i.stockCap) : undefined })),
      });
      setNameEn("");
      setNameBn("");
      setStartsAt("");
      setEndsAt("");
      setItems([{ variantId: "", salePrice: "0", stockCap: "" }]);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create flash sale");
    }
  }

  async function handleToggleStatus(sale: FlashSale) {
    try {
      await api.patch(`/admin/flash-sales/${sale.id}`, { status: sale.status === "disabled" ? "scheduled" : "disabled" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update flash sale");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/admin/flash-sales/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete flash sale");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        {sales.map((sale) => (
          <div key={sale.id} className="rounded-theme border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-surface-foreground">
                {sale.name.en ?? sale.name.bn} <span className="text-xs text-surface-foreground/50">({sale.status})</span>
              </span>
              <div className="flex items-center gap-3">
                <Toggle checked={sale.status !== "disabled"} onChange={() => void handleToggleStatus(sale)} />
                <button onClick={() => void handleDelete(sale.id)} className="text-xs text-danger">{tCommon("delete")}</button>
              </div>
            </div>
            <p className="mt-1 text-xs text-surface-foreground/50">{new Date(sale.startsAt).toLocaleString()} → {new Date(sale.endsAt).toLocaleString()}</p>
            <ul className="mt-2 flex flex-col gap-1 text-xs text-surface-foreground/70">
              {sale.items.map((item) => (
                <li key={item.variantId}>{item.variantId}: {(item.salePrice / 100).toFixed(2)} ({item.soldCount}{item.stockCap ? `/${item.stockCap}` : ""} sold)</li>
              ))}
            </ul>
          </div>
        ))}
        {sales.length === 0 && <p className="text-sm text-surface-foreground/50">—</p>}

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <TextField label={t("nameEn")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            <TextField label={t("nameBn")} value={nameBn} onChange={(e) => setNameBn(e.target.value)} />
            <TextField label={t("startsAt")} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            <TextField label={t("endsAt")} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
          <h3 className="text-sm font-medium text-surface-foreground">{t("items")}</h3>
          {items.map((item, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <TextField label={t("variantId")} value={item.variantId} onChange={(e) => updateItem(index, { variantId: e.target.value })} />
              <TextField label={t("salePrice")} type="number" value={item.salePrice} onChange={(e) => updateItem(index, { salePrice: e.target.value })} />
              <TextField label={t("stockCap")} type="number" value={item.stockCap} onChange={(e) => updateItem(index, { stockCap: e.target.value })} />
            </div>
          ))}
          <Button variant="secondary" onClick={() => setItems((prev) => [...prev, { variantId: "", salePrice: "0", stockCap: "" }])} className="self-start">
            + {t("addItem")}
          </Button>
          <Button onClick={() => void handleCreate()} disabled={!nameEn || !startsAt || !endsAt} className="self-start">{t("add")}</Button>
        </div>
      </Card>
    </div>
  );
}
