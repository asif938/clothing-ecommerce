"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RFM_SEGMENTS, RFM_SEGMENT_LABELS } from "@clothing/shared/marketing";
import { api, ApiError } from "../../../../lib/api";
import { localized, type Localized } from "../../../../lib/format";
import { Banner, Button, Card, TextField } from "../../../../components/ui";
import { RfmPanel } from "../../../../components/rfm-panel";

type Field =
  | "totalSpent"
  | "ordersCount"
  | "deliveredCount"
  | "rejectedAtDoorCount"
  | "riskScore"
  | "pointsBalance"
  | "inactiveDays"
  | "tag"
  | "status"
  | "districtId"
  | "rfmSegment"
  | "rfmRecency"
  | "rfmFrequency"
  | "rfmMonetary"
  | "tierId"
  | "consent";
type Op = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in";

interface Condition {
  field: Field;
  op: Op;
  value: unknown;
}
interface Rules {
  match: "all" | "any";
  conditions: Condition[];
}
interface Segment {
  id: string;
  name: { bn?: string; en?: string };
  rules: Rules;
  memberCountCache: number;
}

/** How each field is entered: numbers get "at least / at most / exactly"; the rest have one fixed meaning. Money is typed in taka and stored in poisha. */
type FieldKind = "money" | "number" | "score5" | "days" | "tags" | "status" | "district" | "rfm" | "tiers" | "consent";
const FIELDS: { field: Field; kind: FieldKind }[] = [
  { field: "totalSpent", kind: "money" },
  { field: "ordersCount", kind: "number" },
  { field: "deliveredCount", kind: "number" },
  { field: "rejectedAtDoorCount", kind: "number" },
  { field: "inactiveDays", kind: "days" },
  { field: "tag", kind: "tags" },
  { field: "districtId", kind: "district" },
  { field: "rfmSegment", kind: "rfm" },
  { field: "tierId", kind: "tiers" },
  { field: "pointsBalance", kind: "number" },
  { field: "consent", kind: "consent" },
  { field: "status", kind: "status" },
  { field: "riskScore", kind: "number" },
  { field: "rfmRecency", kind: "score5" },
  { field: "rfmFrequency", kind: "score5" },
  { field: "rfmMonetary", kind: "score5" },
];
const kindOf = (field: Field) => FIELDS.find((f) => f.field === field)?.kind ?? "number";
const NUMERIC: FieldKind[] = ["money", "number", "score5"];

function newCondition(field: Field): Condition {
  switch (kindOf(field)) {
    case "money":
      return { field, op: "gte", value: 500000 };
    case "number":
      return { field, op: "gte", value: 1 };
    case "score5":
      return { field, op: "gte", value: 4 };
    case "days":
      return { field, op: "gte", value: 90 };
    case "tags":
      return { field, op: "in", value: [] };
    case "status":
      return { field, op: "eq", value: "active" };
    case "district":
      return { field, op: "eq", value: "" };
    case "rfm":
    case "tiers":
      return { field, op: "in", value: [] };
    case "consent":
      return { field, op: "eq", value: "sms" };
  }
}

const inputClass = "rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground";

function ConditionRow({ condition, onChange, onRemove, districts, tiers }: { condition: Condition; onChange: (c: Condition) => void; onRemove: () => void; districts: { id: string; label: string }[]; tiers: { id: string; label: string }[] }) {
  const t = useTranslations("segments");
  const locale = useLocale();
  const kind = kindOf(condition.field);
  const multi = (options: { id: string; label: string }[]) => {
    const value = (condition.value as string[] | undefined) ?? [];
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
              {options.find((o) => o.id === id)?.label ?? id}
              <button type="button" onClick={() => onChange({ ...condition, value: value.filter((x) => x !== id) })} className="text-surface-foreground/60 hover:text-danger">
                ×
              </button>
            </span>
          ))}
        </div>
        <select className={inputClass} value="" onChange={(e) => e.target.value && onChange({ ...condition, value: [...value, e.target.value] })}>
          <option value="">{t("addValue")}</option>
          {options.filter((o) => !value.includes(o.id)).map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2 rounded-theme border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <select className={inputClass} value={condition.field} onChange={(e) => onChange(newCondition(e.target.value as Field))}>
          {FIELDS.map((f) => (
            <option key={f.field} value={f.field}>{t(`field_${f.field}`)}</option>
          ))}
        </select>
        <button type="button" className="text-xs text-danger" onClick={onRemove}>
          {t("remove")}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {NUMERIC.includes(kind) && (
          <>
            <select className={inputClass} value={condition.op} onChange={(e) => onChange({ ...condition, op: e.target.value as Op })}>
              <option value="gte">{t("op_gte")}</option>
              <option value="lte">{t("op_lte")}</option>
              <option value="eq">{t("op_eq")}</option>
            </select>
            {kind === "money" ? (
              <label className="flex items-center gap-1 text-sm">
                ৳ <input type="number" min={0} className={inputClass} value={Number(condition.value ?? 0) / 100} onChange={(e) => onChange({ ...condition, value: Math.round(Number(e.target.value) * 100) })} />
              </label>
            ) : (
              <input type="number" min={kind === "score5" ? 1 : 0} max={kind === "score5" ? 5 : undefined} className={inputClass} value={Number(condition.value ?? 0)} onChange={(e) => onChange({ ...condition, value: Math.round(Number(e.target.value)) })} />
            )}
            {kind === "score5" && <span className="text-xs text-surface-foreground/60">{t("score5Hint")}</span>}
          </>
        )}
        {kind === "days" && (
          <>
            <select className={inputClass} value={condition.op === "lte" || condition.op === "lt" ? "lte" : "gte"} onChange={(e) => onChange({ ...condition, op: e.target.value as Op })}>
              <option value="gte">{t("inactive_gte")}</option>
              <option value="lte">{t("inactive_lte")}</option>
            </select>
            <input type="number" min={1} className={inputClass} value={Number(condition.value ?? 0)} onChange={(e) => onChange({ ...condition, value: Math.max(1, Math.round(Number(e.target.value))) })} />
            <span className="text-sm">{t("days")}</span>
          </>
        )}
        {kind === "tags" && (
          <input
            className={`${inputClass} min-w-64`}
            placeholder="vip, wholesale"
            value={((condition.value as string[] | undefined) ?? []).join(", ")}
            onChange={(e) => onChange({ ...condition, op: "in", value: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          />
        )}
        {kind === "status" && (
          <select className={inputClass} value={String(condition.value)} onChange={(e) => onChange({ ...condition, value: e.target.value })}>
            <option value="active">{t("status_active")}</option>
            <option value="blocked">{t("status_blocked")}</option>
          </select>
        )}
        {kind === "district" && (
          <select className={inputClass} value={String(condition.value ?? "")} onChange={(e) => onChange({ ...condition, value: e.target.value })}>
            <option value="">{t("chooseDistrict")}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        )}
        {kind === "rfm" && multi(RFM_SEGMENTS.map((s) => ({ id: s, label: localized(RFM_SEGMENT_LABELS[s], locale) })))}
        {kind === "tiers" && multi(tiers)}
        {kind === "consent" && (
          <select className={inputClass} value={String(condition.value)} onChange={(e) => onChange({ ...condition, value: e.target.value })}>
            <option value="sms">SMS</option>
            <option value="email">{t("consent_email")}</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        )}
      </div>
    </div>
  );
}

const EMPTY_RULES: Rules = { match: "all", conditions: [] };

/** A condition that can't be saved yet (an empty pick list or no district chosen). */
const incomplete = (c: Condition) => (Array.isArray(c.value) && c.value.length === 0) || (kindOf(c.field) === "district" && !c.value);

/**
 * Customer segments (docs/PROJECT_SPEC.md §8.2 "segments builder with live
 * count"): groups of customers for SMS/email campaigns, discounts and
 * personalised content, defined by plain conditions — no JSON. The count
 * updates as the rules change.
 */
export default function SegmentsPage() {
  const t = useTranslations("segments");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState("");
  const [nameBn, setNameBn] = useState("");
  const [rules, setRules] = useState<Rules>(EMPTY_RULES);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [districts, setDistricts] = useState<{ id: string; label: string }[]>([]);
  const [tiers, setTiers] = useState<{ id: string; label: string }[]>([]);

  async function load() {
    try {
      setSegments(await api.get<Segment[]>("/admin/segments"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load segments");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
    void api
      .get<{ id: string; name: Localized }[]>("/store/locations/districts")
      .then((rows) => setDistricts(rows.map((d) => ({ id: d.id, label: localized(d.name, locale) })).sort((a, b) => a.label.localeCompare(b.label))))
      .catch(() => undefined);
    void api
      .get<{ id: string; name: Localized }[]>("/admin/loyalty/tiers")
      .then((rows) => setTiers(rows.map((tier) => ({ id: tier.id, label: localized(tier.name, locale) }))))
      .catch(() => undefined);
  }, [locale]);

  const ready = rules.conditions.length > 0 && !rules.conditions.some(incomplete);

  // Live member count while editing.
  useEffect(() => {
    if (!ready) return;
    const handle = setTimeout(() => {
      api
        .post<{ count: number }>("/admin/segments/preview", rules)
        .then((r) => setPreviewCount(r.count))
        .catch(() => setPreviewCount(null));
    }, 500);
    return () => clearTimeout(handle);
  }, [rules, ready]);

  function reset() {
    setEditingId(null);
    setNameEn("");
    setNameBn("");
    setRules(EMPTY_RULES);
    setPreviewCount(null);
  }

  function startEdit(segment: Segment) {
    setEditingId(segment.id);
    setNameEn(segment.name.en ?? "");
    setNameBn(segment.name.bn ?? "");
    setRules(segment.rules?.conditions ? segment.rules : EMPTY_RULES);
  }

  async function handleSave() {
    if (!ready || !(nameEn || nameBn)) return;
    const body = { name: { ...(nameEn ? { en: nameEn } : {}), ...(nameBn ? { bn: nameBn } : {}) }, rules };
    try {
      if (editingId) await api.patch(`/admin/segments/${editingId}`, body);
      else await api.post("/admin/segments", body);
      reset();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save segment");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("deleteConfirm"))) return;
    try {
      await api.delete(`/admin/segments/${id}`);
      if (editingId === id) reset();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete segment");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      <p className="text-sm text-surface-foreground/70">{t("intro")}</p>
      {error && <Banner kind="error">{error}</Banner>}

      <RfmPanel onPresetsCreated={() => void load()} />

      <Card className="flex flex-col gap-3">
        {segments.map((segment) => (
          <div key={segment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-theme border border-border p-3">
            <span className="font-medium text-surface-foreground">
              {localized(segment.name, locale)} <span className="text-xs text-surface-foreground/50">({t("members", { count: segment.memberCountCache })})</span>
            </span>
            <div className="flex gap-3">
              <button onClick={() => startEdit(segment)} className="text-xs text-brand underline">{tCommon("edit")}</button>
              <button onClick={() => void handleDelete(segment.id)} className="text-xs text-danger">{tCommon("delete")}</button>
            </div>
          </div>
        ))}
        {segments.length === 0 && <p className="text-sm text-surface-foreground/50">{t("empty")}</p>}

        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <h2 className="text-sm font-semibold text-surface-foreground">{editingId ? t("editTitle") : t("add")}</h2>
          <div className="flex flex-wrap items-end gap-2">
            <TextField label={t("nameBn")} value={nameBn} onChange={(e) => setNameBn(e.target.value)} />
            <TextField label={t("nameEn")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </div>

          <span className="text-sm font-medium text-surface-foreground">{t("rulesTitle")}</span>
          {rules.conditions.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              {t("matchLabel")}
              <select className={inputClass} value={rules.match} onChange={(e) => setRules({ ...rules, match: e.target.value as Rules["match"] })}>
                <option value="all">{t("matchAll")}</option>
                <option value="any">{t("matchAny")}</option>
              </select>
            </label>
          )}
          {rules.conditions.map((condition, i) => (
            <ConditionRow
              key={i}
              condition={condition}
              districts={districts}
              tiers={tiers}
              onChange={(c) => setRules({ ...rules, conditions: rules.conditions.map((x, j) => (j === i ? c : x)) })}
              onRemove={() => setRules({ ...rules, conditions: rules.conditions.filter((_, j) => j !== i) })}
            />
          ))}
          <div>
            <Button variant="secondary" onClick={() => setRules({ ...rules, conditions: [...rules.conditions, newCondition("totalSpent")] })}>
              + {t("addCondition")}
            </Button>
          </div>

          <p className="text-sm text-surface-foreground/80">
            {!ready ? t("needCondition") : previewCount === null ? t("counting") : t("members", { count: previewCount })}
          </p>
          <div className="flex gap-2">
            <Button onClick={() => void handleSave()} disabled={!ready || !(nameEn || nameBn)}>
              {editingId ? tCommon("save") : t("add")}
            </Button>
            {editingId && (
              <Button variant="secondary" onClick={reset}>
                {tCommon("cancel")}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
