"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../lib/api";
import { localized } from "../../../../lib/format";
import { Banner, Button, Card, TextField, Toggle } from "../../../../components/ui";
import { selectClass, textareaClass } from "../../../../components/marketing-tabs";
import { Link } from "../../../../i18n/navigation";

interface Provider {
  id: string;
  name: string;
  driver: string;
  enabled: boolean;
}

interface FeatureConfig {
  feature: string;
  label: { bn: string; en: string };
  help: { bn: string; en: string };
  variables: string[];
  providerInstanceId: string | null;
  model: string | null;
  temperature: number | null;
  effort: string | null;
  maxTokens: number;
  promptTemplate: string;
  promptVersion: number;
  defaultPrompt: string;
  enabled: boolean;
  monthlyBudgetCents: number | null;
  monthlyTokenBudget: number | null;
  spent: { costMicroUsd: number; tokens: number; calls: number };
  budget: "ok" | "alert" | "exceeded";
}

interface Configs {
  enabled: boolean;
  providers: Provider[];
  features: FeatureConfig[];
  global: { budgetCents: number | null; spent: { costMicroUsd: number; calls: number }; budget: string };
}

interface Usage {
  month: string;
  totals: { calls: number; inputTokens: number; outputTokens: number; estCostMicroUsd: number };
  features: { feature: string; calls: number; inputTokens: number; outputTokens: number; estCostMicroUsd: number; avgLatencyMs: number }[];
  providers: { driver: string; model: string; calls: number; estCostMicroUsd: number; avgLatencyMs: number }[];
  statuses: Record<string, number>;
}

function usd(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(micro < 10_000 ? 4 : 2)}`;
}

/** AI providers per feature, prompts (versioned), budgets and usage (§10.4, §8.2 Settings "AI", §16 M13). */
export default function AiPage() {
  const t = useTranslations("ai");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [configs, setConfigs] = useState<Configs | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [drafts, setDrafts] = useState<Record<string, Partial<FeatureConfig>>>({});
  const [versions, setVersions] = useState<{ feature: string; rows: { version: number; template: string; createdAt: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, u] = await Promise.all([api.get<Configs>("/admin/ai/features"), api.get<Usage>(`/admin/ai/usage?month=${month}`)]);
      setConfigs(c);
      setUsage(u);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / month change
    void load();
  }, [load]);

  function field<K extends keyof FeatureConfig>(f: FeatureConfig, key: K): FeatureConfig[K] {
    return (drafts[f.feature]?.[key] ?? f[key]) as FeatureConfig[K];
  }

  function set(f: FeatureConfig, patch: Partial<FeatureConfig>) {
    setDrafts({ ...drafts, [f.feature]: { ...drafts[f.feature], ...patch } });
  }

  async function save(f: FeatureConfig) {
    setError(null);
    setNotice(null);
    const d = drafts[f.feature] ?? {};
    try {
      await api.put(`/admin/ai/features/${f.feature}`, {
        providerInstanceId: d.providerInstanceId !== undefined ? d.providerInstanceId || null : undefined,
        model: d.model !== undefined ? d.model || null : undefined,
        effort: d.effort !== undefined ? d.effort || null : undefined,
        temperature: d.temperature !== undefined ? d.temperature : undefined,
        maxTokens: d.maxTokens,
        promptTemplate: d.promptTemplate,
        enabled: d.enabled,
        monthlyBudgetCents: d.monthlyBudgetCents !== undefined ? d.monthlyBudgetCents : undefined,
        monthlyTokenBudget: d.monthlyTokenBudget !== undefined ? d.monthlyTokenBudget : undefined,
      });
      setDrafts({ ...drafts, [f.feature]: {} });
      setNotice(t("saved"));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  async function showVersions(feature: string) {
    setVersions({ feature, rows: await api.get(`/admin/ai/features/${feature}/versions`) });
  }

  async function restore(feature: string, version: number) {
    await api.post(`/admin/ai/features/${feature}/restore`, { version });
    setVersions(null);
    await load();
  }

  const nullableInt = (v: string): number | null => (v.trim() === "" ? null : Math.max(0, Number.parseInt(v, 10) || 0));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}
      {configs && !configs.enabled && <Banner kind="warning">{t("disabled")}</Banner>}
      {configs && configs.providers.filter((p) => p.enabled).length === 0 && (
        <Banner kind="warning">
          {t("noProviders")}{" "}
          <Link href="/integrations" className="underline">
            {t("openIntegrations")}
          </Link>
        </Banner>
      )}
      {configs && (
        <Banner kind={configs.global.budget === "exceeded" ? "error" : configs.global.budget === "alert" ? "warning" : "info"}>
          {t("globalSpend", { spent: usd(configs.global.spent.costMicroUsd), calls: configs.global.spent.calls, budget: configs.global.budgetCents === null ? t("noLimit") : usd(configs.global.budgetCents * 10_000) })}
        </Banner>
      )}

      {configs?.features.map((f) => (
        <Card key={f.feature} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-surface-foreground">{localized(f.label, locale)}</h2>
              <p className="text-xs text-surface-foreground/60">{localized(f.help, locale)}</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Toggle checked={field(f, "enabled")} onChange={(v) => set(f, { enabled: v })} />
              {tCommon("enabled")}
            </label>
          </div>
          <p className={`text-xs ${f.budget === "exceeded" ? "text-danger" : f.budget === "alert" ? "text-warning" : "text-surface-foreground/60"}`}>
            {t("featureSpend", { spent: usd(f.spent.costMicroUsd), tokens: f.spent.tokens.toLocaleString(), calls: f.spent.calls })}
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("provider")}</span>
              <select className={selectClass} value={field(f, "providerInstanceId") ?? ""} onChange={(e) => set(f, { providerInstanceId: e.target.value || null })}>
                <option value="">{t("defaultProvider")}</option>
                {configs.providers.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.enabled}>
                    {p.name} ({p.driver}){p.enabled ? "" : ` — ${tCommon("disabled")}`}
                  </option>
                ))}
              </select>
            </label>
            <TextField label={t("model")} value={field(f, "model") ?? ""} onChange={(e) => set(f, { model: e.target.value })} placeholder={t("modelPlaceholder")} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("effort")}</span>
              <select className={selectClass} value={field(f, "effort") ?? ""} onChange={(e) => set(f, { effort: e.target.value || null })}>
                <option value="">{t("effortDefault")}</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
            <TextField label={t("temperature")} inputMode="decimal" value={field(f, "temperature") === null ? "" : String(field(f, "temperature"))} onChange={(e) => set(f, { temperature: e.target.value === "" ? null : Number(e.target.value) })} />
            <TextField label={t("maxTokens")} inputMode="numeric" value={String(field(f, "maxTokens"))} onChange={(e) => set(f, { maxTokens: Number.parseInt(e.target.value, 10) || 256 })} />
            <TextField label={t("budgetCents")} inputMode="numeric" value={field(f, "monthlyBudgetCents") === null ? "" : String(field(f, "monthlyBudgetCents"))} onChange={(e) => set(f, { monthlyBudgetCents: nullableInt(e.target.value) })} />
            <TextField label={t("tokenBudget")} inputMode="numeric" value={field(f, "monthlyTokenBudget") === null ? "" : String(field(f, "monthlyTokenBudget"))} onChange={(e) => set(f, { monthlyTokenBudget: nullableInt(e.target.value) })} />
          </div>
          <p className="text-xs text-surface-foreground/60">{t("paramsHelp")}</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              {t("prompt")} · v{f.promptVersion}
            </span>
            <textarea className={`${textareaClass} font-mono text-xs`} rows={7} value={field(f, "promptTemplate")} onChange={(e) => set(f, { promptTemplate: e.target.value })} />
            <span className="text-xs text-surface-foreground/50">
              {t("variables")}: {f.variables.map((v) => `{${v}}`).join(" ")}
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save(f)} disabled={!drafts[f.feature] || Object.keys(drafts[f.feature]!).length === 0}>
              {tCommon("save")}
            </Button>
            <Button variant="secondary" onClick={() => void showVersions(f.feature)}>
              {t("history")}
            </Button>
            <Button variant="secondary" onClick={() => set(f, { promptTemplate: f.defaultPrompt })}>
              {t("resetPrompt")}
            </Button>
          </div>
          {versions?.feature === f.feature && (
            <ul className="flex flex-col gap-2 text-xs">
              {versions.rows.map((v) => (
                <li key={v.version} className="rounded-theme border border-border p-2">
                  <div className="mb-1 flex justify-between">
                    <span className="font-medium">
                      v{v.version} · {new Date(v.createdAt).toLocaleString()}
                    </span>
                    {v.version !== f.promptVersion && (
                      <button className="text-brand" onClick={() => void restore(f.feature, v.version)}>
                        {t("restore")}
                      </button>
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-surface-foreground/70">{v.template}</pre>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-semibold text-surface-foreground">{t("usage")}</h2>
          <TextField label={t("month")} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        {usage && (
          <>
            <p className="text-sm">
              {t("usageTotals", { calls: usage.totals.calls, tokens: (usage.totals.inputTokens + usage.totals.outputTokens).toLocaleString(), cost: usd(usage.totals.estCostMicroUsd) })}
              {Object.entries(usage.statuses).map(([status, n]) => ` · ${status}: ${n}`)}
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-foreground/60">
                  <th className="py-1">{t("feature")}</th>
                  <th>{t("calls")}</th>
                  <th>{t("tokensInOut")}</th>
                  <th>{t("cost")}</th>
                  <th>{t("latency")}</th>
                </tr>
              </thead>
              <tbody>
                {usage.features.map((f) => (
                  <tr key={f.feature} className="border-t border-border">
                    <td className="py-1">{f.feature}</td>
                    <td>{f.calls}</td>
                    <td>
                      {f.inputTokens.toLocaleString()} / {f.outputTokens.toLocaleString()}
                    </td>
                    <td>{usd(f.estCostMicroUsd)}</td>
                    <td>{f.avgLatencyMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-foreground/60">
                  <th className="py-1">{t("provider")}</th>
                  <th>{t("model")}</th>
                  <th>{t("calls")}</th>
                  <th>{t("cost")}</th>
                  <th>{t("latency")}</th>
                </tr>
              </thead>
              <tbody>
                {usage.providers.map((p) => (
                  <tr key={`${p.driver}-${p.model}`} className="border-t border-border">
                    <td className="py-1">{p.driver}</td>
                    <td>{p.model}</td>
                    <td>{p.calls}</td>
                    <td>{usd(p.estCostMicroUsd)}</td>
                    <td>{p.avgLatencyMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-surface-foreground/60">{t("costNote")}</p>
          </>
        )}
      </Card>
    </div>
  );
}
