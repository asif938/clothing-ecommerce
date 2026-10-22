"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../components/ui";

interface LocalizedText {
  en?: string;
  bn?: string;
}
interface Collection {
  id: string;
  name: LocalizedText;
  slug: string;
  type: "manual" | "automatic";
}
interface CollectionDetail extends Collection {
  rules: { match: "all" | "any"; conditions: { field: string; op: string; value: unknown }[] } | null;
  products: { id: string; title: LocalizedText }[];
}

export default function CollectionsPage() {
  const t = useTranslations("collections");
  const tCommon = useTranslations("common");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<CollectionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState("");
  const [type, setType] = useState<"manual" | "automatic">("manual");
  const [productId, setProductId] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  async function load() {
    try {
      setCollections(await api.get<Collection[]>("/admin/collections"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load collections");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function openCollection(id: string) {
    try {
      setSelected(await api.get<CollectionDetail>(`/admin/collections/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load collection");
    }
  }

  async function handleCreate() {
    try {
      await api.post("/admin/collections", { name: { en: nameEn }, type });
      setNameEn("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create collection");
    }
  }

  async function handleAddProduct() {
    if (!selected || !productId) return;
    try {
      await api.post(`/admin/collections/${selected.id}/products`, { productId });
      setProductId("");
      await openCollection(selected.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add product");
    }
  }

  async function handleRemoveProduct(prodId: string) {
    if (!selected) return;
    try {
      await api.delete(`/admin/collections/${selected.id}/products/${prodId}`);
      await openCollection(selected.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove product");
    }
  }

  async function handlePreview() {
    if (!selected?.rules) return;
    try {
      const result = await api.post<{ count: number }>("/admin/collections/preview", { rules: selected.rules });
      setPreviewCount(result.count);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to preview");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1">
          {collections.map((collection) => (
            <li
              key={collection.id}
              onClick={() => void openCollection(collection.id)}
              className="flex cursor-pointer items-center justify-between rounded-theme border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <span>{collection.name.en ?? collection.slug}</span>
              <span className="text-xs text-surface-foreground/50">{collection.type === "manual" ? t("typeManual") : t("typeAutomatic")}</span>
            </li>
          ))}
          {collections.length === 0 && <li className="text-sm text-surface-foreground/50">—</li>}
        </ul>
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <TextField label={t("add")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value as "manual" | "automatic")}>
            <option value="manual">{t("typeManual")}</option>
            <option value="automatic">{t("typeAutomatic")}</option>
          </select>
          <Button onClick={() => void handleCreate()} disabled={!nameEn}>
            {tCommon("create")}
          </Button>
        </div>
      </Card>

      {selected && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-surface-foreground">{selected.name.en}</h2>
          {selected.type === "automatic" ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-surface-foreground/60">{t("rulesTitle")}: {JSON.stringify(selected.rules)}</p>
              <Button variant="secondary" className="self-start" onClick={() => void handlePreview()}>
                {t("previewCount")}
              </Button>
              {previewCount !== null && <p className="text-sm text-surface-foreground/70">{t("matchingCount", { count: previewCount })}</p>}
            </div>
          ) : (
            <>
              <h3 className="text-sm font-medium text-surface-foreground">{t("productsTitle")}</h3>
              <ul className="flex flex-col gap-1">
                {selected.products.map((product) => (
                  <li key={product.id} className="flex items-center justify-between rounded-theme border border-border px-3 py-2 text-sm">
                    <span>{product.title.en}</span>
                    <button onClick={() => void handleRemoveProduct(product.id)} className="text-xs text-danger">
                      {tCommon("delete")}
                    </button>
                  </li>
                ))}
                {selected.products.length === 0 && <li className="text-sm text-surface-foreground/50">—</li>}
              </ul>
              <div className="flex items-end gap-2">
                <TextField label={t("addProduct")} value={productId} onChange={(e) => setProductId(e.target.value)} />
                <Button variant="secondary" onClick={() => void handleAddProduct()}>
                  {tCommon("create")}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
