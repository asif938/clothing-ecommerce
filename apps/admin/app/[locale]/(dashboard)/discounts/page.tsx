"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";
import { CategorySelect, ProductsInput } from "../../../../components/block-form";

interface Conditions {
  minSubtotal?: number;
  minQty?: number;
  includeCategoryIds?: string[];
  excludeCategoryIds?: string[];
  includeProductIds?: string[];
  excludeProductIds?: string[];
  includeTags?: string[];
  excludeTags?: string[];
  firstOrderOnly?: boolean;
}

interface Limits {
  totalUses?: number;
  perCustomer?: number;
  perPhone?: number;
}

interface Discount {
  id: string;
  name: string;
  type: "code" | "automatic";
  code: string | null;
  valueType: "percent" | "fixed" | "free_shipping";
  value: number;
  priority: number;
  status: "draft" | "active" | "scheduled" | "expired" | "disabled";
  usedCount: number;
  conditions: Conditions | null;
  limits: Limits | null;
  startsAt: string | null;
  endsAt: string | null;
}

/** Everything the form edits, kept as the owner types it (taka, plain numbers, comma-separated tags); converted to the API's shape on save. */
interface FormState {
  name: string;
  type: "code" | "automatic";
  code: string;
  valueType: "percent" | "fixed" | "free_shipping";
  value: string;
  minSubtotalTaka: string;
  minQty: string;
  firstOrderOnly: boolean;
  includeCategoryIds: string[];
  excludeCategoryIds: string[];
  includeProductIds: string[];
  excludeProductIds: string[];
  includeTags: string;
  excludeTags: string;
  totalUses: string;
  perCustomer: string;
  perPhone: string;
  startsAt: string;
  endsAt: string;
  priority: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  type: "code",
  code: "",
  valueType: "percent",
  value: "",
  minSubtotalTaka: "",
  minQty: "",
  firstOrderOnly: false,
  includeCategoryIds: [],
  excludeCategoryIds: [],
  includeProductIds: [],
  excludeProductIds: [],
  includeTags: "",
  excludeTags: "",
  totalUses: "",
  perCustomer: "",
  perPhone: "",
  startsAt: "",
  endsAt: "",
  priority: "0",
};

const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");
const splitTags = (raw: string) => raw.split(",").map((t) => t.trim()).filter(Boolean);
const positiveInt = (raw: string) => (raw.trim() && Number(raw) > 0 ? Math.round(Number(raw)) : undefined);

function formFromDiscount(d: Discount): FormState {
  const c = d.conditions ?? {};
  const l = d.limits ?? {};
  return {
    name: d.name,
    type: d.type,
    code: d.code ?? "",
    valueType: d.valueType,
    value: d.valueType === "fixed" ? String(d.value / 100) : d.valueType === "percent" ? String(d.value) : "",
    minSubtotalTaka: c.minSubtotal ? String(c.minSubtotal / 100) : "",
    minQty: c.minQty ? String(c.minQty) : "",
    firstOrderOnly: Boolean(c.firstOrderOnly),
    includeCategoryIds: c.includeCategoryIds ?? [],
    excludeCategoryIds: c.excludeCategoryIds ?? [],
    includeProductIds: c.includeProductIds ?? [],
    excludeProductIds: c.excludeProductIds ?? [],
    includeTags: (c.includeTags ?? []).join(", "),
    excludeTags: (c.excludeTags ?? []).join(", "),
    totalUses: l.totalUses ? String(l.totalUses) : "",
    perCustomer: l.perCustomer ? String(l.perCustomer) : "",
    perPhone: l.perPhone ? String(l.perPhone) : "",
    startsAt: toLocalInput(d.startsAt),
    endsAt: toLocalInput(d.endsAt),
    priority: String(d.priority),
  };
}

/** Builds the API body; empty fields are left out so the discount has no such condition. */
function bodyFromForm(f: FormState) {
  const conditions: Conditions = {};
  const minSubtotal = f.minSubtotalTaka.trim() ? Math.round(Number(f.minSubtotalTaka) * 100) : 0;
  if (minSubtotal > 0) conditions.minSubtotal = minSubtotal;
  const minQty = positiveInt(f.minQty);
  if (minQty) conditions.minQty = minQty;
  if (f.firstOrderOnly) conditions.firstOrderOnly = true;
  if (f.includeCategoryIds.length) conditions.includeCategoryIds = f.includeCategoryIds;
  if (f.excludeCategoryIds.length) conditions.excludeCategoryIds = f.excludeCategoryIds;
  if (f.includeProductIds.length) conditions.includeProductIds = f.includeProductIds;
  if (f.excludeProductIds.length) conditions.excludeProductIds = f.excludeProductIds;
  if (splitTags(f.includeTags).length) conditions.includeTags = splitTags(f.includeTags);
  if (splitTags(f.excludeTags).length) conditions.excludeTags = splitTags(f.excludeTags);

  const limits: Limits = {};
  const totalUses = positiveInt(f.totalUses);
  const perCustomer = positiveInt(f.perCustomer);
  const perPhone = positiveInt(f.perPhone);
  if (totalUses) limits.totalUses = totalUses;
  if (perCustomer) limits.perCustomer = perCustomer;
  if (perPhone) limits.perPhone = perPhone;

  return {
    name: f.name.trim(),
    type: f.type,
    code: f.type === "code" ? f.code.trim().toUpperCase() : null,
    valueType: f.valueType,
    value: f.valueType === "fixed" ? Math.round(Number(f.value) * 100) : f.valueType === "percent" ? Math.round(Number(f.value)) : 0,
    conditions,
    limits,
    priority: Number(f.priority) || 0,
    startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null,
    endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
  };
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

const selectClass = "rounded-theme border border-border bg-surface px-3 py-2 text-sm";

/**
 * Discounts & coupons (docs/PROJECT_SPEC.md §5.8): percent, fixed (taka) or
 * free delivery, as a code or applied automatically, with optional
 * conditions, usage limits and a date window — all as plain form fields.
 */
export default function DiscountsPage() {
  const t = useTranslations("discounts");
  const tCommon = useTranslations("common");
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [selected, setSelected] = useState<Discount | null>(null);
  const [bulkCount, setBulkCount] = useState("100");
  const [bulkPrefix, setBulkPrefix] = useState("");
  const [bulkCodes, setBulkCodes] = useState<string[] | null>(null);
  const [usage, setUsage] = useState<{ totalUses: number; totalAmount: number } | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  async function load() {
    try {
      setDiscounts(await api.get<Discount[]>("/admin/discounts"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load discounts");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  const valueNumber = Number(form.value);
  const formProblem = !form.name.trim()
    ? t("needName")
    : form.type === "code" && form.code.trim().length < 2
      ? t("needCode")
      : form.valueType === "percent" && !(valueNumber > 0 && valueNumber <= 100)
        ? t("needPercent")
        : form.valueType === "fixed" && !(valueNumber > 0)
          ? t("needAmount")
          : form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)
            ? t("needDateOrder")
            : null;

  function startCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, code: randomCode() });
    setShowForm(true);
  }

  function startEdit(discount: Discount) {
    setEditingId(discount.id);
    setForm(formFromDiscount(discount));
    setShowForm(true);
  }

  async function handleSave() {
    if (formProblem) return;
    setError(null);
    try {
      if (editingId) await api.patch(`/admin/discounts/${editingId}`, bodyFromForm(form));
      else await api.post("/admin/discounts", { ...bodyFromForm(form), status: "active" });
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save discount");
    }
  }

  async function handleToggleStatus(discount: Discount) {
    try {
      await api.patch(`/admin/discounts/${discount.id}`, { status: discount.status === "active" ? "disabled" : "active" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update discount");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("deleteConfirm"))) return;
    try {
      await api.delete(`/admin/discounts/${id}`);
      if (selected?.id === id) setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete discount");
    }
  }

  async function handleSelect(discount: Discount) {
    setSelected(discount);
    setBulkCodes(null);
    try {
      setUsage(await api.get(`/admin/discounts/${discount.id}/usage`));
    } catch {
      setUsage(null);
    }
  }

  async function handleGenerateBulkCodes() {
    if (!selected) return;
    try {
      const result = await api.post<{ codes: string[] }>(`/admin/discounts/${selected.id}/codes/generate`, { count: Number(bulkCount), prefix: bulkPrefix || undefined });
      setBulkCodes(result.codes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate codes");
    }
  }

  function summary(d: Discount): string {
    const amount = d.valueType === "percent" ? t("summaryPercent", { value: d.value }) : d.valueType === "fixed" ? t("summaryFixed", { value: (d.value / 100).toLocaleString() }) : t("summaryFreeShipping");
    const parts = [amount, d.type === "code" ? t("summaryCode", { code: d.code ?? "" }) : t("summaryAutomatic")];
    if (d.conditions?.minSubtotal) parts.push(t("summaryMin", { value: (d.conditions.minSubtotal / 100).toLocaleString() }));
    if (d.conditions?.firstOrderOnly) parts.push(t("firstOrderOnly"));
    if (d.endsAt) parts.push(t("summaryEnds", { date: new Date(d.endsAt).toLocaleDateString() }));
    return parts.join(" · ");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        {!showForm && <Button onClick={startCreate}>{t("add")}</Button>}
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      {showForm && (
        <Card className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-surface-foreground">{editingId ? t("editTitle") : t("add")}</h2>

          <section className="flex flex-col gap-3">
            <TextField label={t("name")} value={form.name} placeholder={t("namePlaceholder")} onChange={(e) => set("name", e.target.value)} />
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-surface-foreground">{t("howApplied")}</span>
                <select value={form.type} onChange={(e) => set("type", e.target.value as FormState["type"])} className={selectClass}>
                  <option value="code">{t("typeCode")}</option>
                  <option value="automatic">{t("typeAutomatic")}</option>
                </select>
              </label>
              {form.type === "code" && (
                <div className="flex items-end gap-2">
                  <TextField label={t("code")} value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />
                  <Button type="button" variant="secondary" onClick={() => set("code", randomCode())}>
                    {t("randomCode")}
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs text-surface-foreground/60">{form.type === "code" ? t("typeCodeHint") : t("typeAutomaticHint")}</p>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-surface-foreground">{t("whatDiscount")}</h3>
            <div className="flex flex-wrap items-end gap-3">
              <select value={form.valueType} onChange={(e) => set("valueType", e.target.value as FormState["valueType"])} className={selectClass}>
                <option value="percent">{t("valueTypePercent")}</option>
                <option value="fixed">{t("valueTypeFixed")}</option>
                <option value="free_shipping">{t("valueTypeFreeShipping")}</option>
              </select>
              {form.valueType !== "free_shipping" && (
                <TextField
                  label={form.valueType === "percent" ? t("percentValue") : t("fixedValue")}
                  type="number"
                  min={1}
                  value={form.value}
                  placeholder={form.valueType === "percent" ? "10" : "200"}
                  onChange={(e) => set("value", e.target.value)}
                />
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-surface-foreground">{t("conditionsTitle")}</h3>
            <p className="text-xs text-surface-foreground/60">{t("conditionsHint")}</p>
            <div className="flex flex-wrap items-end gap-3">
              <TextField label={t("minSubtotal")} type="number" min={0} value={form.minSubtotalTaka} onChange={(e) => set("minSubtotalTaka", e.target.value)} />
              <TextField label={t("minQty")} type="number" min={0} value={form.minQty} onChange={(e) => set("minQty", e.target.value)} />
              <label className="flex items-center gap-2 pb-2 text-sm">
                <Toggle checked={form.firstOrderOnly} onChange={(v) => set("firstOrderOnly", v)} /> {t("firstOrderOnly")}
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-surface-foreground">{t("includeCategories")}</span>
                <CategorySelect multiple value={form.includeCategoryIds} onChange={(v) => set("includeCategoryIds", (v as string[] | undefined) ?? [])} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-surface-foreground">{t("excludeCategories")}</span>
                <CategorySelect multiple value={form.excludeCategoryIds} onChange={(v) => set("excludeCategoryIds", (v as string[] | undefined) ?? [])} />
              </label>
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-surface-foreground">{t("includeProducts")}</span>
                <ProductsInput value={form.includeProductIds} onChange={(v) => set("includeProductIds", v)} />
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-surface-foreground">{t("excludeProducts")}</span>
                <ProductsInput value={form.excludeProductIds} onChange={(v) => set("excludeProductIds", v)} />
              </div>
              <TextField label={t("includeTags")} value={form.includeTags} placeholder="eid-2026, winter" onChange={(e) => set("includeTags", e.target.value)} />
              <TextField label={t("excludeTags")} value={form.excludeTags} placeholder="clearance" onChange={(e) => set("excludeTags", e.target.value)} />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-surface-foreground">{t("limitsTitle")}</h3>
            <p className="text-xs text-surface-foreground/60">{t("limitsHint")}</p>
            <div className="flex flex-wrap items-end gap-3">
              <TextField label={t("totalUses")} type="number" min={1} value={form.totalUses} placeholder={t("unlimited")} onChange={(e) => set("totalUses", e.target.value)} />
              <TextField label={t("perCustomer")} type="number" min={1} value={form.perCustomer} placeholder={t("unlimited")} onChange={(e) => set("perCustomer", e.target.value)} />
              <TextField label={t("perPhone")} type="number" min={1} value={form.perPhone} placeholder={t("unlimited")} onChange={(e) => set("perPhone", e.target.value)} />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-surface-foreground">{t("whenTitle")}</h3>
            <div className="flex flex-wrap items-end gap-3">
              <TextField label={t("startsAt")} type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
              <TextField label={t("endsAt")} type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
            </div>
            <p className="text-xs text-surface-foreground/60">{t("whenHint")}</p>
          </section>

          <details className="text-sm">
            <summary className="cursor-pointer text-surface-foreground/70">{t("advanced")}</summary>
            <div className="mt-2 flex flex-col gap-1">
              <TextField label={t("priority")} type="number" value={form.priority} onChange={(e) => set("priority", e.target.value)} />
              <span className="text-xs text-surface-foreground/60">{t("priorityHint")}</span>
            </div>
          </details>

          {formProblem && <p className="text-xs text-danger">{formProblem}</p>}
          <div className="flex gap-2">
            <Button onClick={() => void handleSave()} disabled={Boolean(formProblem)}>
              {editingId ? tCommon("save") : t("add")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              {tCommon("cancel")}
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        {discounts.map((discount) => (
          <div key={discount.id} className="rounded-theme border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button onClick={() => void handleSelect(discount)} className="text-left hover:text-brand">
                <span className="font-medium text-surface-foreground">{discount.name}</span>
                <span className="block text-xs text-surface-foreground/60">{summary(discount)}</span>
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-surface-foreground/50">{t("used")}: {discount.usedCount}</span>
                <Toggle checked={discount.status === "active"} onChange={() => void handleToggleStatus(discount)} />
                <button onClick={() => startEdit(discount)} className="text-xs text-brand underline">{tCommon("edit")}</button>
                <button onClick={() => void handleDelete(discount.id)} className="text-xs text-danger">{tCommon("delete")}</button>
              </div>
            </div>
          </div>
        ))}
        {discounts.length === 0 && <p className="text-sm text-surface-foreground/50">{t("empty")}</p>}
      </Card>

      {selected && (
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold text-surface-foreground">{t("managing", { name: selected.name })}</h2>

          {usage && (
            <p className="text-sm text-surface-foreground/70">
              {t("usageSummary", { uses: usage.totalUses, amount: (usage.totalAmount / 100).toFixed(2) })}
            </p>
          )}

          {selected.type === "code" && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <h3 className="text-sm font-medium text-surface-foreground">{t("bulkCodes")}</h3>
              <p className="text-xs text-surface-foreground/60">{t("bulkCodesHint")}</p>
              <div className="flex flex-wrap items-end gap-2">
                <TextField label={t("bulkCount")} type="number" value={bulkCount} onChange={(e) => setBulkCount(e.target.value)} />
                <TextField label={t("bulkPrefix")} value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value.toUpperCase())} />
                <Button onClick={() => void handleGenerateBulkCodes()}>{t("generate")}</Button>
              </div>
              {bulkCodes && (
                <textarea readOnly value={bulkCodes.join("\n")} rows={6} className="rounded-theme border border-border bg-surface px-3 py-2 text-xs font-mono" />
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
