"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { localized, type Localized } from "../../../../lib/format";
import { Banner, Button, Card, TextField } from "../../../../components/ui";
import { CategorySelect, CollectionSelect } from "../../../../components/block-form";
import { ProductPicker } from "../../../../components/product-picker";
import { VariantPicker, variantLabel } from "../../../../components/variant-picker";

interface PriceSchedule {
  id: string;
  targetType: string;
  targetId: string;
  /** Product title (plus `sku` for a variant), collection/category name, or the tag itself. */
  targetLabel: (Localized & { sku?: string }) | string | null;
  newPrice: number | null;
  percentChange: number | null;
  startsAt: string;
  endsAt: string | null;
  status: string;
}

const TARGET_TYPES = ["product", "variant", "category", "collection", "tag"] as const;
type TargetType = (typeof TARGET_TYPES)[number];
type PriceMode = "fixed" | "percent";

/**
 * Scheduled price changes: pick what to reprice (a product, one size/colour,
 * a whole category or collection, or everything with a tag), the new price in
 * taka or a percentage, and when it starts and (optionally) ends.
 */
export default function PriceSchedulesPage() {
  const t = useTranslations("priceSchedules");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [schedules, setSchedules] = useState<PriceSchedule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<TargetType>("product");
  const [target, setTarget] = useState<{ id: string; label: string } | null>(null);
  const [priceMode, setPriceMode] = useState<PriceMode>("percent");
  const [priceValue, setPriceValue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  async function load() {
    try {
      setSchedules(await api.get<PriceSchedule[]>("/admin/price-schedules"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load price schedules");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  function targetText(schedule: PriceSchedule): string {
    const label = schedule.targetLabel;
    if (!label) return t("targetMissing");
    if (typeof label === "string") return label;
    return label.sku ? `${localized(label, locale)} (${label.sku})` : localized(label, locale);
  }

  function priceText(schedule: PriceSchedule): string {
    if (schedule.newPrice !== null) return `৳${(schedule.newPrice / 100).toLocaleString()}`;
    const pct = schedule.percentChange ?? 0;
    return pct < 0 ? t("percentDown", { pct: Math.abs(pct) }) : t("percentUp", { pct });
  }

  const value = Number(priceValue);
  const valueOk = priceValue !== "" && (priceMode === "fixed" ? value > 0 : value !== 0 && value > -100);

  async function handleCreate() {
    if (!target || !valueOk || !startsAt) return;
    try {
      await api.post("/admin/price-schedules", {
        targetType,
        targetId: target.id,
        newPrice: priceMode === "fixed" ? Math.round(value * 100) : null,
        percentChange: priceMode === "percent" ? value : null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      setTarget(null);
      setPriceValue("");
      setStartsAt("");
      setEndsAt("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create price schedule");
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm(t("cancelConfirm"))) return;
    try {
      await api.delete(`/admin/price-schedules/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      <p className="text-sm text-surface-foreground/70">{t("intro")}</p>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-theme border border-border px-3 py-2 text-sm">
              <span>
                <span className="text-surface-foreground/60">{t(`type_${schedule.targetType}`)}:</span> {targetText(schedule)} → {priceText(schedule)}
                <span className="block text-xs text-surface-foreground/50">
                  {new Date(schedule.startsAt).toLocaleString()} → {schedule.endsAt ? new Date(schedule.endsAt).toLocaleString() : t("noEnd")} · {t(`status_${schedule.status}`)}
                </span>
              </span>
              {schedule.status !== "cancelled" && schedule.status !== "ended" && (
                <button onClick={() => void handleCancel(schedule.id)} className="text-xs text-danger">
                  {t("cancel")}
                </button>
              )}
            </li>
          ))}
          {schedules.length === 0 && <li className="text-sm text-surface-foreground/50">{t("empty")}</li>}
        </ul>

        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <h2 className="text-sm font-semibold text-surface-foreground">{t("add")}</h2>
          <label className="flex max-w-md flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("targetType")}</span>
            <select
              className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value as TargetType);
                setTarget(null);
              }}
            >
              {TARGET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`type_${type}`)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex max-w-md flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t(`pick_${targetType}`)}</span>
            {target && targetType !== "category" && targetType !== "collection" && targetType !== "tag" ? (
              <span className="flex items-center gap-2">
                {target.label}
                <button type="button" className="text-xs text-danger" onClick={() => setTarget(null)}>
                  ×
                </button>
              </span>
            ) : null}
            {targetType === "product" && !target && <ProductPicker onPick={(p) => setTarget({ id: p.id, label: localized(p.title, locale) || p.slug })} />}
            {targetType === "variant" && !target && <VariantPicker onPick={(v) => setTarget({ id: v.id, label: variantLabel(v, locale) })} />}
            {targetType === "category" && (
              <CategorySelect value={target?.id} multiple={false} onChange={(id) => setTarget(typeof id === "string" ? { id, label: id } : null)} />
            )}
            {targetType === "collection" && <CollectionSelect value={target?.id} onChange={(id) => setTarget(id ? { id, label: id } : null)} />}
            {targetType === "tag" && (
              <input
                className="rounded-theme border border-border bg-surface px-3 py-2 text-sm"
                placeholder="eid-2026"
                value={target?.id ?? ""}
                onChange={(e) => setTarget(e.target.value.trim() ? { id: e.target.value.trim(), label: e.target.value.trim() } : null)}
              />
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-surface-foreground">{t("priceMode")}</span>
              <select className="rounded-theme border border-border bg-surface px-3 py-2 text-sm" value={priceMode} onChange={(e) => setPriceMode(e.target.value as PriceMode)}>
                <option value="percent">{t("mode_percent")}</option>
                <option value="fixed">{t("mode_fixed")}</option>
              </select>
            </label>
            <TextField
              label={priceMode === "fixed" ? t("newPrice") : t("percentChange")}
              type="number"
              value={priceValue}
              placeholder={priceMode === "fixed" ? "1500" : "-15"}
              onChange={(e) => setPriceValue(e.target.value)}
            />
          </div>
          <p className="text-xs text-surface-foreground/60">{priceMode === "fixed" ? t("fixedHint") : t("percentHint")}</p>

          <div className="flex flex-wrap items-end gap-3">
            <TextField label={t("startsAt")} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            <TextField label={t("endsAt")} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
          <p className="text-xs text-surface-foreground/60">{t("endsHint")}</p>

          <div>
            <Button onClick={() => void handleCreate()} disabled={!target || !valueOk || !startsAt}>
              {tCommon("create")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
