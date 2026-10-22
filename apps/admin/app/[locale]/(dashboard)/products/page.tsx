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
                <td className="px-4 py-3 text-surface-foreground">{item.title.en ?? item.title.bn ?? item.slug}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{item.status}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{item.category?.name.en ?? "—"}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{item.variants.length}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={4}>
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
