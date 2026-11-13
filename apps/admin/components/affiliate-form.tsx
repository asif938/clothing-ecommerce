"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "../lib/api";
import { parseTaka, takaInput } from "../lib/format";
import { Button, TextField } from "./ui";
import { selectClass, textareaClass } from "./marketing-tabs";

export interface AffiliateValues {
  name: string;
  code: string;
  phone: string | null;
  email: string | null;
  discountId: string | null;
  commissionType: "percent" | "fixed";
  commissionValue: number;
  attributionDays: number | null;
  status: "active" | "paused";
  payoutMethod: string | null;
  payoutDetails: string | null;
  notes: string | null;
}

interface CouponOption {
  id: string;
  name: string;
  code: string | null;
  type: string;
}

/** Create/edit an affiliate (§16 M16). Percent commissions are typed as a percentage and stored in basis points; fixed ones as taka and stored in poisha. */
export function AffiliateForm({ initial, submitLabel, onSubmit }: { initial?: AffiliateValues; submitLabel: string; onSubmit: (values: AffiliateValues) => Promise<void> }) {
  const t = useTranslations("affiliates");
  const [coupons, setCoupons] = useState<CouponOption[]>([]);
  const [form, setForm] = useState(() => ({
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    discountId: initial?.discountId ?? "",
    commissionType: initial?.commissionType ?? ("percent" as const),
    rate: initial ? (initial.commissionType === "percent" ? String(initial.commissionValue / 100) : takaInput(initial.commissionValue)) : "10",
    attributionDays: initial?.attributionDays ? String(initial.attributionDays) : "",
    status: initial?.status ?? ("active" as const),
    payoutMethod: initial?.payoutMethod ?? "",
    payoutDetails: initial?.payoutDetails ?? "",
    notes: initial?.notes ?? "",
  }));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<CouponOption[] | { items: CouponOption[] }>("/admin/discounts")
      .then((r) => setCoupons((Array.isArray(r) ? r : r.items).filter((d) => d.type === "code" && d.code)))
      .catch(() => undefined);
  }, []);

  const commissionValue = form.commissionType === "percent" ? Math.round(Number.parseFloat(form.rate) * 100) : parseTaka(form.rate);
  const valid = form.name.trim() && form.code.trim().length >= 3 && commissionValue !== null && Number.isFinite(commissionValue) && commissionValue >= 0;

  async function submit() {
    if (!valid || commissionValue === null) return;
    setBusy(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        code: form.code.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        discountId: form.discountId || null,
        commissionType: form.commissionType,
        commissionValue,
        attributionDays: form.attributionDays ? Number.parseInt(form.attributionDays, 10) : null,
        status: form.status,
        payoutMethod: form.payoutMethod.trim() || null,
        payoutDetails: form.payoutDetails.trim() || null,
        notes: form.notes.trim() || null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-3">
        <TextField label={t("name")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextField label={t("code")} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="NUSRAT10" />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("status")}</span>
          <select className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "paused" })}>
            <option value="active">{t("status_active")}</option>
            <option value="paused">{t("status_paused")}</option>
          </select>
        </label>
        <TextField label={t("phone")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
        <TextField label={t("email")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("coupon")}</span>
          <select className={selectClass} value={form.discountId} onChange={(e) => setForm({ ...form, discountId: e.target.value })}>
            <option value="">{t("noCoupon")}</option>
            {coupons.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-surface-foreground">{t("commissionType")}</span>
          <select className={selectClass} value={form.commissionType} onChange={(e) => setForm({ ...form, commissionType: e.target.value as "percent" | "fixed" })}>
            <option value="percent">{t("commission_percent")}</option>
            <option value="fixed">{t("commission_fixed")}</option>
          </select>
        </label>
        <TextField label={form.commissionType === "percent" ? t("ratePercent") : t("rateTaka")} value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} inputMode="decimal" />
        <TextField label={t("attributionDays")} value={form.attributionDays} onChange={(e) => setForm({ ...form, attributionDays: e.target.value.replace(/\D/g, "") })} placeholder={t("attributionDefault")} />
        <TextField label={t("payoutMethod")} value={form.payoutMethod} onChange={(e) => setForm({ ...form, payoutMethod: e.target.value })} placeholder="bKash" />
        <TextField label={t("payoutDetails")} value={form.payoutDetails} onChange={(e) => setForm({ ...form, payoutDetails: e.target.value })} placeholder="01XXXXXXXXX" />
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-surface-foreground">{t("notes")}</span>
        <textarea className={textareaClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </label>
      <div>
        <Button disabled={!valid || busy} onClick={() => void submit()}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
