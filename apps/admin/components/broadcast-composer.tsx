"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../lib/api";
import { localized, money } from "../lib/format";
import { Banner, Button, TextField } from "./ui";
import { selectClass, textareaClass } from "./marketing-tabs";

export interface BroadcastForm {
  name: string;
  channel: "sms" | "whatsapp" | "email" | "push";
  segmentId: string | null;
  subjectBn: string | null;
  subjectEn: string | null;
  bodyBn: string;
  bodyEn: string;
  discountId: string | null;
  codePrefix: string | null;
}

interface Estimate {
  recipients: number;
  segments: { bn: number; en: number };
  encoding: { bn: string | null; en: string | null };
  totalCost: number;
}

export const EMPTY_BROADCAST: BroadcastForm = { name: "", channel: "sms", segmentId: null, subjectBn: null, subjectEn: null, bodyBn: "", bodyEn: "", discountId: null, codePrefix: null };

/** Broadcast composer with a live recipient/cost estimate (§8.2 Marketing "cost estimate", §16 M13). */
export function BroadcastComposer({ initial, onSave, saveLabel }: { initial: BroadcastForm; onSave: (form: BroadcastForm) => Promise<void>; saveLabel: string }) {
  const t = useTranslations("broadcasts");
  const locale = useLocale();
  const [form, setForm] = useState<BroadcastForm>(initial);
  const [segments, setSegments] = useState<{ id: string; name: { bn?: string; en?: string } }[]>([]);
  const [discounts, setDiscounts] = useState<{ id: string; name: string; type: string }[]>([]);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.get<typeof segments>("/admin/segments").catch(() => []), api.get<typeof discounts>("/admin/discounts").catch(() => [])]).then(([s, d]) => {
      setSegments(s);
      setDiscounts(d.filter((x) => x.type === "code"));
    });
  }, []);

  useEffect(() => {
    if (!form.bodyBn || !form.bodyEn) return;
    const handle = setTimeout(() => {
      api
        .post<Estimate>("/admin/marketing/broadcasts/estimate", { ...form, name: form.name || "draft", subjectBn: form.subjectBn || "-", subjectEn: form.subjectEn || "-" })
        .then(setEstimate)
        .catch(() => setEstimate(null));
    }, 500);
    return () => clearTimeout(handle);
  }, [form]);

  async function save() {
    setError(null);
    try {
      await onSave({ ...form, subjectBn: form.subjectBn || null, subjectEn: form.subjectEn || null, codePrefix: form.codePrefix || null });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Banner kind="error">{error}</Banner>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <TextField label={t("name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("channel")}</span>
          <select className={selectClass} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as BroadcastForm["channel"] })}>
            {(["sms", "whatsapp", "email", "push"] as const).map((c) => (
              <option key={c} value={c}>
                {t(`channel_${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("audience")}</span>
          <select className={selectClass} value={form.segmentId ?? ""} onChange={(e) => setForm({ ...form, segmentId: e.target.value || null })}>
            <option value="">{t("everyoneConsented")}</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {localized(s.name, locale)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {form.channel === "email" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <TextField label={t("subjectBn")} value={form.subjectBn ?? ""} onChange={(e) => setForm({ ...form, subjectBn: e.target.value })} />
          <TextField label={t("subjectEn")} value={form.subjectEn ?? ""} onChange={(e) => setForm({ ...form, subjectEn: e.target.value })} />
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("bodyBn")}</span>
          <textarea className={textareaClass} rows={4} value={form.bodyBn} onChange={(e) => setForm({ ...form, bodyBn: e.target.value })} />
          <span className="text-xs text-surface-foreground/50">{t("chars", { count: form.bodyBn.length })}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("bodyEn")}</span>
          <textarea className={textareaClass} rows={4} value={form.bodyEn} onChange={(e) => setForm({ ...form, bodyEn: e.target.value })} />
          <span className="text-xs text-surface-foreground/50">{t("chars", { count: form.bodyEn.length })}</span>
        </label>
      </div>
      <p className="text-xs text-surface-foreground/60">{t("variablesHelp")}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("uniqueCodes")}</span>
          <select className={selectClass} value={form.discountId ?? ""} onChange={(e) => setForm({ ...form, discountId: e.target.value || null })}>
            <option value="">{t("noCodes")}</option>
            {discounts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-surface-foreground/50">{t("uniqueCodesHelp")}</span>
        </label>
        {form.discountId && <TextField label={t("codePrefix")} value={form.codePrefix ?? ""} onChange={(e) => setForm({ ...form, codePrefix: e.target.value.toUpperCase() })} placeholder="EID" />}
      </div>
      {estimate && (
        <Banner kind="info">
          {t("estimate", { recipients: estimate.recipients, cost: money(estimate.totalCost) })}
          {form.channel === "sms" && ` ${t("segmentsInfo", { bn: estimate.segments.bn, en: estimate.segments.en })}`}
        </Banner>
      )}
      <Button className="self-start" onClick={() => void save()} disabled={!form.name || !form.bodyBn || !form.bodyEn}>
        {saveLabel}
      </Button>
    </div>
  );
}
