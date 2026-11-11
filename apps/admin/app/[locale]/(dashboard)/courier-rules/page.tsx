"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ConditionGroup } from "@clothing/shared/automation";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";
import { ConditionBuilder } from "../../../../components/condition-builder";

interface RuleRow {
  id: string;
  name: string;
  priority: number;
  conditions: ConditionGroup;
  courierProviderInstanceId: string;
  isActive: boolean;
}

interface CourierOption {
  instanceId: string | null;
  driver: string;
  label: string;
}

interface Draft {
  id: string | null;
  name: string;
  priority: number;
  conditions: ConditionGroup;
  courierProviderInstanceId: string;
  isActive: boolean;
}

const selectClass = "rounded-theme border border-border bg-surface px-2 py-2 text-sm text-surface-foreground";

/** Auto courier assignment rules (docs/PROJECT_SPEC.md §16 M11): the first active rule (lowest priority number) that matches an order picks its courier when booking with "auto". */
export default function CourierRulesPage() {
  const t = useTranslations("courierRules");
  const tAuto = useTranslations("automation");
  const locale = useLocale() as "bn" | "en";
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [previewOrderId, setPreviewOrderId] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ruleRows, courierRows] = await Promise.all([api.get<RuleRow[]>("/admin/courier-rules"), api.get<CourierOption[]>("/admin/couriers/available")]);
      setRules(ruleRows);
      setCouriers(courierRows.filter((c) => c.instanceId !== null));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load courier rules");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

  const labelFor = (instanceId: string) => couriers.find((c) => c.instanceId === instanceId)?.label ?? instanceId;

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    }
  }

  async function save() {
    if (!draft) return;
    const body = { name: draft.name, priority: draft.priority, conditions: draft.conditions, courierProviderInstanceId: draft.courierProviderInstanceId, isActive: draft.isActive };
    await run(async () => {
      if (draft.id) await api.put(`/admin/courier-rules/${draft.id}`, body);
      else await api.post("/admin/courier-rules", body);
      setDraft(null);
    });
  }

  async function runPreview() {
    setError(null);
    setPreview(null);
    try {
      const result = await api.get<{ match: { ruleName: string; providerInstanceId: string } | null }>(`/admin/courier-rules/preview/${previewOrderId}`);
      setPreview(result.match ? `${result.match.ruleName} → ${labelFor(result.match.providerInstanceId)}` : t("noMatch"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Preview failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setDraft({ id: null, name: "", priority: 100, conditions: { match: "all", rules: [] }, courierProviderInstanceId: couriers[0]?.instanceId ?? "", isActive: true })}>{t("newRule")}</Button>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      {draft && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <TextField label={tAuto("name")} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <TextField label={tAuto("priority")} type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 100 })} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-surface-foreground">{t("courier")}</span>
              <select className={selectClass} value={draft.courierProviderInstanceId} onChange={(e) => setDraft({ ...draft, courierProviderInstanceId: e.target.value })}>
                {couriers.map((c) => (
                  <option key={c.instanceId} value={c.instanceId ?? ""}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-surface-foreground/60">{t("emptyConditionsHelp")}</p>
          <ConditionBuilder locale={locale} value={draft.conditions} onChange={(conditions) => setDraft({ ...draft, conditions })} />
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={!draft.name || !draft.courierProviderInstanceId}>
              {tAuto("save")}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {tAuto("cancel")}
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="px-4 py-3">{tAuto("priority")}</th>
              <th className="px-4 py-3">{tAuto("name")}</th>
              <th className="px-4 py-3">{t("courier")}</th>
              <th className="px-4 py-3">{tAuto("active")}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-surface-foreground/70">{rule.priority}</td>
                <td className="px-4 py-3 text-surface-foreground">{rule.name}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{labelFor(rule.courierProviderInstanceId)}</td>
                <td className="px-4 py-3">
                  <Toggle
                    checked={rule.isActive}
                    onChange={(isActive) =>
                      void run(() => api.put(`/admin/courier-rules/${rule.id}`, { name: rule.name, priority: rule.priority, conditions: rule.conditions, courierProviderInstanceId: rule.courierProviderInstanceId, isActive }))
                    }
                  />
                </td>
                <td className="flex gap-2 px-4 py-3">
                  <Button variant="secondary" onClick={() => setDraft({ id: rule.id, name: rule.name, priority: rule.priority, conditions: rule.conditions, courierProviderInstanceId: rule.courierProviderInstanceId, isActive: rule.isActive })}>
                    {tAuto("edit")}
                  </Button>
                  <Button variant="danger" onClick={() => void run(() => api.delete(`/admin/courier-rules/${rule.id}`))}>
                    {tAuto("delete")}
                  </Button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={5}>
                  {t("noRules")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("previewTitle")}</h2>
        <div className="flex items-end gap-2">
          <TextField label={tAuto("orderId")} value={previewOrderId} onChange={(e) => setPreviewOrderId(e.target.value)} />
          <Button variant="secondary" onClick={() => void runPreview()} disabled={!previewOrderId}>
            {t("preview")}
          </Button>
        </div>
        {preview && <p className="text-sm text-surface-foreground">{preview}</p>}
      </Card>
    </div>
  );
}
