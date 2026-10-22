"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import type { MediaRef } from "@clothing/shared/media";
import { useParams } from "next/navigation";
import { Link } from "../../../../../i18n/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { mediaImageLoader } from "../../../../../lib/media-image-loader";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";

interface LocalizedText {
  en?: string;
  bn?: string;
}
interface Category {
  id: string;
  name: LocalizedText;
}
interface OptionValue {
  id: string;
  value: LocalizedText;
  colorHex: string | null;
  position: number;
}
interface ProductOption {
  id: string;
  name: LocalizedText;
  type: "size" | "color" | "generic";
  position: number;
  values: OptionValue[];
}
interface Variant {
  id: string;
  sku: string;
  barcode: string | null;
  optionValueIds: string[];
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  weightGrams: number | null;
  isActive: boolean;
  position: number;
}
interface ProductMediaEntry {
  id: string;
  mediaId: string;
  optionValueId: string | null;
  position: number;
}
interface RelationEntry {
  id: string;
  relatedProductId: string;
  type: string;
  relatedProduct: { title: LocalizedText };
}
interface ProductVersion {
  id: string;
  createdAt: string;
}
interface Product {
  id: string;
  title: LocalizedText;
  slug: string;
  status: string;
  categoryId: string | null;
  tags: string[];
  options: ProductOption[];
  variants: Variant[];
  media: ProductMediaEntry[];
  relationsFrom: RelationEntry[];
}
interface MediaLibraryItem {
  id: string;
  originalName: string;
  mediaRef: MediaRef;
}

const STATUSES = ["draft", "active", "archived", "scheduled"] as const;
const OPTION_TYPES = ["size", "color", "generic"] as const;
const BULK_FIELDS = ["price", "compareAtPrice", "costPrice", "weightGrams", "isActive"] as const;

export default function ProductEditorPage() {
  const t = useTranslations("products");
  const tCatalog = useTranslations("catalog");
  const tCommon = useTranslations("common");
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [mediaLibrary, setMediaLibrary] = useState<MediaLibraryItem[]>([]);
  const [versions, setVersions] = useState<ProductVersion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [titleEn, setTitleEn] = useState("");
  const [titleBn, setTitleBn] = useState("");
  const [status, setStatus] = useState("draft");
  const [categoryId, setCategoryId] = useState("");
  const [tags, setTags] = useState("");

  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionType, setNewOptionType] = useState<(typeof OPTION_TYPES)[number]>("size");
  const [newValueByOption, setNewValueByOption] = useState<Record<string, string>>({});

  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set());
  const [bulkField, setBulkField] = useState<(typeof BULK_FIELDS)[number]>("price");
  const [bulkValue, setBulkValue] = useState("");

  const [selectedMediaId, setSelectedMediaId] = useState("");
  const [relatedProductId, setRelatedProductId] = useState("");
  const [relationType, setRelationType] = useState("similar");

  const load = useCallback(async () => {
    try {
      const [p, cats, versionsResult] = await Promise.all([
        api.get<Product>(`/admin/products/${productId}`),
        api.get<Category[]>("/admin/categories"),
        api.get<ProductVersion[]>(`/admin/products/${productId}/versions`),
      ]);
      setProduct(p);
      setCategories(cats);
      setVersions(versionsResult);
      setTitleEn(p.title.en ?? "");
      setTitleBn(p.title.bn ?? "");
      setStatus(p.status);
      setCategoryId(p.categoryId ?? "");
      setTags(p.tags.join(", "));
      const media = await api.get<MediaLibraryItem[]>("/admin/media");
      setMediaLibrary(media);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load product");
    }
  }, [productId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; load() is also reused to refetch after mutations below.
    void load();
  }, [load]);

  const mediaById = useMemo(() => new Map(mediaLibrary.map((m) => [m.id, m])), [mediaLibrary]);

  async function handleSave() {
    setError(null);
    try {
      await api.patch(`/admin/products/${productId}`, {
        title: { en: titleEn, bn: titleBn || undefined },
        status,
        categoryId: categoryId || null,
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      setSaved(true);
      await load();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save");
    }
  }

  async function handleAddOption() {
    if (!newOptionName) return;
    try {
      await api.post(`/admin/products/${productId}/options`, { name: { en: newOptionName }, type: newOptionType, position: product?.options.length ?? 0 });
      setNewOptionName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add option");
    }
  }

  async function handleRemoveOption(optionId: string) {
    try {
      await api.delete(`/admin/products/${productId}/options/${optionId}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove option");
    }
  }

  async function handleAddOptionValue(optionId: string) {
    const label = newValueByOption[optionId];
    if (!label) return;
    try {
      await api.post(`/admin/products/${productId}/options/${optionId}/values`, { value: { en: label } });
      setNewValueByOption((prev) => ({ ...prev, [optionId]: "" }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add value");
    }
  }

  async function handleRemoveOptionValue(optionId: string, valueId: string) {
    try {
      await api.delete(`/admin/products/${productId}/options/${optionId}/values/${valueId}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove value");
    }
  }

  async function handleGenerateVariants() {
    try {
      await api.post(`/admin/products/${productId}/variants/generate`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate variants");
    }
  }

  async function handleVariantField(variantId: string, field: string, value: string) {
    const payload: Record<string, unknown> =
      field === "isActive"
        ? { isActive: value === "true" }
        : field === "sku" || field === "barcode"
          ? { [field]: value || null }
          : { [field]: value === "" ? null : Number(value) };
    try {
      await api.patch(`/admin/products/${productId}/variants/${variantId}`, payload);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update variant");
    }
  }

  async function handleRemoveVariant(variantId: string) {
    try {
      await api.delete(`/admin/products/${productId}/variants/${variantId}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove variant");
    }
  }

  async function handleBulkFill() {
    if (selectedVariants.size === 0 || bulkValue === "") return;
    const value = bulkField === "isActive" ? bulkValue === "true" : Number(bulkValue);
    try {
      await api.patch(`/admin/products/${productId}/variants/bulk`, { variantIds: [...selectedVariants], field: bulkField, value });
      setSelectedVariants(new Set());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to bulk update");
    }
  }

  async function handleAddMedia() {
    if (!selectedMediaId) return;
    try {
      await api.post(`/admin/products/${productId}/media`, { mediaId: selectedMediaId });
      setSelectedMediaId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add media");
    }
  }

  async function handleRemoveMedia(entryId: string) {
    try {
      await api.delete(`/admin/products/${productId}/media/${entryId}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove media");
    }
  }

  async function handleAddRelation() {
    if (!relatedProductId) return;
    try {
      await api.post(`/admin/products/${productId}/relations`, { relatedProductId, type: relationType });
      setRelatedProductId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add relation");
    }
  }

  async function handleRemoveRelation(relationId: string) {
    try {
      await api.delete(`/admin/products/${productId}/relations/${relationId}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove relation");
    }
  }

  async function handleRestoreVersion(versionId: string) {
    try {
      await api.post(`/admin/products/${productId}/versions/${versionId}/restore`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to restore version");
    }
  }

  if (!product) {
    return (
      <div className="flex flex-col gap-4">
        {error && <Banner kind="error">{error}</Banner>}
        <p className="text-sm text-surface-foreground/60">{tCommon("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link href="/products" className="text-sm text-surface-foreground/60 hover:underline">
          ← {t("backToList")}
        </Link>
        {saved && <span className="text-sm text-success">{t("saved")}</span>}
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{product.title.en ?? product.slug}</h2>
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t("titleEn")} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          <TextField label={t("titleBn")} value={titleBn} onChange={(e) => setTitleBn(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("status")}</span>
            <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status${s.charAt(0).toUpperCase()}${s.slice(1)}` as never)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("category")}</span>
            <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{tCatalog("none")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.en ?? c.name.bn}
                </option>
              ))}
            </select>
          </label>
        </div>
        <TextField label={t("tags")} value={tags} onChange={(e) => setTags(e.target.value)} />
        <Button onClick={() => void handleSave()}>{tCommon("save")}</Button>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("optionsTitle")}</h2>
        {product.options.map((option) => (
          <div key={option.id} className="rounded-theme border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-surface-foreground">
                {option.name.en} <span className="text-surface-foreground/50">({option.type})</span>
              </span>
              <button onClick={() => void handleRemoveOption(option.id)} className="text-xs text-danger">
                {tCommon("delete")}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {option.values.map((value) => (
                <span key={value.id} className="flex items-center gap-1 rounded-theme bg-muted px-2 py-1 text-xs">
                  {value.value.en}
                  <button onClick={() => void handleRemoveOptionValue(option.id, value.id)} className="text-danger">
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                className="rounded-theme border border-border bg-surface px-2 py-1 text-xs"
                placeholder={t("addOptionValue")}
                value={newValueByOption[option.id] ?? ""}
                onChange={(e) => setNewValueByOption((prev) => ({ ...prev, [option.id]: e.target.value }))}
              />
              <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void handleAddOptionValue(option.id)}>
                {t("addOptionValue")}
              </Button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <input
            className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
            placeholder={t("optionName")}
            value={newOptionName}
            onChange={(e) => setNewOptionName(e.target.value)}
          />
          <select
            className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
            value={newOptionType}
            onChange={(e) => setNewOptionType(e.target.value as (typeof OPTION_TYPES)[number])}
          >
            {OPTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`optionType${type.charAt(0).toUpperCase()}${type.slice(1)}` as never)}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => void handleAddOption()}>
            {t("addOption")}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-surface-foreground">{t("variantsTitle")}</h2>
          <Button onClick={() => void handleGenerateVariants()}>{t("generateVariants")}</Button>
        </div>
        {product.options.length === 0 && <p className="text-xs text-surface-foreground/60">{t("freeSizeHint")}</p>}
        {product.variants.length === 0 ? (
          <p className="text-sm text-surface-foreground/60">{t("noVariants")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
                <th className="px-2 py-2"></th>
                <th className="px-2 py-2">{t("sku")}</th>
                <th className="px-2 py-2">{t("barcode")}</th>
                <th className="px-2 py-2">{t("price")}</th>
                <th className="px-2 py-2">{t("compareAtPrice")}</th>
                <th className="px-2 py-2">{t("costPrice")}</th>
                <th className="px-2 py-2">{t("weightGrams")}</th>
                <th className="px-2 py-2">{t("active")}</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => (
                <tr key={variant.id} className="border-b border-border last:border-0">
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={selectedVariants.has(variant.id)}
                      onChange={(e) =>
                        setSelectedVariants((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(variant.id);
                          else next.delete(variant.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="w-28 rounded-theme border border-border bg-surface px-2 py-1 text-xs"
                      defaultValue={variant.sku}
                      onBlur={(e) => void handleVariantField(variant.id, "sku", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      className="w-28 rounded-theme border border-border bg-surface px-2 py-1 text-xs"
                      defaultValue={variant.barcode ?? ""}
                      onBlur={(e) => void handleVariantField(variant.id, "barcode", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      className="w-24 rounded-theme border border-border bg-surface px-2 py-1 text-xs"
                      defaultValue={variant.price}
                      onBlur={(e) => void handleVariantField(variant.id, "price", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      className="w-24 rounded-theme border border-border bg-surface px-2 py-1 text-xs"
                      defaultValue={variant.compareAtPrice ?? ""}
                      onBlur={(e) => void handleVariantField(variant.id, "compareAtPrice", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      className="w-24 rounded-theme border border-border bg-surface px-2 py-1 text-xs"
                      defaultValue={variant.costPrice ?? ""}
                      onBlur={(e) => void handleVariantField(variant.id, "costPrice", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      className="w-20 rounded-theme border border-border bg-surface px-2 py-1 text-xs"
                      defaultValue={variant.weightGrams ?? ""}
                      onBlur={(e) => void handleVariantField(variant.id, "weightGrams", e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={variant.isActive}
                      onChange={(e) => void handleVariantField(variant.id, "isActive", String(e.target.checked))}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <button onClick={() => void handleRemoveVariant(variant.id)} className="text-xs text-danger">
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <span className="text-xs font-medium text-surface-foreground/70">{t("bulkFillTitle")}</span>
          <select className="rounded-theme border border-border bg-surface px-2 py-1 text-xs" value={bulkField} onChange={(e) => setBulkField(e.target.value as (typeof BULK_FIELDS)[number])}>
            {BULK_FIELDS.map((field) => (
              <option key={field} value={field}>
                {t(field as never)}
              </option>
            ))}
          </select>
          <input className="w-28 rounded-theme border border-border bg-surface px-2 py-1 text-xs" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void handleBulkFill()}>
            {t("bulkFillApply")}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("mediaTitle")}</h2>
        <div className="flex flex-wrap gap-3">
          {product.media.map((entry) => {
            const item = mediaById.get(entry.mediaId);
            return (
              <div key={entry.id} className="relative">
                {item ? (
                  <div className="relative h-20 w-20 overflow-hidden rounded-theme">
                    <Image loader={mediaImageLoader(item.mediaRef)} src={item.mediaRef.url} alt={item.originalName} fill sizes="80px" className="object-cover" />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-theme bg-muted text-[10px]">{entry.mediaId.slice(0, 6)}</div>
                )}
                <button onClick={() => void handleRemoveMedia(entry.id)} className="absolute -right-1 -top-1 rounded-full bg-danger px-1 text-xs text-white">
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={selectedMediaId} onChange={(e) => setSelectedMediaId(e.target.value)}>
            <option value="">—</option>
            {mediaLibrary.map((item) => (
              <option key={item.id} value={item.id}>
                {item.originalName}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => void handleAddMedia()}>
            {tCatalog("add")}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("relationsTitle")}</h2>
        <ul className="flex flex-col gap-1">
          {product.relationsFrom.map((relation) => (
            <li key={relation.id} className="flex items-center justify-between rounded-theme border border-border px-3 py-2 text-sm">
              <span>
                {relation.relatedProduct.title.en} <span className="text-surface-foreground/50">({relation.type})</span>
              </span>
              <button onClick={() => void handleRemoveRelation(relation.id)} className="text-xs text-danger">
                {tCommon("delete")}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <input
            className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
            placeholder="Product ID"
            value={relatedProductId}
            onChange={(e) => setRelatedProductId(e.target.value)}
          />
          <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={relationType} onChange={(e) => setRelationType(e.target.value)}>
            <option value="similar">similar</option>
            <option value="complete_the_look">complete_the_look</option>
            <option value="upsell">upsell</option>
            <option value="cross_sell">cross_sell</option>
          </select>
          <Button variant="secondary" onClick={() => void handleAddRelation()}>
            {tCatalog("add")}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("versionsTitle")}</h2>
        <ul className="flex flex-col gap-1">
          {versions.map((version) => (
            <li key={version.id} className="flex items-center justify-between rounded-theme border border-border px-3 py-2 text-sm">
              <span>{new Date(version.createdAt).toLocaleString()}</span>
              <button onClick={() => void handleRestoreVersion(version.id)} className="text-xs text-brand">
                {t("restore")}
              </button>
            </li>
          ))}
          {versions.length === 0 && <li className="text-sm text-surface-foreground/50">—</li>}
        </ul>
      </Card>
    </div>
  );
}
