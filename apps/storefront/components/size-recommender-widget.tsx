"use client";

import { apiErrorMessage } from "../lib/api-error";

import { useState } from "react";

interface Recommendation {
  size: string;
  confidence: "high" | "medium" | "low";
  matchedColumns: string[];
}

const FIELDS: { key: "heightCm" | "weightKg" | "chestCm" | "waistCm" | "hipCm" | "inseamCm"; bn: string; en: string }[] = [
  { key: "chestCm", bn: "বুক (সেমি)", en: "Chest (cm)" },
  { key: "waistCm", bn: "কোমর (সেমি)", en: "Waist (cm)" },
  { key: "hipCm", bn: "হিপ (সেমি)", en: "Hip (cm)" },
];

/**
 * "Find my size" (docs/PROJECT_SPEC.md §16 M10) — a small inline form, not
 * a full modal, since it's just 2-3 numbers; posts straight to
 * `/store/size-recommender/products/:slug`, which reuses the logged-in
 * customer's saved profile when no override is given here.
 */
export function SizeRecommenderWidget({ slug, locale, onRecommend }: { slug: string; locale: string; onRecommend: (size: string) => void }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Recommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function recommend() {
    setLoading(true);
    setError(null);
    setResult(null);
    const measurements = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
    try {
      const response = await fetch(`/api/v1/store/size-recommender/products/${slug}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.keys(measurements).length > 0 ? { measurements } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(data, "Could not recommend a size"));
      setResult(data as Recommendation);
      onRecommend((data as Recommendation).size);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand underline">
        {locale === "bn" ? "আমার সাইজ খুঁজুন" : "Find my size"}
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-theme border border-border p-3">
      <div className="grid grid-cols-3 gap-2">
        {FIELDS.map(({ key, bn, en }) => (
          <label key={key} className="flex flex-col gap-1 text-xs text-surface-foreground">
            {locale === "bn" ? bn : en}
            <input type="number" value={values[key] ?? ""} onChange={(e) => setValues({ ...values, [key]: e.target.value })} className="rounded border border-border px-2 py-1" />
          </label>
        ))}
      </div>
      <button type="button" onClick={recommend} disabled={loading} className="w-fit rounded-theme bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground disabled:opacity-60">
        {locale === "bn" ? "আমার সাইজ দেখান" : "Show my size"}
      </button>
      {result && (
        <p className="text-xs text-surface-foreground/80">
          {locale === "bn" ? `প্রস্তাবিত সাইজ: ${result.size}` : `Recommended size: ${result.size}`}
          {result.confidence === "low" && <span className="text-surface-foreground/50"> ({locale === "bn" ? "কম নিশ্চিত" : "low confidence"})</span>}
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
