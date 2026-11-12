import type { LocalizedText } from "../i18n/localized-text.ts";

/**
 * RFM scoring (docs/PROJECT_SPEC.md §5.5 `segments` "RFM", §8.2 "RFM presets
 * in phase 2", §16 M13). Each customer with at least one order in the
 * window gets 1–5 scores for Recency (days since last order, lower is
 * better), Frequency (orders) and Monetary (spend), by quintile rank within
 * the store's own customer base — so the scores adapt to a small new shop
 * and a large one alike. Equal values always share a score.
 */

export interface RfmInput {
  id: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
}

export interface RfmScore {
  id: string;
  r: number;
  f: number;
  m: number;
  segment: RfmSegment;
}

export const RFM_SEGMENTS = [
  "champions",
  "loyal",
  "potential_loyalist",
  "new_customers",
  "promising",
  "need_attention",
  "about_to_sleep",
  "at_risk",
  "cant_lose",
  "hibernating",
  "lost",
] as const;
export type RfmSegment = (typeof RFM_SEGMENTS)[number];

export const RFM_SEGMENT_LABELS: Record<RfmSegment, LocalizedText> = {
  champions: { bn: "চ্যাম্পিয়ন", en: "Champions" },
  loyal: { bn: "অনুগত গ্রাহক", en: "Loyal customers" },
  potential_loyalist: { bn: "সম্ভাব্য অনুগত", en: "Potential loyalists" },
  new_customers: { bn: "নতুন গ্রাহক", en: "New customers" },
  promising: { bn: "সম্ভাবনাময়", en: "Promising" },
  need_attention: { bn: "মনোযোগ দরকার", en: "Need attention" },
  about_to_sleep: { bn: "নিষ্ক্রিয় হওয়ার পথে", en: "About to sleep" },
  at_risk: { bn: "হারানোর ঝুঁকিতে", en: "At risk" },
  cant_lose: { bn: "হারানো যাবে না", en: "Can't lose them" },
  hibernating: { bn: "দীর্ঘদিন নিষ্ক্রিয়", en: "Hibernating" },
  lost: { bn: "হারিয়ে যাওয়া", en: "Lost" },
};

/**
 * Quintile scores for `values`: rank ascending, score = floor(rank × 5 / n) + 1,
 * where tied values take the rank of their first occurrence.
 * `higherIsBetter=false` flips the scale (used for recency).
 */
export function quintileScores(values: number[], higherIsBetter = true): number[] {
  const n = values.length;
  if (n === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const firstRank = new Map<number, number>();
  sorted.forEach((v, i) => {
    if (!firstRank.has(v)) firstRank.set(v, i);
  });
  return values.map((v) => {
    const score = Math.min(5, Math.floor((firstRank.get(v)! * 5) / n) + 1);
    return higherIsBetter ? score : 6 - score;
  });
}

/** Segment from R and the F/M average (the common R × FM grid). */
export function rfmSegmentFor(r: number, f: number, m: number): RfmSegment {
  const fm = Math.round((f + m) / 2);
  if (r >= 4 && fm >= 4) return "champions";
  if (r >= 3 && fm >= 4) return "loyal";
  if (r >= 4 && f === 1) return "new_customers";
  if (r >= 4 && fm >= 2) return "potential_loyalist";
  if (r >= 4) return "promising";
  if (r === 3 && fm === 3) return "potential_loyalist";
  if (r === 3) return "need_attention";
  if (r <= 2 && fm >= 4) return r === 1 ? "cant_lose" : "at_risk";
  if (r === 2 && fm === 3) return "at_risk";
  if (r === 2) return "about_to_sleep";
  if (fm >= 2) return "hibernating";
  return "lost";
}

export function scoreRfm(rows: RfmInput[]): RfmScore[] {
  const r = quintileScores(rows.map((row) => row.recencyDays), false);
  const f = quintileScores(rows.map((row) => row.frequency));
  const m = quintileScores(rows.map((row) => row.monetary));
  return rows.map((row, i) => ({ id: row.id, r: r[i]!, f: f[i]!, m: m[i]!, segment: rfmSegmentFor(r[i]!, f[i]!, m[i]!) }));
}
