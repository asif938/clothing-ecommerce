"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "../i18n/navigation";
import { me } from "../lib/account-api";
import { myMeasurements, saveMeasurements, type CustomerMeasurements } from "../lib/account-api";
import { AccountSkeleton } from "./skeletons";

const EMPTY: CustomerMeasurements = { unit: "cm", heightCm: null, weightKg: null, chestCm: null, waistCm: null, hipCm: null, inseamCm: null, preferredFit: "regular" };

const FIELD_LABELS: { key: keyof CustomerMeasurements; bn: string; en: string }[] = [
  { key: "heightCm", bn: "উচ্চতা (সেমি)", en: "Height (cm)" },
  { key: "weightKg", bn: "ওজন (কেজি)", en: "Weight (kg)" },
  { key: "chestCm", bn: "বুকের মাপ (সেমি)", en: "Chest (cm)" },
  { key: "waistCm", bn: "কোমরের মাপ (সেমি)", en: "Waist (cm)" },
  { key: "hipCm", bn: "হিপের মাপ (সেমি)", en: "Hip (cm)" },
  { key: "inseamCm", bn: "ইনসিম (সেমি)", en: "Inseam (cm)" },
];

/** §16 M10 size recommender — the saved profile every product's "Find my size" widget reuses by default. */
export function AccountMeasurementsView() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale ?? "bn";
  const router = useRouter();
  const [form, setForm] = useState<CustomerMeasurements>(EMPTY);
  const [checked, setChecked] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    me().then((result) => {
      if (!result.loggedIn) {
        router.replace("/account/login");
        return;
      }
      myMeasurements()
        .then((existing) => existing && setForm(existing))
        .finally(() => setChecked(true));
    });
  }, [router]);

  if (!checked) return <AccountSkeleton />;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    await saveMeasurements(form);
    setSaved(true);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-surface-foreground">{locale === "bn" ? "আমার মাপ" : "My measurements"}</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {FIELD_LABELS.map(({ key, bn, en }) => (
          <label key={key} className="flex flex-col gap-1 text-sm text-surface-foreground">
            {locale === "bn" ? bn : en}
            <input
              type="number"
              step="0.1"
              value={(form[key] as number | null) ?? ""}
              onChange={(e) => setForm({ ...form, [key]: e.target.value === "" ? null : Number(e.target.value) })}
              className="rounded-theme border border-border px-3 py-2"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-sm text-surface-foreground">
          {locale === "bn" ? "পছন্দের ফিট" : "Preferred fit"}
          <select value={form.preferredFit} onChange={(e) => setForm({ ...form, preferredFit: e.target.value as CustomerMeasurements["preferredFit"] })} className="rounded-theme border border-border px-3 py-2">
            <option value="snug">{locale === "bn" ? "টাইট" : "Snug"}</option>
            <option value="regular">{locale === "bn" ? "নিয়মিত" : "Regular"}</option>
            <option value="loose">{locale === "bn" ? "ঢিলা" : "Loose"}</option>
          </select>
        </label>
        <button type="submit" className="rounded-theme bg-brand px-4 py-2 text-sm font-medium text-brand-foreground">
          {locale === "bn" ? "সংরক্ষণ করুন" : "Save"}
        </button>
        {saved && <p className="text-sm text-surface-foreground/70">{locale === "bn" ? "সংরক্ষিত হয়েছে।" : "Saved."}</p>}
      </form>
    </div>
  );
}
