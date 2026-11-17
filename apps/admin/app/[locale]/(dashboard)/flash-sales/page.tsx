"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { localized, type Localized } from "../../../../lib/format";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";
import { VariantPicker, variantLabel, type VariantOption } from "../../../../components/variant-picker";

interface FlashSaleItem {
  variantId: string;
  salePrice: number;
  stockCap: number | null;
  soldCount: number;
  variant?: { sku: string; product: { title: Localized } };
}

/** A row being added: the picked variant (shown by name) plus the sale price in taka and an optional quantity cap. */
interface DraftItem {
  variant: VariantOption;
  salePriceTaka: string;
  stockCap: string;
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
  const locale = useLocale();
  const [sales, setSales] = useState<FlashSale[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState("");
  const [nameBn, setNameBn] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);

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

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addVariant(variant: VariantOption) {
    setItems((prev) => (prev.some((i) => i.variant.id === variant.id) ? prev : [...prev, { variant, salePriceTaka: String(Math.round(variant.price / 100)), stockCap: "" }]));
  }

  const invalidItem = items.find((i) => !(Number(i.salePriceTaka) > 0) || Number(i.salePriceTaka) * 100 >= i.variant.price);

  async function handleCreate() {
    try {
      await api.post("/admin/flash-sales", {
        name: { en: nameEn, bn: nameBn || undefined },
        // datetime-local has no timezone; send the moment the owner meant in their own clock, not the server's (UTC on hosting).
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        status: "scheduled",
        items: items.map((i) => ({ variantId: i.variant.id, salePrice: Math.round(Number(i.salePriceTaka) * 100), stockCap: i.stockCap ? Number(i.stockCap) : undefined })),
      });
      setNameEn("");
      setNameBn("");
      setStartsAt("");
      setEndsAt("");
      setItems([]);
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
    if (!window.confirm(t("deleteConfirm"))) return;
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
                {localized(sale.name, locale)} <span className="text-xs text-surface-foreground/50">({t(`status_${sale.status}`)})</span>
              </span>
              <div className="flex items-center gap-3">
                <Toggle checked={sale.status !== "disabled"} onChange={() => void handleToggleStatus(sale)} />
                <button onClick={() => void handleDelete(sale.id)} className="text-xs text-danger">{tCommon("delete")}</button>
              </div>
            </div>
            <p className="mt-1 text-xs text-surface-foreground/50">{new Date(sale.startsAt).toLocaleString()} → {new Date(sale.endsAt).toLocaleString()}</p>
            <ul className="mt-2 flex flex-col gap-1 text-xs text-surface-foreground/70">
              {sale.items.map((item) => (
                <li key={item.variantId}>
                  {item.variant ? `${localized(item.variant.product.title, locale)} (${item.variant.sku})` : item.variantId} — ৳{(item.salePrice / 100).toLocaleString()} ·{" "}
                  {t("soldCount", { sold: item.soldCount, cap: item.stockCap ?? 0, hasCap: item.stockCap ? "yes" : "no" })}
                </li>
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
          <p className="text-xs text-surface-foreground/60">{t("itemsHint")}</p>
          {items.map((item, index) => (
            <div key={item.variant.id} className="flex flex-wrap items-end gap-2 rounded-theme border border-border p-2">
              <div className="flex min-w-60 flex-1 flex-col text-sm">
                <span className="text-surface-foreground">{variantLabel(item.variant, locale)}</span>
                <span className="text-xs text-surface-foreground/60">{t("regularPrice", { price: (item.variant.price / 100).toLocaleString() })}</span>
              </div>
              <TextField label={t("salePrice")} type="number" min={1} value={item.salePriceTaka} onChange={(e) => updateItem(index, { salePriceTaka: e.target.value })} />
              <TextField label={t("stockCap")} type="number" min={1} value={item.stockCap} placeholder={t("stockCapPlaceholder")} onChange={(e) => updateItem(index, { stockCap: e.target.value })} />
              <button type="button" className="pb-2 text-xs text-danger" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}>
                {tCommon("delete")}
              </button>
            </div>
          ))}
          <VariantPicker onPick={addVariant} placeholder={t("addItem")} />
          {invalidItem && <span className="text-xs text-danger">{t("priceMustBeLower")}</span>}
          <Button onClick={() => void handleCreate()} disabled={!nameEn || !startsAt || !endsAt || items.length === 0 || Boolean(invalidItem)} className="self-start">
            {t("add")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
