"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card, TextField, Toggle } from "../../../../../components/ui";
import { MarketingTabs, selectClass, textareaClass } from "../../../../../components/marketing-tabs";

type Channel = "sms" | "whatsapp" | "email" | "push";
type JourneyType = "welcome" | "post_purchase" | "win_back" | "birthday";

interface Step {
  delayHours: number;
  channels: Channel[];
  subjectBn?: string | null;
  subjectEn?: string | null;
  bodyBn: string;
  bodyEn: string;
  couponDiscountId?: string | null;
}

interface Journey {
  id: string;
  name: string;
  type: JourneyType;
  isActive: boolean;
  respectConsent: boolean;
  config: { winBackDays?: number; maxInactiveDays?: number; sendHour?: number };
  steps: Step[];
  enrolledCount: number;
  stats: Record<string, number>;
}

interface DiscountOption {
  id: string;
  name: string;
  type: string;
}

const CHANNELS: Channel[] = ["whatsapp", "sms", "email", "push"];
const TYPES: JourneyType[] = ["welcome", "post_purchase", "win_back", "birthday"];
const NEW_STEP: Step = { delayHours: 24, channels: ["whatsapp", "sms"], bodyBn: "", bodyEn: "", subjectBn: "", subjectEn: "", couponDiscountId: null };

/** Automated journeys (§8.2 Marketing, §16 M13): welcome, review request, win-back, birthday. The master switch is Settings → marketing. */
export default function JourneysPage() {
  const t = useTranslations("journeys");
  const tCommon = useTranslations("common");
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [discounts, setDiscounts] = useState<DiscountOption[]>([]);
  const [editing, setEditing] = useState<Omit<Journey, "id" | "isActive" | "enrolledCount" | "stats"> & { id: string | null }>();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, discountRows] = await Promise.all([api.get<Journey[]>("/admin/marketing/journeys"), api.get<DiscountOption[]>("/admin/discounts").catch(() => [] as DiscountOption[])]);
      setJourneys(rows);
      setDiscounts(discountRows.filter((d) => d.type === "code"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  function updateStep(index: number, patch: Partial<Step>) {
    if (!editing) return;
    setEditing({ ...editing, steps: editing.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  }

  async function save() {
    if (!editing) return;
    const { id, ...body } = editing;
    const payload = { ...body, steps: body.steps.map((s) => ({ ...s, subjectBn: s.subjectBn || null, subjectEn: s.subjectEn || null, couponDiscountId: s.couponDiscountId || null })) };
    await run(async () => {
      if (id) await api.put(`/admin/marketing/journeys/${id}`, payload);
      else await api.post("/admin/marketing/journeys", payload);
      setEditing(undefined);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <MarketingTabs />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
          <p className="text-sm text-surface-foreground/60">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void run(() => api.post("/admin/marketing/journeys/starters"))}>
            {t("addStarters")}
          </Button>
          <Button onClick={() => setEditing({ id: null, name: "", type: "welcome", respectConsent: true, config: {}, steps: [{ ...NEW_STEP, delayHours: 0 }] })}>{t("new")}</Button>
        </div>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      <Banner kind="info">{t("masterSwitch")}</Banner>

      <div className="flex flex-col gap-3">
        {journeys.map((j) => (
          <Card key={j.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-surface-foreground">{j.name}</p>
              <p className="text-xs text-surface-foreground/60">
                {t(`type_${j.type}`)} · {t("stepsCount", { count: j.steps.length })} · {t("enrolled", { count: j.enrolledCount })} · {t("active", { count: j.stats.active ?? 0 })} · {t("completed", { count: j.stats.completed ?? 0 })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Toggle checked={j.isActive} onChange={(v) => void run(() => api.patch(`/admin/marketing/journeys/${j.id}/active`, { isActive: v }))} />
              <button className="text-xs text-brand" onClick={() => setEditing({ id: j.id, name: j.name, type: j.type, respectConsent: j.respectConsent, config: j.config, steps: j.steps })}>
                {tCommon("edit")}
              </button>
              <button className="text-xs text-danger" onClick={() => void run(() => api.delete(`/admin/marketing/journeys/${j.id}`))}>
                {tCommon("delete")}
              </button>
            </div>
          </Card>
        ))}
        {journeys.length === 0 && <p className="text-sm text-surface-foreground/50">{t("empty")}</p>}
      </div>

      {editing && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-surface-foreground">{editing.id ? t("edit") : t("new")}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <TextField label={t("name")} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-surface-foreground">{t("trigger")}</span>
              <select className={selectClass} value={editing.type} disabled={Boolean(editing.id)} onChange={(e) => setEditing({ ...editing, type: e.target.value as JourneyType })}>
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`type_${type}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-surface-foreground">
              <Toggle checked={editing.respectConsent} onChange={(v) => setEditing({ ...editing, respectConsent: v })} />
              {t("respectConsent")}
            </label>
            {editing.type === "win_back" && (
              <>
                <TextField label={t("winBackDays")} inputMode="numeric" value={String(editing.config.winBackDays ?? 60)} onChange={(e) => setEditing({ ...editing, config: { ...editing.config, winBackDays: Number(e.target.value) || 60 } })} />
                <TextField label={t("maxInactiveDays")} inputMode="numeric" value={String(editing.config.maxInactiveDays ?? 365)} onChange={(e) => setEditing({ ...editing, config: { ...editing.config, maxInactiveDays: Number(e.target.value) || 365 } })} />
              </>
            )}
            {editing.type === "birthday" && <TextField label={t("sendHour")} inputMode="numeric" value={String(editing.config.sendHour ?? 10)} onChange={(e) => setEditing({ ...editing, config: { ...editing.config, sendHour: Number(e.target.value) } })} />}
          </div>
          <p className="text-xs text-surface-foreground/60">{t(`typeHelp_${editing.type}`)}</p>
          <p className="text-xs text-surface-foreground/60">{t("variablesHelp")}</p>

          {editing.steps.map((step, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-theme border border-border p-3">
              <div className="flex flex-wrap items-end gap-3">
                <span className="text-sm font-medium text-surface-foreground">{t("step", { n: index + 1 })}</span>
                <TextField label={index === 0 ? t("delayFirst") : t("delayNext")} inputMode="numeric" value={String(step.delayHours)} onChange={(e) => updateStep(index, { delayHours: Number(e.target.value) || 0 })} />
                <div className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-surface-foreground">{t("channels")}</span>
                  <div className="flex gap-2">
                    {CHANNELS.map((c) => (
                      <label key={c} className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={step.channels.includes(c)} onChange={(e) => updateStep(index, { channels: e.target.checked ? [...step.channels, c] : step.channels.filter((x) => x !== c) })} />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-surface-foreground">{t("coupon")}</span>
                  <select className={selectClass} value={step.couponDiscountId ?? ""} onChange={(e) => updateStep(index, { couponDiscountId: e.target.value || null })}>
                    <option value="">{t("noCoupon")}</option>
                    {discounts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                {editing.steps.length > 1 && (
                  <button className="text-xs text-danger" onClick={() => setEditing({ ...editing, steps: editing.steps.filter((_, i) => i !== index) })}>
                    {tCommon("remove")}
                  </button>
                )}
              </div>
              {step.channels.includes("email") && (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <TextField label={t("subjectBn")} value={step.subjectBn ?? ""} onChange={(e) => updateStep(index, { subjectBn: e.target.value })} />
                  <TextField label={t("subjectEn")} value={step.subjectEn ?? ""} onChange={(e) => updateStep(index, { subjectEn: e.target.value })} />
                </div>
              )}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <textarea className={textareaClass} rows={3} placeholder={t("bodyBn")} value={step.bodyBn} onChange={(e) => updateStep(index, { bodyBn: e.target.value })} />
                <textarea className={textareaClass} rows={3} placeholder={t("bodyEn")} value={step.bodyEn} onChange={(e) => updateStep(index, { bodyEn: e.target.value })} />
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing({ ...editing, steps: [...editing.steps, { ...NEW_STEP }] })} disabled={editing.steps.length >= 10}>
              {t("addStep")}
            </Button>
            <Button onClick={() => void save()} disabled={!editing.name || editing.steps.some((s) => !s.bodyBn || !s.bodyEn || s.channels.length === 0)}>
              {tCommon("save")}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(undefined)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
