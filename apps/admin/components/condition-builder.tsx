"use client";

import { useTranslations } from "next-intl";
import { CONDITION_OPERATORS, ORDER_CONDITION_FIELDS, type ConditionGroup, type ConditionOperator, type ConditionRule } from "@clothing/shared/automation";
import { Button } from "./ui";

const selectClass = "rounded-theme border border-border bg-surface px-2 py-2 text-sm text-surface-foreground";

/** Parses what the user typed into the typed value the evaluator expects for this field and operator. */
function parseValue(raw: string, fieldType: "number" | "string" | "boolean" | "list", op: ConditionOperator): ConditionRule["value"] {
  if (op === "in" || op === "not_in") {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (fieldType === "number" && part !== "" && !Number.isNaN(Number(part)) ? Number(part) : part));
  }
  if (fieldType === "boolean") return raw === "true";
  if (fieldType === "number") return raw === "" || Number.isNaN(Number(raw)) ? 0 : Number(raw);
  return raw;
}

function displayValue(value: ConditionRule["value"]): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

/**
 * Visual editor for the shared `{ match, rules[] }` condition model - used by
 * both the automation rule builder and the courier assignment rules, so the
 * two screens behave identically. Money fields are poisha (1 BDT = 100).
 */
export function ConditionBuilder({ value, onChange, locale }: { value: ConditionGroup; onChange: (next: ConditionGroup) => void; locale: "bn" | "en" }) {
  const t = useTranslations("automation");

  function updateRule(index: number, patch: Partial<ConditionRule>) {
    onChange({ ...value, rules: value.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-surface-foreground">
        <span>{t("matchPrefix")}</span>
        <select className={selectClass} value={value.match} onChange={(e) => onChange({ ...value, match: e.target.value as "all" | "any" })}>
          <option value="all">{t("matchAll")}</option>
          <option value="any">{t("matchAny")}</option>
        </select>
        <span>{t("matchSuffix")}</span>
      </div>

      {value.rules.length === 0 && <p className="text-xs text-surface-foreground/60">{t("noConditions")}</p>}

      {value.rules.map((rule, index) => {
        const field = ORDER_CONDITION_FIELDS.find((f) => f.key === rule.field);
        const fieldType = field?.type ?? "string";
        return (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <select
              className={selectClass}
              value={rule.field}
              onChange={(e) => {
                const next = ORDER_CONDITION_FIELDS.find((f) => f.key === e.target.value);
                updateRule(index, { field: e.target.value, value: next?.type === "boolean" ? true : next?.type === "number" ? 0 : "" });
              }}
            >
              {ORDER_CONDITION_FIELDS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label[locale]}
                </option>
              ))}
            </select>
            <select className={selectClass} value={rule.op} onChange={(e) => updateRule(index, { op: e.target.value as ConditionOperator })}>
              {CONDITION_OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {t(`op.${op}`)}
                </option>
              ))}
            </select>
            {fieldType === "boolean" && rule.op !== "in" && rule.op !== "not_in" ? (
              <select className={selectClass} value={String(rule.value)} onChange={(e) => updateRule(index, { value: e.target.value === "true" })}>
                <option value="true">{t("yes")}</option>
                <option value="false">{t("no")}</option>
              </select>
            ) : (
              <input
                className={`${selectClass} w-48`}
                value={displayValue(rule.value)}
                placeholder={rule.op === "in" || rule.op === "not_in" ? t("commaSeparated") : undefined}
                onChange={(e) => updateRule(index, { value: parseValue(e.target.value, fieldType, rule.op) })}
              />
            )}
            <Button type="button" variant="secondary" onClick={() => onChange({ ...value, rules: value.rules.filter((_, i) => i !== index) })}>
              {t("remove")}
            </Button>
          </div>
        );
      })}

      <div>
        <Button type="button" variant="secondary" onClick={() => onChange({ ...value, rules: [...value.rules, { field: ORDER_CONDITION_FIELDS[0]!.key, op: "gte", value: 0 }] })}>
          {t("addCondition")}
        </Button>
      </div>
    </div>
  );
}
