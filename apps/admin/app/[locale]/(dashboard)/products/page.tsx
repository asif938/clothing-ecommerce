"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "../../../../i18n/navigation";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../components/ui";

interface ProductListItem {
  id: string;
  title: { en?: string; bn?: string };
  slug: string;
  status: string;
  category: { name: { en?: string; bn?: string } } | null;
  variants: { id: string; price: number; isActive: boolean }[];
}

export default function ProductsPage() {
  const t = useTranslations("products");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [titleEn, setTitleEn] = useState("");
  const [titleBn, setTitleBn] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const result = await api.get<{ data: ProductListItem[]; meta: { total: number } }>("/admin/products?pageSize=50");
      setItems(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load products");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)));
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0 || !window.confirm(t("bulkDeleteConfirm", { count: ids.length }))) return;
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.post<{ deleted: number; failed: { id: string; message: string }[] }>("/admin/products/bulk-delete", { ids });
      setNotice(t("bulkDeleted", { count: result.deleted }));
      if (result.failed.length > 0) setError(t("bulkDeleteFailed", { count: result.failed.length }));
      setSelected(new Set(result.failed.map((f) => f.id)));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete products");
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreate() {
    setError(null);
    try {
      const product = await api.post<{ id: string }>("/admin/products", { title: { en: titleEn, bn: titleBn || undefined } });
      router.push(`/products/${product.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create product");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <Button onClick={() => setCreating((v) => !v)}>{t("add")}</Button>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-theme border border-border bg-muted px-4 py-2">
          <span className="text-sm text-surface-foreground">{t("selectedCount", { count: selected.size })}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setSelected(new Set())} disabled={deleting}>
              {tCommon("cancel")}
            </Button>
            <Button variant="danger" onClick={() => void handleBulkDelete()} disabled={deleting}>
              {t("deleteSelected")}
            </Button>
          </div>
        </div>
      )}

      {creating && (
        <Card className="flex flex-col gap-3">
          <TextField label={t("titleEn")} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          <TextField label={t("titleBn")} value={titleBn} onChange={(e) => setTitleBn(e.target.value)} />
          <Button onClick={() => void handleCreate()} disabled={!titleEn}>
            {tCommon("create")}
          </Button>
        </Card>
      )}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t("selectAll")} />
              </th>
              <th className="px-4 py-3">{t("titleEn")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3">{t("category")}</th>
              <th className="px-4 py-3">{t("variantsTitle")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-muted"
                onClick={() => router.push(`/products/${item.id}`)}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleOne(item.id)} aria-label={t("selectRow")} />
                </td>
                <td className="px-4 py-3 text-surface-foreground">{item.title.en ?? item.title.bn ?? item.slug}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{item.status}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{item.category?.name.en ?? "—"}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{item.variants.length}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={5}>
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
