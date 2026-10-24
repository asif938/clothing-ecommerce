"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";

interface PaymentRule {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  conditions: Record<string, unknown>;
  actions: unknown[];
  stopProcessing: boolean;
}

/**
 * Payment rules editor (docs/PROJECT_SPEC.md §16 M5, §6.5). Conditions and
 * actions are entered as raw JSON — the condition/action vocabulary is
 * deliberately rich (order totals, zones, customer history, risk level,
 * payment method, time windows, …, see `payment-rules-engine.ts`), and a
 * full visual rule builder for all of it is a bigger UI investment than
 * this milestone's remaining scope; a JSON editor is the honest MVP,
 * still fully admin-editable per golden rule 1 — see docs/DECISIONS.md.
 */
export default function PaymentRulesPage() {
  const t = useTranslations("paymentRules");
  const tCommon = useTranslations("common");
  const [rules, setRules] = useState<PaymentRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("0");
  const [stopProcessing, setStopProcessing] = useState(false);
  const [conditionsJson, setConditionsJson] = useState("{}");
  const [actionsJson, setActionsJson] = useState("[]");
  const [jsonError, setJsonError] = useState<string | null>(null);

  async function load() {
    try {
      setRules(await api.get<PaymentRule[]>("/admin/payment-rules"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load payment rules");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, []);

  async function handleCreate() {
    setJsonError(null);
    let conditions: unknown;
    let actions: unknown;
    try {
      conditions = JSON.parse(conditionsJson);
      actions = JSON.parse(actionsJson);
    } catch {
      setJsonError(t("invalidJson"));
      return;
    }
    try {
      await api.post("/admin/payment-rules", { name, priority: Number(priority), conditions, actions, stopProcessing });
      setName("");
      setPriority("0");
      setStopProcessing(false);
      setConditionsJson("{}");
      setActionsJson("[]");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create payment rule");
    }
  }

  async function handleToggleActive(rule: PaymentRule) {
    try {
      await api.patch(`/admin/payment-rules/${rule.id}`, { isActive: !rule.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update payment rule");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/admin/payment-rules/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete payment rule");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
      {error && <Banner kind="error">{error}</Banner>}

      <Card className="flex flex-col gap-3">
        {rules
          .sort((a, b) => b.priority - a.priority)
          .map((rule) => (
            <div key={rule.id} className="rounded-theme border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-surface-foreground">
                  {rule.name} <span className="text-xs text-surface-foreground/50">priority {rule.priority}</span>
                </span>
                <div className="flex items-center gap-3">
                  <Toggle checked={rule.isActive} onChange={() => void handleToggleActive(rule)} />
                  <button onClick={() => void handleDelete(rule.id)} className="text-xs text-danger">
                    {tCommon("delete")}
                  </button>
                </div>
              </div>
              <pre className="mt-2 overflow-x-auto rounded-theme bg-muted p-2 text-xs text-surface-foreground/70">
                {JSON.stringify({ conditions: rule.conditions, actions: rule.actions, stopProcessing: rule.stopProcessing }, null, 2)}
              </pre>
            </div>
          ))}
        {rules.length === 0 && <p className="text-sm text-surface-foreground/50">—</p>}

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <TextField label={t("name")} value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label={t("priority")} type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              <Toggle checked={stopProcessing} onChange={setStopProcessing} /> {t("stopProcessing")}
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("conditions")}</span>
            <textarea value={conditionsJson} onChange={(e) => setConditionsJson(e.target.value)} rows={3} className="rounded-theme border border-border bg-surface px-3 py-2 text-xs font-mono" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("actions")}</span>
            <textarea value={actionsJson} onChange={(e) => setActionsJson(e.target.value)} rows={3} className="rounded-theme border border-border bg-surface px-3 py-2 text-xs font-mono" />
          </label>
          {jsonError && <Banner kind="error">{jsonError}</Banner>}
          <Button onClick={() => void handleCreate()} disabled={!name} className="self-start">
            {t("addRule")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
