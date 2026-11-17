"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AUTOMATION_ACTION_TYPES, AUTOMATION_TRIGGERS, type AutomationAction, type AutomationRuleInput, type AutomationTemplate, type ConditionGroup } from "@clothing/shared/automation";
import { api, ApiError } from "../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";
import { OrderPicker, StaffSelect, orderLabel } from "../../../../components/record-pickers";
import { ConditionBuilder } from "../../../../components/condition-builder";

interface RuleRow {
  id: string;
  name: string;
  trigger: AutomationRuleInput["trigger"];
  conditions: ConditionGroup;
  actions: AutomationAction[];
  stopProcessing: boolean;
  priority: number;
  isActive: boolean;
  runCount: number;
}

interface RunRow {
  id: string;
  trigger: string;
  entityId: string | null;
  status: "matched" | "skipped" | "failed";
  result: string[] | null;
  error: string | null;
  createdAt: string;
  rule: { name: string };
}

interface TestResult {
  matched: boolean;
  explanation: { rule: { field: string; op: string; value: unknown }; actual: unknown; passed: boolean }[];
  wouldRun: string[];
}

const selectClass = "rounded-theme border border-border bg-surface px-2 py-2 text-sm text-surface-foreground";

function blankRule(): AutomationRuleInput {
  return { name: "", trigger: "order.placed", conditions: { match: "all", rules: [] }, actions: [{ type: "add_tag", tag: "", target: "order" }], stopProcessing: false, priority: 100, isActive: true };
}

function defaultAction(type: AutomationAction["type"]): AutomationAction {
  switch (type) {
    case "add_tag":
    case "remove_tag":
      return { type, tag: "", target: "order" };
    case "set_status":
      return { type, status: "confirmed" };
    case "assign_queue":
      return { type };
    case "assign_staff":
      return { type, staffId: "" };
    case "notify_staff":
      return { type, permission: "orders.manage", title: { bn: "", en: "" }, body: { bn: "", en: "" } };
    case "send_notification":
      return { type, event: "order_confirmed" };
    case "call_webhook":
      return { type, url: "https://" };
    case "add_note":
      return { type, note: "" };
  }
}

function ActionEditor({ action, onChange, onRemove }: { action: AutomationAction; onChange: (next: AutomationAction) => void; onRemove: () => void }) {
  const t = useTranslations("automation");
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-theme border border-border p-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-surface-foreground">{t("action")}</span>
        <select className={selectClass} value={action.type} onChange={(e) => onChange(defaultAction(e.target.value as AutomationAction["type"]))}>
          {AUTOMATION_ACTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`actionTypes.${type}`)}
            </option>
          ))}
        </select>
      </label>

      {(action.type === "add_tag" || action.type === "remove_tag") && (
        <>
          <TextField label={t("tag")} value={action.tag} onChange={(e) => onChange({ ...action, tag: e.target.value })} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("target")}</span>
            <select className={selectClass} value={action.target} onChange={(e) => onChange({ ...action, target: e.target.value as "order" | "customer" })}>
              <option value="order">{t("targetOrder")}</option>
              <option value="customer">{t("targetCustomer")}</option>
            </select>
          </label>
        </>
      )}
      {action.type === "set_status" && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-surface-foreground">{t("status")}</span>
            <select className={selectClass} value={action.status} onChange={(e) => onChange({ ...action, status: e.target.value as "confirmed" | "on_hold" | "cancelled" })}>
              <option value="confirmed">confirmed</option>
              <option value="on_hold">on_hold</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>
          <TextField label={t("reason")} value={action.reason ?? ""} onChange={(e) => onChange({ ...action, reason: e.target.value })} />
        </>
      )}
      {action.type === "assign_staff" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("staffId")}</span>
          <StaffSelect value={action.staffId} onChange={(staffId) => onChange({ ...action, staffId })} />
        </label>
      )}
      {action.type === "notify_staff" && (
        <>
          <TextField label={t("permission")} value={action.permission} onChange={(e) => onChange({ ...action, permission: e.target.value })} />
          <TextField label={`${t("notifyTitle")} (bn)`} value={action.title.bn} onChange={(e) => onChange({ ...action, title: { ...action.title, bn: e.target.value } })} />
          <TextField label={`${t("notifyTitle")} (en)`} value={action.title.en} onChange={(e) => onChange({ ...action, title: { ...action.title, en: e.target.value } })} />
          <TextField label={`${t("notifyBody")} (bn)`} value={action.body.bn} onChange={(e) => onChange({ ...action, body: { ...action.body, bn: e.target.value } })} />
          <TextField label={`${t("notifyBody")} (en)`} value={action.body.en} onChange={(e) => onChange({ ...action, body: { ...action.body, en: e.target.value } })} />
        </>
      )}
      {action.type === "send_notification" && <TextField label={t("event")} value={action.event} onChange={(e) => onChange({ ...action, event: e.target.value })} />}
      {action.type === "call_webhook" && <TextField label={t("url")} value={action.url} onChange={(e) => onChange({ ...action, url: e.target.value })} />}
      {action.type === "add_note" && <TextField label={t("note")} value={action.note} onChange={(e) => onChange({ ...action, note: e.target.value })} />}
      <Button type="button" variant="secondary" onClick={onRemove}>
        {t("remove")}
      </Button>
    </div>
  );
}

/** Automation rule builder (docs/PROJECT_SPEC.md §8.2 Automation, §16 M11): trigger → conditions → actions, templates, run history, and a dry-run "test with sample event". */
export default function AutomationPage() {
  const t = useTranslations("automation");
  const locale = useLocale() as "bn" | "en";
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; rule: AutomationRuleInput } | null>(null);
  const [testOrderId, setTestOrderId] = useState("");
  const [testOrderLabel, setTestOrderLabel] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    try {
      const [ruleRows, templateRows, runRows] = await Promise.all([
        api.get<RuleRow[]>("/admin/automation/rules"),
        api.get<AutomationTemplate[]>("/admin/automation/templates"),
        api.get<RunRow[]>("/admin/automation/runs?limit=30"),
      ]);
      setRules(ruleRows);
      setTemplates(templateRows);
      setRuns(runRows);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load automation");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount.
    void load();
  }, [load]);

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
    if (!editing) return;
    await run(async () => {
      if (editing.id) await api.put(`/admin/automation/rules/${editing.id}`, editing.rule);
      else await api.post("/admin/automation/rules", editing.rule);
      setEditing(null);
      setTestResult(null);
    });
  }

  async function runTest() {
    if (!editing) return;
    setError(null);
    try {
      setTestResult(
        await api.post<TestResult>("/admin/automation/test", {
          trigger: editing.rule.trigger,
          conditions: editing.rule.conditions,
          actions: editing.rule.actions,
          orderId: testOrderId || undefined,
          context: testOrderId ? undefined : {},
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Test failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setEditing({ id: null, rule: blankRule() })}>{t("newRule")}</Button>
      </div>
      {error && <Banner kind="error">{error}</Banner>}

      {editing && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-surface-foreground">{editing.id ? t("editRule") : t("newRule")}</h2>
          <div className="flex flex-wrap items-end gap-3">
            <TextField label={t("name")} value={editing.rule.name} onChange={(e) => setEditing({ ...editing, rule: { ...editing.rule, name: e.target.value } })} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-surface-foreground">{t("trigger")}</span>
              <select className={selectClass} value={editing.rule.trigger} onChange={(e) => setEditing({ ...editing, rule: { ...editing.rule, trigger: e.target.value as AutomationRuleInput["trigger"] } })}>
                {AUTOMATION_TRIGGERS.map((trigger) => (
                  <option key={trigger.key} value={trigger.key}>
                    {trigger.label[locale]}
                  </option>
                ))}
              </select>
            </label>
            <TextField label={t("priority")} type="number" value={editing.rule.priority} onChange={(e) => setEditing({ ...editing, rule: { ...editing.rule, priority: Number(e.target.value) || 100 } })} />
            <label className="flex items-center gap-2 text-sm text-surface-foreground">
              <input type="checkbox" checked={editing.rule.stopProcessing} onChange={(e) => setEditing({ ...editing, rule: { ...editing.rule, stopProcessing: e.target.checked } })} />
              {t("stopProcessing")}
            </label>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-surface-foreground">{t("conditions")}</h3>
            <ConditionBuilder locale={locale} value={editing.rule.conditions} onChange={(conditions) => setEditing({ ...editing, rule: { ...editing.rule, conditions } })} />
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-surface-foreground">{t("actions")}</h3>
            {editing.rule.actions.map((action, index) => (
              <ActionEditor
                key={index}
                action={action}
                onChange={(next) => setEditing({ ...editing, rule: { ...editing.rule, actions: editing.rule.actions.map((a, i) => (i === index ? next : a)) } })}
                onRemove={() => setEditing({ ...editing, rule: { ...editing.rule, actions: editing.rule.actions.filter((_, i) => i !== index) } })}
              />
            ))}
            <div>
              <Button type="button" variant="secondary" onClick={() => setEditing({ ...editing, rule: { ...editing.rule, actions: [...editing.rule.actions, defaultAction("add_note")] } })}>
                {t("addAction")}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-theme bg-muted p-3">
            <h3 className="text-sm font-semibold text-surface-foreground">{t("testTitle")}</h3>
            <p className="text-xs text-surface-foreground/60">{t("testHelp")}</p>
            <div className="flex items-end gap-2">
              <div className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
                <span className="font-medium text-surface-foreground">{t("orderId")}</span>
                {testOrderLabel ? (
                  <span className="flex items-center gap-2">
                    {testOrderLabel}
                    <button
                      type="button"
                      className="text-xs text-danger"
                      onClick={() => {
                        setTestOrderId("");
                        setTestOrderLabel("");
                      }}
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  <OrderPicker
                    onPick={(o) => {
                      setTestOrderId(o.id);
                      setTestOrderLabel(orderLabel(o));
                    }}
                  />
                )}
              </div>
              <Button type="button" variant="secondary" onClick={() => void runTest()}>
                {t("runTest")}
              </Button>
            </div>
            {testResult && (
              <div className="text-sm text-surface-foreground">
                <p className={testResult.matched ? "font-semibold text-success" : "font-semibold text-danger"}>{testResult.matched ? t("wouldMatch") : t("wouldNotMatch")}</p>
                <ul className="list-disc pl-5">
                  {testResult.explanation.map((row, i) => (
                    <li key={i} className={row.passed ? "text-success" : "text-danger"}>
                      {row.rule.field} {row.rule.op} {JSON.stringify(row.rule.value)} - {t("actual")}: {JSON.stringify(row.actual) ?? "-"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => void save()}>{t("save")}</Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t("cancel")}
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="px-4 py-3">{t("name")}</th>
              <th className="px-4 py-3">{t("trigger")}</th>
              <th className="px-4 py-3">{t("runs")}</th>
              <th className="px-4 py-3">{t("active")}</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-surface-foreground">{rule.name}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{AUTOMATION_TRIGGERS.find((tr) => tr.key === rule.trigger)?.label[locale] ?? rule.trigger}</td>
                <td className="px-4 py-3 text-surface-foreground/70">{rule.runCount}</td>
                <td className="px-4 py-3">
                  <Toggle checked={rule.isActive} onChange={(isActive) => void run(() => api.patch(`/admin/automation/rules/${rule.id}/active`, { isActive }))} />
                </td>
                <td className="flex gap-2 px-4 py-3">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setEditing({
                        id: rule.id,
                        rule: { name: rule.name, trigger: rule.trigger, conditions: rule.conditions, actions: rule.actions, stopProcessing: rule.stopProcessing, priority: rule.priority, isActive: rule.isActive },
                      })
                    }
                  >
                    {t("edit")}
                  </Button>
                  <Button variant="danger" onClick={() => void run(() => api.delete(`/admin/automation/rules/${rule.id}`))}>
                    {t("delete")}
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

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("templates")}</h2>
        <p className="text-xs text-surface-foreground/60">{t("templatesHelp")}</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {templates.map((template) => (
            <div key={template.key} className="flex flex-col gap-2 rounded-theme border border-border p-3">
              <div className="font-medium text-surface-foreground">{template.name[locale]}</div>
              <p className="text-xs text-surface-foreground/60">{template.description[locale]}</p>
              <div>
                <Button variant="secondary" onClick={() => void run(() => api.post(`/admin/automation/templates/${template.key}`))}>
                  {t("addTemplate")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-0">
        <h2 className="px-4 pt-4 text-lg font-semibold text-surface-foreground">{t("history")}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-surface-foreground/50">
              <th className="px-4 py-3">{t("when")}</th>
              <th className="px-4 py-3">{t("name")}</th>
              <th className="px-4 py-3">{t("status")}</th>
              <th className="px-4 py-3">{t("result")}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-surface-foreground/70">{new Date(row.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-surface-foreground">{row.rule.name}</td>
                <td className={`px-4 py-3 ${row.status === "failed" ? "text-danger" : row.status === "skipped" ? "text-warning" : "text-success"}`}>{row.status}</td>
                <td className="px-4 py-3 text-xs text-surface-foreground/70">{row.error ?? (row.result ?? []).join("; ")}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-surface-foreground/50" colSpan={4}>
                  {t("noRuns")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
