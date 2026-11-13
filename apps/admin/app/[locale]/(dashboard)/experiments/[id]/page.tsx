"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card, TextField } from "../../../../../components/ui";
import { selectClass, textareaClass } from "../../../../../components/marketing-tabs";
import { Link, useRouter } from "../../../../../i18n/navigation";
import { money, pct } from "../../../../../lib/format";

type LocalizedText = { bn?: string; en?: string };
type Kind = "block" | "announcement" | "offer";
type Goal = "purchase" | "add_to_cart" | "click";
type Status = "draft" | "running" | "paused" | "completed";

interface Variant {
  key: string;
  name: string;
  weight: number;
  payload?: unknown;
}

interface Experiment {
  id: string;
  name: string;
  hypothesis: string | null;
  kind: Kind;
  status: Status;
  goal: Goal;
  trafficPercent: number;
  variants: Variant[];
  target: { pageId?: string; blockId?: string; announcementId?: string } | null;
  startedAt: string | null;
  endedAt: string | null;
  winnerKey: string | null;
}

interface Targets {
  pages: { id: string; slug: string; title: string; blocks: { id: string; type: string; props: Record<string, unknown> }[] }[];
  announcements: { id: string; message: LocalizedText; isActive: boolean }[];
  discounts: { id: string; name: string; type: string; code: string | null; status: string }[];
}

interface Results {
  confidencePercent: number;
  minVisitorsPerVariant: number;
  summary: {
    verdict: "collecting" | "winner" | "control_better" | "no_difference";
    winnerKey: string | null;
    variants: { key: string; visitors: number; conversions: number; conversionRate: number; uplift: number | null; pValue: number | null; significant: boolean; revenuePerVisitor: number }[];
  };
  secondary: { key: string; orders: number; buyers: number; revenue: number; addToCartVisitors: number; clickVisitors: number }[];
  visitorsNeededPerVariant: number | null;
}

interface Form {
  name: string;
  hypothesis: string;
  kind: Kind;
  goal: Goal;
  trafficPercent: number;
  target: Experiment["target"];
  variants: Variant[];
}

const EMPTY_FORM: Form = {
  name: "",
  hypothesis: "",
  kind: "block",
  goal: "click",
  trafficPercent: 100,
  target: null,
  variants: [
    { key: "control", name: "A — current", weight: 50 },
    { key: "b", name: "B", weight: 50 },
  ],
};

const DEFAULT_GOAL: Record<Kind, Goal> = { block: "click", announcement: "click", offer: "purchase" };

function textOf(value: LocalizedText | null | undefined): string {
  return value?.en || value?.bn || "";
}

/** Payload editors for one non-control (or offer) variant. */
function VariantPayloadEditor({ kind, variant, targets, blockProps, onChange }: { kind: Kind; variant: Variant; targets: Targets | null; blockProps: Record<string, unknown> | null; onChange: (payload: unknown) => void }) {
  const t = useTranslations("experiments");
  const [jsonText, setJsonText] = useState(() => JSON.stringify((variant.payload as { props?: unknown } | undefined)?.props ?? blockProps ?? {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  if (kind === "block") {
    return (
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("blockProps")}</span>
        <textarea
          className={`${textareaClass} font-mono text-xs`}
          rows={8}
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value);
            try {
              onChange({ props: JSON.parse(e.target.value) as unknown });
              setJsonError(null);
            } catch {
              setJsonError(t("invalidJson"));
            }
          }}
        />
        {jsonError && <span className="text-xs text-danger">{jsonError}</span>}
        <span className="text-xs text-surface-foreground/60">{t("blockPropsHelp")}</span>
      </label>
    );
  }

  if (kind === "announcement") {
    const payload = (variant.payload as { message?: LocalizedText; linkText?: LocalizedText | null; linkUrl?: string | null } | undefined) ?? {};
    const set = (patch: object) => onChange({ message: payload.message ?? {}, ...payload, ...patch });
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField label={t("messageBn")} value={payload.message?.bn ?? ""} onChange={(e) => set({ message: { ...payload.message, bn: e.target.value } })} />
        <TextField label={t("messageEn")} value={payload.message?.en ?? ""} onChange={(e) => set({ message: { ...payload.message, en: e.target.value } })} />
        <TextField label={t("linkTextBn")} value={payload.linkText?.bn ?? ""} onChange={(e) => set({ linkText: { ...payload.linkText, bn: e.target.value } })} />
        <TextField label={t("linkTextEn")} value={payload.linkText?.en ?? ""} onChange={(e) => set({ linkText: { ...payload.linkText, en: e.target.value } })} />
        <TextField label={t("linkUrl")} value={payload.linkUrl ?? ""} onChange={(e) => set({ linkUrl: e.target.value || null })} />
      </div>
    );
  }

  const payload = (variant.payload as { discountId?: string | null; message?: LocalizedText | null } | undefined) ?? { discountId: null };
  const set = (patch: object) => onChange({ discountId: payload.discountId ?? null, message: payload.message ?? null, ...patch });
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="font-medium">{t("discount")}</span>
        <select className={selectClass} value={payload.discountId ?? ""} onChange={(e) => set({ discountId: e.target.value || null })}>
          <option value="">{t("noOffer")}</option>
          {targets?.discounts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.code ? ` (${d.code})` : ` — ${t("automatic")}`}
            </option>
          ))}
        </select>
      </label>
      <TextField label={t("offerMessageBn")} value={payload.message?.bn ?? ""} onChange={(e) => set({ message: { ...payload.message, bn: e.target.value } })} />
      <TextField label={t("offerMessageEn")} value={payload.message?.en ?? ""} onChange={(e) => set({ message: { ...payload.message, en: e.target.value } })} />
    </div>
  );
}

/** Create/edit an A/B test, run it, read its results, and apply the winner (§16 M14). */
export default function ExperimentPage() {
  const t = useTranslations("experiments");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const isNew = params.id === "new";
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [winnerKey, setWinnerKey] = useState("");
  const [applyWinner, setApplyWinner] = useState(true);

  const load = useCallback(async () => {
    try {
      setTargets(await api.get<Targets>("/admin/experiments/targets"));
      if (isNew) return;
      const row = await api.get<Experiment>(`/admin/experiments/${params.id}`);
      setExperiment(row);
      setForm({ name: row.name, hypothesis: row.hypothesis ?? "", kind: row.kind, goal: row.goal, trafficPercent: row.trafficPercent, target: row.target, variants: row.variants });
      if (row.status !== "draft") {
        const r = await api.get<Results>(`/admin/experiments/${row.id}/results`);
        setResults(r);
        setWinnerKey(r.summary.winnerKey ?? row.variants[0]?.key ?? "");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, [isNew, params.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  const status: Status = experiment?.status ?? "draft";
  const structuralLocked = status !== "draft";
  const locked = status === "completed";
  const page = targets?.pages.find((p) => p.id === form.target?.pageId) ?? null;
  const block = page?.blocks.find((b) => b.id === form.target?.blockId) ?? null;

  function patchVariant(index: number, patch: Partial<Variant>) {
    setForm((f) => ({ ...f, variants: f.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)) }));
  }

  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      setNotice(typeof result === "string" && result ? result : message);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const editable = structuralLocked
      ? { name: form.name, hypothesis: form.hypothesis || null, trafficPercent: form.trafficPercent }
      : { name: form.name, hypothesis: form.hypothesis || null, goal: form.goal, trafficPercent: form.trafficPercent, target: form.kind === "offer" ? null : form.target, variants: form.variants };
    if (!isNew) {
      await act(() => api.patch(`/admin/experiments/${params.id}`, editable), t("saved"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<Experiment>("/admin/experiments", { ...editable, kind: form.kind });
      router.replace(`/experiments/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const verdictKind = results?.summary.verdict === "winner" ? "success" : results?.summary.verdict === "collecting" ? "info" : "warning";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/experiments" className="text-xs text-brand hover:underline">
            ← {t("title")}
          </Link>
          <h1 className="text-2xl font-semibold text-surface-foreground">{isNew ? t("new") : form.name}</h1>
          {!isNew && <p className="text-sm text-surface-foreground/60">{t(`status_${status}`)}</p>}
        </div>
        {!isNew && (
          <div className="flex flex-wrap gap-2">
            {(status === "draft" || status === "paused") && (
              <Button disabled={busy} onClick={() => void act(() => api.post(`/admin/experiments/${params.id}/start`), status === "draft" ? t("startedNotice") : t("resumedNotice"))}>
                {status === "draft" ? t("start") : t("resume")}
              </Button>
            )}
            {status === "running" && (
              <Button variant="secondary" disabled={busy} onClick={() => void act(() => api.post(`/admin/experiments/${params.id}/pause`), t("pausedNotice"))}>
                {t("pause")}
              </Button>
            )}
            {(status === "draft" || status === "completed") && (
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(t("deleteConfirm"))) return;
                  void api
                    .delete(`/admin/experiments/${params.id}`)
                    .then(() => router.replace("/experiments"))
                    .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Failed"));
                }}
              >
                {t("delete")}
              </Button>
            )}
          </div>
        )}
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      {results && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-surface-foreground">{t("results")}</h2>
          <Banner kind={verdictKind}>
            {t(`verdict_${results.summary.verdict}`, {
              winner: form.variants.find((v) => v.key === results.summary.winnerKey)?.name ?? results.summary.winnerKey ?? "",
              min: results.minVisitorsPerVariant,
              confidence: results.confidencePercent,
            })}
          </Banner>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-surface-foreground/60">
                  <th className="py-1">{t("variant")}</th>
                  <th>{t("visitors")}</th>
                  <th>{t(`goalCount_${form.goal}`)}</th>
                  <th>{t("rate")}</th>
                  <th>{t("uplift")}</th>
                  <th>{t("pValue")}</th>
                  <th>{t("orders")}</th>
                  <th>{t("revenue")}</th>
                  <th>{t("revenuePerVisitor")}</th>
                </tr>
              </thead>
              <tbody>
                {results.summary.variants.map((v) => {
                  const secondary = results.secondary.find((s) => s.key === v.key);
                  return (
                    <tr key={v.key} className="border-t border-border">
                      <td className="py-2">{form.variants.find((fv) => fv.key === v.key)?.name ?? v.key}</td>
                      <td>{v.visitors}</td>
                      <td>{v.conversions}</td>
                      <td>{pct(v.conversionRate, 2)}</td>
                      <td className={v.significant ? (v.uplift !== null && v.uplift > 0 ? "font-semibold text-success" : "font-semibold text-danger") : undefined}>{v.uplift === null ? "—" : `${v.uplift > 0 ? "+" : ""}${pct(v.uplift)}`}</td>
                      <td>{v.pValue === null ? "—" : v.pValue.toFixed(3)}</td>
                      <td>{secondary?.orders ?? 0}</td>
                      <td>{money(secondary?.revenue ?? 0)}</td>
                      <td>{money(v.revenuePerVisitor)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {results.visitorsNeededPerVariant !== null && <p className="text-xs text-surface-foreground/60">{t("visitorsNeeded", { count: results.visitorsNeededPerVariant })}</p>}

          {(status === "running" || status === "paused") && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <h3 className="text-sm font-semibold">{t("completeTitle")}</h3>
              <div className="flex flex-wrap items-center gap-3">
                <select className={selectClass} value={winnerKey} onChange={(e) => setWinnerKey(e.target.value)}>
                  <option value="">{t("noWinner")}</option>
                  {form.variants.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={applyWinner} onChange={(e) => setApplyWinner(e.target.checked)} disabled={!winnerKey} />
                  {t(`apply_${form.kind}`)}
                </label>
                <Button
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(t("completeConfirm"))) return;
                    void act(async () => {
                      const r = await api.post<{ applied: string | null }>(`/admin/experiments/${params.id}/complete`, { winnerKey: winnerKey || null, apply: Boolean(winnerKey) && applyWinner });
                      return r.applied;
                    }, t("completedNotice"));
                  }}
                >
                  {t("complete")}
                </Button>
              </div>
              {form.kind === "offer" && <p className="text-xs text-warning">{t("offerCompleteWarning")}</p>}
            </div>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-surface-foreground">{t("setup")}</h2>
        {structuralLocked && !locked && <Banner kind="info">{t("lockedHelp")}</Banner>}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={t("name")} value={form.name} disabled={locked} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("kind")}</span>
            <select
              className={selectClass}
              value={form.kind}
              disabled={!isNew}
              onChange={(e) => {
                const kind = e.target.value as Kind;
                setForm({ ...form, kind, goal: DEFAULT_GOAL[kind], target: null, variants: EMPTY_FORM.variants.map((v) => ({ ...v, payload: kind === "offer" ? { discountId: null } : undefined })) });
              }}
            >
              {(["block", "announcement", "offer"] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`kind_${k}`)}
                </option>
              ))}
            </select>
            <span className="text-xs text-surface-foreground/60">{t(`kindHelp_${form.kind}`)}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium">{t("hypothesis")}</span>
            <textarea className={textareaClass} rows={2} value={form.hypothesis} disabled={locked} placeholder={t("hypothesisPlaceholder")} onChange={(e) => setForm({ ...form, hypothesis: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("goal")}</span>
            <select className={selectClass} value={form.goal} disabled={structuralLocked} onChange={(e) => setForm({ ...form, goal: e.target.value as Goal })}>
              {(["purchase", "add_to_cart", "click"] as const).map((g) => (
                <option key={g} value={g}>
                  {t(`goal_${g}`)}
                </option>
              ))}
            </select>
          </label>
          <TextField
            label={t("traffic")}
            type="number"
            min={structuralLocked ? (experiment?.trafficPercent ?? 1) : 1}
            max={100}
            value={form.trafficPercent}
            disabled={locked}
            onChange={(e) => setForm({ ...form, trafficPercent: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
          />
        </div>

        {form.kind === "block" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("page")}</span>
              <select className={selectClass} value={form.target?.pageId ?? ""} disabled={structuralLocked} onChange={(e) => setForm({ ...form, target: { pageId: e.target.value, blockId: "" } })}>
                <option value="">—</option>
                {targets?.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} (/{p.slug})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t("block")}</span>
              <select
                className={selectClass}
                value={form.target?.blockId ?? ""}
                disabled={structuralLocked || !page}
                onChange={(e) => {
                  const chosen = page?.blocks.find((b) => b.id === e.target.value);
                  setForm({
                    ...form,
                    target: { pageId: form.target?.pageId, blockId: e.target.value },
                    // Start every challenger from the block's current props so staff only change what they're testing.
                    variants: form.variants.map((v) => (v.key === "control" || !chosen ? v : { ...v, payload: { props: chosen.props } })),
                  });
                }}
              >
                <option value="">—</option>
                {page?.blocks.map((b, i) => (
                  <option key={b.id} value={b.id}>
                    {i + 1}. {b.type}
                  </option>
                ))}
              </select>
              <span className="text-xs text-surface-foreground/60">{t("publishedOnly")}</span>
            </label>
          </div>
        )}

        {form.kind === "announcement" && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("announcement")}</span>
            <select className={selectClass} value={form.target?.announcementId ?? ""} disabled={structuralLocked} onChange={(e) => setForm({ ...form, target: { announcementId: e.target.value } })}>
              <option value="">—</option>
              {targets?.announcements.map((a) => (
                <option key={a.id} value={a.id}>
                  {textOf(a.message)}
                  {a.isActive ? "" : ` (${t("inactive")})`}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("variants")}</h3>
            {!structuralLocked && form.variants.length < 5 && (
              <Button
                variant="secondary"
                onClick={() => {
                  const key = String.fromCharCode(97 + form.variants.length);
                  setForm({ ...form, variants: [...form.variants, { key, name: key.toUpperCase(), weight: 50, payload: form.kind === "offer" ? { discountId: null } : block ? { props: block.props } : undefined }] });
                }}
              >
                {t("addVariant")}
              </Button>
            )}
          </div>
          {form.variants.map((variant, index) => {
            const isControl = variant.key === "control";
            return (
              <div key={`${variant.key}-${index}`} className="flex flex-col gap-2 rounded-theme border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr_auto] sm:items-end">
                  <TextField label={t("variantKey")} value={variant.key} disabled={isControl || structuralLocked} onChange={(e) => patchVariant(index, { key: e.target.value.toLowerCase() })} />
                  <TextField label={t("variantName")} value={variant.name} disabled={structuralLocked} onChange={(e) => patchVariant(index, { name: e.target.value })} />
                  <TextField label={t("weight")} type="number" min={1} max={100} value={variant.weight} disabled={structuralLocked} onChange={(e) => patchVariant(index, { weight: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })} />
                  {!isControl && !structuralLocked && form.variants.length > 2 && (
                    <Button variant="secondary" onClick={() => setForm({ ...form, variants: form.variants.filter((_, i) => i !== index) })}>
                      {t("remove")}
                    </Button>
                  )}
                </div>
                {isControl && form.kind !== "offer" ? (
                  <p className="text-xs text-surface-foreground/60">{t("controlHelp")}</p>
                ) : (
                  <fieldset disabled={structuralLocked} className="contents">
                    <VariantPayloadEditor key={`${form.target?.blockId ?? ""}-${variant.key}`} kind={form.kind} variant={variant} targets={targets} blockProps={block?.props ?? null} onChange={(payload) => patchVariant(index, { payload })} />
                  </fieldset>
                )}
              </div>
            );
          })}
        </div>

        {!locked && (
          <div>
            <Button disabled={busy || !form.name.trim()} onClick={() => void save()}>
              {isNew ? t("create") : t("save")}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
