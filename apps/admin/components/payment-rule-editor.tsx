"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "../lib/api";
import { localized, type Localized } from "../lib/format";
import { CategorySelect, ProductsInput } from "./block-form";
import { Button } from "./ui";

/**
 * Plain-form editor for payment rules (docs/PROJECT_SPEC.md §6.5). Each
 * condition the engine understands (`RuleConditions` in the API's
 * payment-rules-engine.ts) has a definition here saying how to show it and
 * how to convert between what the owner types and what is stored: money is
 * typed in taka and stored in poisha, the rejection rate is typed as a
 * percentage and stored as 0–1. Keys the form doesn't know are kept as they
 * are, so nothing stored earlier is lost by editing.
 */

export type Conditions = Record<string, unknown> & { match?: "all" | "any" };
export interface RuleAction {
  type: "disable_cod" | "disable_method" | "require_advance" | "require_otp" | "require_manual_review" | "block_order" | "show_message";
  method?: string;
  kind?: "delivery_fee" | "fixed" | "percent" | "full";
  amount?: number;
  percent?: number;
  message?: string;
}

type ConditionKind = "money" | "count" | "score" | "rate" | "yes" | "no" | "choices" | "tags" | "categories" | "products" | "districts" | "zones" | "days" | "hours";

interface ConditionDef {
  key: string;
  kind: ConditionKind;
  options?: string[];
}

export const PAYMENT_METHODS = ["cod", "bkash", "nagad", "sslcommerz"];

const CONDITIONS: ConditionDef[] = [
  { key: "totalMin", kind: "money" },
  { key: "totalMax", kind: "money" },
  { key: "subtotalMin", kind: "money" },
  { key: "subtotalMax", kind: "money" },
  { key: "itemCountMin", kind: "count" },
  { key: "itemCountMax", kind: "count" },
  { key: "isDhakaCity", kind: "yes" },
  { key: "districtIds", kind: "districts" },
  { key: "zoneIds", kind: "zones" },
  { key: "customerTypes", kind: "choices", options: ["guest", "registered", "new", "returning"] },
  { key: "ordersCountMin", kind: "count" },
  { key: "deliveredCountMin", kind: "count" },
  { key: "rejectionRateMin", kind: "rate" },
  { key: "customerTags", kind: "tags" },
  { key: "riskLevels", kind: "choices", options: ["low", "medium", "high"] },
  { key: "riskScoreMin", kind: "score" },
  { key: "phoneBlocked", kind: "yes" },
  { key: "categoryIds", kind: "categories" },
  { key: "productIds", kind: "products" },
  { key: "cartTags", kind: "tags" },
  { key: "hasFlashSaleItem", kind: "yes" },
  { key: "paymentMethods", kind: "choices", options: PAYMENT_METHODS },
  { key: "dayOfWeek", kind: "days" },
  { key: "hourRange", kind: "hours" },
  { key: "utmSources", kind: "tags" },
];

const DEFAULT_VALUE: Record<ConditionKind, unknown> = {
  money: 0,
  count: 1,
  score: 70,
  rate: 0.3,
  yes: true,
  no: false,
  choices: [],
  tags: [],
  categories: [],
  products: [],
  districts: [],
  zones: [],
  days: [],
  hours: [22, 6],
};

const inputClass = "rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground";

/* ---------- small lookups ---------- */

interface NamedRow { id: string; name: Localized | string }
let districtsPromise: Promise<NamedRow[]> | null = null;
let zonesPromise: Promise<NamedRow[]> | null = null;
const loadDistricts = () => (districtsPromise ??= api.get<NamedRow[]>("/store/locations/districts").catch(() => []));
const loadZones = () => (zonesPromise ??= api.get<NamedRow[]>("/admin/shipping/zones").catch(() => []));

function useRows(load: () => Promise<NamedRow[]>): NamedRow[] {
  const [rows, setRows] = useState<NamedRow[]>([]);
  useEffect(() => {
    let alive = true;
    void load().then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [load]);
  return rows;
}

const rowName = (row: NamedRow, locale: string) => (typeof row.name === "string" ? row.name : localized(row.name, locale));

function MultiSelectChips({ rows, value, onChange, placeholder }: { rows: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1.5">
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
            {rows.find((r) => r.id === id)?.label ?? id}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== id))} className="text-surface-foreground/60 hover:text-danger">
              ×
            </button>
          </span>
        ))}
      </div>
      <select className={inputClass} value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
        <option value="">{placeholder}</option>
        {rows.filter((r) => !value.includes(r.id)).map((r) => (
          <option key={r.id} value={r.id}>{r.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ---------- one condition's value input ---------- */

function ConditionValue({ def, value, onChange }: { def: ConditionDef; value: unknown; onChange: (v: unknown) => void }) {
  const t = useTranslations("paymentRules");
  const locale = useLocale();
  const districts = useRows(loadDistricts);
  const zones = useRows(loadZones);

  switch (def.kind) {
    case "money":
      return <input type="number" min={0} className={inputClass} value={Number(value ?? 0) / 100} onChange={(e) => onChange(Math.round(Number(e.target.value) * 100))} />;
    case "count":
      return <input type="number" min={0} className={inputClass} value={Number(value ?? 0)} onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value))))} />;
    case "score":
      return <input type="number" min={0} max={100} className={inputClass} value={Number(value ?? 0)} onChange={(e) => onChange(Math.min(100, Math.max(0, Math.round(Number(e.target.value)))))} />;
    case "rate":
      return (
        <input type="number" min={0} max={100} className={inputClass} value={Math.round(Number(value ?? 0) * 100)} onChange={(e) => onChange(Math.min(100, Math.max(0, Number(e.target.value))) / 100)} />
      );
    case "yes":
    case "no":
      return (
        <select className={inputClass} value={value === false ? "no" : "yes"} onChange={(e) => onChange(e.target.value === "yes")}>
          <option value="yes">{t("yes")}</option>
          <option value="no">{t("no")}</option>
        </select>
      );
    case "choices":
      return (
        <MultiSelectChips
          rows={(def.options ?? []).map((o) => ({ id: o, label: t(`choice_${o}`) }))}
          value={(value as string[] | undefined) ?? []}
          onChange={onChange}
          placeholder={t("addChoice")}
        />
      );
    case "tags":
      return (
        <input
          className={inputClass}
          placeholder="facebook, vip"
          value={((value as string[] | undefined) ?? []).join(", ")}
          onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
        />
      );
    case "categories":
      return <CategorySelect multiple value={(value as string[] | undefined) ?? []} onChange={(v) => onChange((v as string[] | undefined) ?? [])} />;
    case "products":
      return <ProductsInput value={(value as string[] | undefined) ?? []} onChange={onChange} />;
    case "districts":
      return (
        <MultiSelectChips
          rows={districts.map((d) => ({ id: d.id, label: rowName(d, locale) })).sort((a, b) => a.label.localeCompare(b.label))}
          value={(value as string[] | undefined) ?? []}
          onChange={onChange}
          placeholder={t("addDistrict")}
        />
      );
    case "zones":
      return (
        <MultiSelectChips rows={zones.map((z) => ({ id: z.id, label: rowName(z, locale) }))} value={(value as string[] | undefined) ?? []} onChange={onChange} placeholder={t("addZone")} />
      );
    case "days": {
      const days = (value as number[] | undefined) ?? [];
      return (
        <div className="flex flex-wrap gap-2">
          {[6, 0, 1, 2, 3, 4, 5].map((d) => (
            <label key={d} className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={days.includes(d)} onChange={() => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])} />
              {t(`day_${d}`)}
            </label>
          ))}
        </div>
      );
    }
    case "hours": {
      const [from, to] = (value as [number, number] | undefined) ?? [22, 6];
      const hourSelect = (v: number, set: (n: number) => void) => (
        <select className={inputClass} value={v} onChange={(e) => set(Number(e.target.value))}>
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
          ))}
        </select>
      );
      return (
        <div className="flex items-center gap-2 text-sm">
          {hourSelect(from, (n) => onChange([n, to]))} – {hourSelect(to, (n) => onChange([from, n]))}
        </div>
      );
    }
  }
}

/* ---------- conditions ---------- */

export function ConditionsEditor({ value, onChange }: { value: Conditions; onChange: (next: Conditions) => void }) {
  const t = useTranslations("paymentRules");
  const used = CONDITIONS.filter((def) => def.key in value);
  const available = CONDITIONS.filter((def) => !(def.key in value));
  const unknownKeys = Object.keys(value).filter((k) => k !== "match" && !CONDITIONS.some((d) => d.key === k));

  return (
    <div className="flex flex-col gap-3">
      {used.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          {t("matchLabel")}
          <select className={inputClass} value={value.match ?? "all"} onChange={(e) => onChange({ ...value, match: e.target.value as "all" | "any" })}>
            <option value="all">{t("matchAll")}</option>
            <option value="any">{t("matchAny")}</option>
          </select>
        </label>
      )}
      {used.length === 0 && <p className="text-xs text-surface-foreground/60">{t("noConditions")}</p>}
      {used.map((def) => (
        <div key={def.key} className="flex flex-col gap-1 rounded-theme border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-surface-foreground">{t(`cond_${def.key}`)}</span>
            <button
              type="button"
              className="text-xs text-danger"
              onClick={() => {
                const next = { ...value };
                delete next[def.key];
                onChange(next);
              }}
            >
              {t("remove")}
            </button>
          </div>
          <ConditionValue def={def} value={value[def.key]} onChange={(v) => onChange({ ...value, [def.key]: v })} />
        </div>
      ))}
      {unknownKeys.length > 0 && <p className="text-xs text-surface-foreground/50">{t("keptConditions", { keys: unknownKeys.join(", ") })}</p>}
      {available.length > 0 && (
        <select className={`${inputClass} max-w-sm`} value="" onChange={(e) => {
          const def = CONDITIONS.find((d) => d.key === e.target.value);
          if (def) onChange({ ...value, [def.key]: DEFAULT_VALUE[def.kind] });
        }}>
          <option value="">+ {t("addCondition")}</option>
          {available.map((def) => (
            <option key={def.key} value={def.key}>{t(`cond_${def.key}`)}</option>
          ))}
        </select>
      )}
    </div>
  );
}

/* ---------- actions ---------- */

const ACTION_TYPES: RuleAction["type"][] = ["disable_cod", "require_advance", "require_otp", "require_manual_review", "disable_method", "show_message", "block_order"];

export function ActionsEditor({ value, onChange }: { value: RuleAction[]; onChange: (next: RuleAction[]) => void }) {
  const t = useTranslations("paymentRules");
  const setAction = (i: number, next: RuleAction) => onChange(value.map((a, j) => (j === i ? next : a)));

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 && <p className="text-xs text-danger">{t("needAction")}</p>}
      {value.map((action, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-theme border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <select className={inputClass} value={action.type} onChange={(e) => setAction(i, { type: e.target.value as RuleAction["type"] })}>
              {ACTION_TYPES.map((type) => (
                <option key={type} value={type}>{t(`action_${type}`)}</option>
              ))}
            </select>
            <button type="button" className="text-xs text-danger" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              {t("remove")}
            </button>
          </div>
          {action.type === "disable_method" && (
            <select className={inputClass} value={action.method ?? ""} onChange={(e) => setAction(i, { ...action, method: e.target.value || undefined })}>
              <option value="">{t("chooseMethod")}</option>
              {PAYMENT_METHODS.filter((m) => m !== "cod").map((m) => (
                <option key={m} value={m}>{t(`choice_${m}`)}</option>
              ))}
            </select>
          )}
          {action.type === "require_advance" && (
            <div className="flex flex-wrap items-center gap-2">
              <select className={inputClass} value={action.kind ?? "delivery_fee"} onChange={(e) => setAction(i, { type: action.type, kind: e.target.value as RuleAction["kind"] })}>
                {(["delivery_fee", "fixed", "percent", "full"] as const).map((k) => (
                  <option key={k} value={k}>{t(`advance_${k}`)}</option>
                ))}
              </select>
              {action.kind === "fixed" && (
                <label className="flex items-center gap-1 text-sm">
                  ৳ <input type="number" min={1} className={inputClass} value={(action.amount ?? 0) / 100} onChange={(e) => setAction(i, { ...action, amount: Math.round(Number(e.target.value) * 100) })} />
                </label>
              )}
              {action.kind === "percent" && (
                <label className="flex items-center gap-1 text-sm">
                  <input type="number" min={1} max={100} className={inputClass} value={action.percent ?? 0} onChange={(e) => setAction(i, { ...action, percent: Math.min(100, Math.max(0, Number(e.target.value))) })} /> %
                </label>
              )}
            </div>
          )}
          {(action.type === "show_message" || action.type === "block_order") && (
            <input
              className={inputClass}
              placeholder={action.type === "block_order" ? t("blockMessagePlaceholder") : t("messagePlaceholder")}
              value={action.message ?? ""}
              onChange={(e) => setAction(i, { ...action, message: e.target.value })}
            />
          )}
          <p className="text-xs text-surface-foreground/60">{t(`actionHint_${action.type}`)}</p>
        </div>
      ))}
      <div>
        <Button type="button" variant="secondary" onClick={() => onChange([...value, { type: "disable_cod" }])}>
          + {t("addAction")}
        </Button>
      </div>
    </div>
  );
}

/** Which action rows still need input before the rule can be saved. */
export function actionsProblem(actions: RuleAction[]): boolean {
  if (actions.length === 0) return true;
  return actions.some(
    (a) =>
      (a.type === "disable_method" && !a.method) ||
      (a.type === "require_advance" && a.kind === "fixed" && !(Number(a.amount) > 0)) ||
      (a.type === "require_advance" && a.kind === "percent" && !(Number(a.percent) > 0)),
  );
}

/** Normalises a `require_advance` action without a kind (the select shows "delivery fee" by default). */
export function normaliseActions(actions: RuleAction[]): RuleAction[] {
  return actions.map((a) => (a.type === "require_advance" && !a.kind ? { ...a, kind: "delivery_fee" } : a));
}
