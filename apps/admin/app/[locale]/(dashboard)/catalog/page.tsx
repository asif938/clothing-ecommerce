"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../components/ui";

interface LocalizedText {
  en?: string;
  bn?: string;
}
interface Category {
  id: string;
  name: LocalizedText;
  slug: string;
  parentId: string | null;
  sortOrder: number;
}
interface AttributeValue {
  id: string;
  value: LocalizedText;
}
interface Attribute {
  id: string;
  code: string;
  name: LocalizedText;
  type: string;
  values: AttributeValue[];
}
interface SizeSystem {
  id: string;
  name: LocalizedText;
  type: string;
  values: { code: string; label: LocalizedText }[];
}
interface SizeChart {
  id: string;
  name: LocalizedText;
  unitDefault: string;
  columns: { key: string; label: LocalizedText }[];
  rows: { size: string; measurements: Record<string, number> }[];
}

const TABS = ["categories", "attributes", "sizeSystems", "sizeCharts"] as const;

function CategoriesTab({ categories, reload }: { categories: Category[]; reload: () => void }) {
  const t = useTranslations("catalog");
  const tCommon = useTranslations("common");
  const [nameEn, setNameEn] = useState("");
  const [nameBn, setNameBn] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    try {
      await api.post("/admin/categories", { name: { en: nameEn, bn: nameBn || undefined }, parentId: parentId || null });
      setNameEn("");
      setNameBn("");
      setParentId("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/admin/categories/${id}`);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      {error && <Banner kind="error">{error}</Banner>}
      <ul className="flex flex-col gap-1">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center justify-between rounded-theme border border-border px-3 py-2 text-sm">
            <span>
              {category.parentId && "— "}
              {category.name.en ?? category.name.bn} <span className="text-surface-foreground/50">/{category.slug}</span>
            </span>
            <button onClick={() => void handleDelete(category.id)} className="text-xs text-danger">
              {tCommon("delete")}
            </button>
          </li>
        ))}
        {categories.length === 0 && <li className="text-sm text-surface-foreground/50">—</li>}
      </ul>
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <TextField label={t("name")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        <TextField label={t("nameBn")} value={nameBn} onChange={(e) => setNameBn(e.target.value)} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("parent")}</span>
          <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">{t("none")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name.en}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => void handleCreate()} disabled={!nameEn}>
          {t("add")}
        </Button>
      </div>
    </Card>
  );
}

function AttributesTab({ attributes, reload }: { attributes: Attribute[]; reload: () => void }) {
  const t = useTranslations("catalog");
  const tCommon = useTranslations("common");
  const [code, setCode] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [type, setType] = useState("select");
  const [newValueByAttr, setNewValueByAttr] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    try {
      await api.post("/admin/attributes", { code, name: { en: nameEn }, type });
      setCode("");
      setNameEn("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/admin/attributes/${id}`);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function handleAddValue(attributeId: string) {
    const label = newValueByAttr[attributeId];
    if (!label) return;
    try {
      await api.post(`/admin/attributes/${attributeId}/values`, { value: { en: label } });
      setNewValueByAttr((prev) => ({ ...prev, [attributeId]: "" }));
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function handleDeleteValue(attributeId: string, valueId: string) {
    try {
      await api.delete(`/admin/attributes/${attributeId}/values/${valueId}`);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      {error && <Banner kind="error">{error}</Banner>}
      {attributes.map((attribute) => (
        <div key={attribute.id} className="rounded-theme border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-surface-foreground">
              {attribute.name.en} <span className="text-surface-foreground/50">({attribute.code}, {attribute.type})</span>
            </span>
            <button onClick={() => void handleDelete(attribute.id)} className="text-xs text-danger">
              {tCommon("delete")}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {attribute.values.map((value) => (
              <span key={value.id} className="flex items-center gap-1 rounded-theme bg-muted px-2 py-1 text-xs">
                {value.value.en}
                <button onClick={() => void handleDeleteValue(attribute.id, value.id)} className="text-danger">
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="rounded-theme border border-border bg-surface px-2 py-1 text-xs"
              placeholder={t("addValue")}
              value={newValueByAttr[attribute.id] ?? ""}
              onChange={(e) => setNewValueByAttr((prev) => ({ ...prev, [attribute.id]: e.target.value }))}
            />
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void handleAddValue(attribute.id)}>
              {t("addValue")}
            </Button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <TextField label={t("code")} value={code} onChange={(e) => setCode(e.target.value)} />
        <TextField label={t("name")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("type")}</span>
          <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            {["select", "multiselect", "text", "number", "boolean", "color"].map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => void handleCreate()} disabled={!code || !nameEn}>
          {t("add")}
        </Button>
      </div>
    </Card>
  );
}

function SizeSystemsTab({ sizeSystems, reload }: { sizeSystems: SizeSystem[]; reload: () => void }) {
  const t = useTranslations("catalog");
  const tCommon = useTranslations("common");
  const [nameEn, setNameEn] = useState("");
  const [type, setType] = useState("letter");
  const [values, setValues] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    try {
      await api.post("/admin/size-systems", {
        name: { en: nameEn },
        type,
        values: values.split(",").map((v) => v.trim()).filter(Boolean).map((code) => ({ code, label: { en: code } })),
      });
      setNameEn("");
      setValues("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/admin/size-systems/${id}`);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      {error && <Banner kind="error">{error}</Banner>}
      <ul className="flex flex-col gap-1">
        {sizeSystems.map((system) => (
          <li key={system.id} className="flex items-center justify-between rounded-theme border border-border px-3 py-2 text-sm">
            <span>
              {system.name.en} <span className="text-surface-foreground/50">({system.type}): {system.values.map((v) => v.code).join(", ")}</span>
            </span>
            <button onClick={() => void handleDelete(system.id)} className="text-xs text-danger">
              {tCommon("delete")}
            </button>
          </li>
        ))}
        {sizeSystems.length === 0 && <li className="text-sm text-surface-foreground/50">—</li>}
      </ul>
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <TextField label={t("name")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("type")}</span>
          <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            {["letter", "numeric", "kids_age", "free_size", "custom"].map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <TextField label={t("sizes")} placeholder="XS, S, M, L, XL" value={values} onChange={(e) => setValues(e.target.value)} />
        <Button onClick={() => void handleCreate()} disabled={!nameEn}>
          {t("add")}
        </Button>
      </div>
    </Card>
  );
}

function SizeChartsTab({ sizeCharts, reload }: { sizeCharts: SizeChart[]; reload: () => void }) {
  const t = useTranslations("catalog");
  const tCommon = useTranslations("common");
  const [nameEn, setNameEn] = useState("");
  const [unitDefault, setUnitDefault] = useState("cm");
  const [columns, setColumns] = useState("");
  const [sizes, setSizes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    try {
      const columnKeys = columns.split(",").map((c) => c.trim()).filter(Boolean);
      const sizeList = sizes.split(",").map((s) => s.trim()).filter(Boolean);
      await api.post("/admin/size-charts", {
        name: { en: nameEn },
        unitDefault,
        columns: columnKeys.map((key) => ({ key, label: { en: key } })),
        rows: sizeList.map((size) => ({ size, measurements: {} })),
      });
      setNameEn("");
      setColumns("");
      setSizes("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/admin/size-charts/${id}`);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      {error && <Banner kind="error">{error}</Banner>}
      <ul className="flex flex-col gap-1">
        {sizeCharts.map((chart) => (
          <li key={chart.id} className="flex items-center justify-between rounded-theme border border-border px-3 py-2 text-sm">
            <span>
              {chart.name.en} <span className="text-surface-foreground/50">({chart.unitDefault}): {chart.rows.map((r) => r.size).join(", ")}</span>
            </span>
            <button onClick={() => void handleDelete(chart.id)} className="text-xs text-danger">
              {tCommon("delete")}
            </button>
          </li>
        ))}
        {sizeCharts.length === 0 && <li className="text-sm text-surface-foreground/50">—</li>}
      </ul>
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <TextField label={t("name")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("unit")}</span>
          <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={unitDefault} onChange={(e) => setUnitDefault(e.target.value)}>
            <option value="cm">cm</option>
            <option value="inch">inch</option>
          </select>
        </label>
        <TextField label={t("columns")} placeholder="chest, length, shoulder" value={columns} onChange={(e) => setColumns(e.target.value)} />
        <TextField label={t("sizes")} placeholder="S, M, L" value={sizes} onChange={(e) => setSizes(e.target.value)} />
        <Button onClick={() => void handleCreate()} disabled={!nameEn}>
          {t("add")}
        </Button>
      </div>
    </Card>
  );
}

export default function CatalogPage() {
  const t = useTranslations("catalog");
  const [tab, setTab] = useState<(typeof TABS)[number]>("categories");
  const [categories, setCategories] = useState<Category[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [sizeSystems, setSizeSystems] = useState<SizeSystem[]>([]);
  const [sizeCharts, setSizeCharts] = useState<SizeChart[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [cats, attrs, systems, charts] = await Promise.all([
        api.get<Category[]>("/admin/categories"),
        api.get<Attribute[]>("/admin/attributes"),
        api.get<SizeSystem[]>("/admin/size-systems"),
        api.get<SizeChart[]>("/admin/size-charts"),
      ]);
      setCategories(cats);
      setAttributes(attrs);
      setSizeSystems(systems);
      setSizeCharts(charts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load catalog data");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`rounded-theme px-3 py-1.5 text-sm ${tab === tabKey ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground"}`}
          >
            {t(`${tabKey}Title`)}
          </button>
        ))}
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {tab === "categories" && <CategoriesTab categories={categories} reload={load} />}
      {tab === "attributes" && <AttributesTab attributes={attributes} reload={load} />}
      {tab === "sizeSystems" && <SizeSystemsTab sizeSystems={sizeSystems} reload={load} />}
      {tab === "sizeCharts" && <SizeChartsTab sizeCharts={sizeCharts} reload={load} />}
    </div>
  );
}
