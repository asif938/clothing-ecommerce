"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";
import { ActionsEditor, ConditionsEditor, actionsProblem, normaliseActions, type Conditions, type RuleAction } from "../../../../components/payment-rule-editor";

interface PaymentRule {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  conditions: Conditions;
  actions: RuleAction[];
  stopProcessing: boolean;
}

interface FormState {
  name: string;
  priority: string;
  stopProcessing: boolean;
  conditions: Conditions;
  actions: RuleAction[];
}

const EMPTY_FORM: FormState = { name: "", priority: "0", stopProcessing: false, conditions: {}, actions: [{ type: "disable_cod" }] };

/**
 * Payment rules (docs/PROJECT_SPEC.md §6.5): "when an order looks like this,
 * do that" — e.g. ask for the delivery fee in advance outside Dhaka, or turn
 * off cash on delivery for high-risk orders. Built with plain form controls
 * (components/payment-rule-editor.tsx); nothing is typed as JSON.
 */
export default function PaymentRulesPage() {
  const t = useTranslations("paymentRules");
  const tCommon = useTranslations("common");
  const [rules, setRules] = useState<PaymentRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

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

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function startEdit(rule: PaymentRule) {
    setEditingId(rule.id);
    setForm({ name: rule.name, priority: String(rule.priority), stopProcessing: rule.stopProcessing, conditions: rule.conditions ?? {}, actions: rule.actions ?? [] });
    setShowForm(true);
  }

  const problem = !form.name.trim() ? t("needName") : actionsProblem(form.actions) ? t("needActionDetails") : null;

  async function handleSave() {
    if (problem) return;
    setError(null);
    const body = { name: form.name.trim(), priority: Number(form.priority) || 0, stopProcessing: form.stopProcessing, conditions: form.conditions, actions: normaliseActions(form.actions) };
    try {
      if (editingId) await api.patch(`/admin/payment-rules/${editingId}`, body);
      else await api.post("/admin/payment-rules", body);
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save rule");
    }
  }

  async function handleToggleActive(rule: PaymentRule) {
    try {
      await api.patch(`/admin/payment-rules/${rule.id}`, { isActive: !rule.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update rule");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("deleteConfirm"))) return;
    try {
      await api.delete(`/admin/payment-rules/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete rule");
    }
  }

  function summary(rule: PaymentRule): string {
    const keys = Object.keys(rule.conditions ?? {}).filter((k) => k !== "match");
    const when = keys.length === 0 ? t("summaryAlways") : keys.map((k) => t.has(`cond_${k}`) ? t(`cond_${k}`) : k).join(rule.conditions.match === "any" ? ` ${t("or")} ` : ` ${t("and")} `);
    const then = (rule.actions ?? []).map((a) => t(`action_${a.type}`)).join(", ");
    return `${t("summaryWhen")}: ${when} → ${then}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        {!showForm && <Button onClick={startCreate}>{t("addRule")}</Button>}
      </div>
      <p className="text-sm text-surface-foreground/70">{t("intro")}</p>
      {error && <Banner kind="error">{error}</Banner>}

      {showForm && (
        <Card className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-surface-foreground">{editingId ? t("editRule") : t("addRule")}</h2>
          <TextField label={t("name")} value={form.name} placeholder={t("namePlaceholder")} onChange={(e) => setForm({ ...form, name: e.target.value })} />

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-surface-foreground">{t("whenTitle")}</h3>
            <ConditionsEditor value={form.conditions} onChange={(conditions) => setForm({ ...form, conditions })} />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-surface-foreground">{t("thenTitle")}</h3>
            <ActionsEditor value={form.actions} onChange={(actions) => setForm({ ...form, actions })} />
          </section>

          <details className="text-sm">
            <summary className="cursor-pointer text-surface-foreground/70">{t("advanced")}</summary>
            <div className="mt-2 flex flex-col gap-2">
              <TextField label={t("priority")} type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
              <span className="text-xs text-surface-foreground/60">{t("priorityHint")}</span>
              <label className="flex items-center gap-2">
                <Toggle checked={form.stopProcessing} onChange={(v) => setForm({ ...form, stopProcessing: v })} /> {t("stopProcessing")}
              </label>
              <span className="text-xs text-surface-foreground/60">{t("stopProcessingHint")}</span>
            </div>
          </details>

          {problem && <p className="text-xs text-danger">{problem}</p>}
          <div className="flex gap-2">
            <Button onClick={() => void handleSave()} disabled={Boolean(problem)}>
              {editingId ? tCommon("save") : t("addRule")}
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        {[...rules]
          .sort((a, b) => b.priority - a.priority)
          .map((rule) => (
            <div key={rule.id} className="rounded-theme border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-surface-foreground">{rule.name}</span>
                <div className="flex items-center gap-3">
                  <Toggle checked={rule.isActive} onChange={() => void handleToggleActive(rule)} />
                  <button onClick={() => startEdit(rule)} className="text-xs text-brand underline">
                    {tCommon("edit")}
                  </button>
                  <button onClick={() => void handleDelete(rule.id)} className="text-xs text-danger">
                    {tCommon("delete")}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-surface-foreground/70">{summary(rule)}</p>
            </div>
          ))}
        {rules.length === 0 && <p className="text-sm text-surface-foreground/50">{t("empty")}</p>}
      </Card>
    </div>
  );
}
