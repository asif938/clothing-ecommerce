"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";

interface Discount {
  id: string;
  name: string;
  type: "code" | "automatic";
  code: string | null;
  valueType: "percent" | "fixed" | "free_shipping";
  value: number;
  priority: number;
  marginGuardOverride: boolean;
  status: "draft" | "active" | "scheduled" | "expired" | "disabled";
  usedCount: number;
  conditions: Record<string, unknown> | null;
  limits: Record<string, unknown> | null;
}

/**
 * Discounts & coupons (docs/PROJECT_SPEC.md §16 M8, §5.8) — the admin's
 * "full UI" for the three value types the M5 engine implements
 * (percent/fixed/free_shipping); `buy_x_get_y`/`bundle_price`/`tiered`
 * aren't built (engine or UI) this milestone — see docs/DECISIONS.md.
 * Conditions/limits stay a JSON editor, same MVP trade-off as the
 * payment-rules screen (M5).
 */
export default function DiscountsPage() {
  const t = useTranslations("discounts");
  const tCommon = useTranslations("common");
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"code" | "automatic">("code");
  const [code, setCode] = useState("");
  const [valueType, setValueType] = useState<"percent" | "fixed" | "free_shipping">("percent");
  const [value, setValue] = useState("0");
  const [priority, setPriority] = useState("0");
  const [conditionsJson, setConditionsJson] = useState("{}");
  const [limitsJson, setLimitsJson] = useState("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Discount | null>(null);
  const [bulkCount, setBulkCount] = useState("100");
  const [bulkPrefix, setBulkPrefix] = useState("");
  const [bulkCodes, setBulkCodes] = useState<string[] | null>(null);
  const [usage, setUsage] = useState<{ totalUses: number; totalAmount: number } | null>(null);

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

  async function handleCreate() {
    setJsonError(null);
    let conditions: unknown;
    let limits: unknown;
    try {
      conditions = JSON.parse(conditionsJson);
      limits = JSON.parse(limitsJson);
    } catch {
      setJsonError(t("invalidJson"));
      return;
    }
    try {
      await api.post("/admin/discounts", { name, type, code: type === "code" ? code.toUpperCase() : undefined, valueType, value: Number(value), priority: Number(priority), conditions, limits, status: "active" });
      setName("");
      setCode("");
      setValue("0");
      setConditionsJson("{}");
      setLimitsJson("{}");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create discount");
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        {discounts.map((discount) => (
          <div key={discount.id} className="rounded-theme border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button onClick={() => void handleSelect(discount)} className="text-left font-medium text-surface-foreground hover:text-brand">
                {discount.name} <span className="text-xs text-surface-foreground/50">({discount.type === "code" ? discount.code : t("automatic")}, {discount.valueType})</span>
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-surface-foreground/50">{t("used")}: {discount.usedCount}</span>
                <Toggle checked={discount.status === "active"} onChange={() => void handleToggleStatus(discount)} />
                <button onClick={() => void handleDelete(discount.id)} className="text-xs text-danger">{tCommon("delete")}</button>
              </div>
            </div>
          </div>
        ))}
        {discounts.length === 0 && <p className="text-sm text-surface-foreground/50">—</p>}

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <TextField label={t("name")} value={name} onChange={(e) => setName(e.target.value)} />
            <select value={type} onChange={(e) => setType(e.target.value as "code" | "automatic")} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
              <option value="code">{t("typeCode")}</option>
              <option value="automatic">{t("typeAutomatic")}</option>
            </select>
            {type === "code" && <TextField label={t("code")} value={code} onChange={(e) => setCode(e.target.value)} />}
            <select value={valueType} onChange={(e) => setValueType(e.target.value as typeof valueType)} className="rounded-theme border border-border bg-surface px-3 py-2 text-sm">
              <option value="percent">{t("valueTypePercent")}</option>
              <option value="fixed">{t("valueTypeFixed")}</option>
              <option value="free_shipping">{t("valueTypeFreeShipping")}</option>
            </select>
            <TextField label={t("value")} type="number" value={value} onChange={(e) => setValue(e.target.value)} />
            <TextField label={t("priority")} type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("conditions")}</span>
            <textarea value={conditionsJson} onChange={(e) => setConditionsJson(e.target.value)} rows={2} className="rounded-theme border border-border bg-surface px-3 py-2 text-xs font-mono" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("limits")}</span>
            <textarea value={limitsJson} onChange={(e) => setLimitsJson(e.target.value)} rows={2} className="rounded-theme border border-border bg-surface px-3 py-2 text-xs font-mono" />
          </label>
          {jsonError && <Banner kind="error">{jsonError}</Banner>}
          <Button onClick={() => void handleCreate()} disabled={!name} className="self-start">{t("add")}</Button>
        </div>
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
