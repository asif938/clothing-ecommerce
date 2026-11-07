/**
 * Size recommender (docs/PROJECT_SPEC.md §16 M10). A `SizeChart` row
 * (`packages/db` — `{ size, measurements: { [columnKey]: number } }`) is
 * matched against the customer's own body measurements by minimizing a
 * weighted distance over whichever columns both the chart and the customer
 * actually have values for. `preferredFit` shifts the result by one size
 * step rather than changing the distance function — "snug" picks the
 * nearest size at or below the match, "loose" the nearest at or above,
 * "regular" is the plain nearest match. Pure/isomorphic so both the API
 * (the live recommend endpoint) and any future client-side preview can
 * share the exact same logic.
 */
export type FitPreference = "snug" | "regular" | "loose";

export interface SizeChartColumn {
  key: string;
  label?: unknown;
}

export interface SizeChartRow {
  size: string;
  measurements: Record<string, number>;
}

export interface CustomerBodyMeasurements {
  heightCm?: number | null;
  weightKg?: number | null;
  chestCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  inseamCm?: number | null;
}

// Size-chart column keys this recommender knows how to read a customer
// measurement for — a chart may use any column keys for display, but only
// these are ever matched against (brand-neutral: "chest"/"bust" both read
// the same `chestCm` field).
const COLUMN_TO_MEASUREMENT: Record<string, keyof CustomerBodyMeasurements> = {
  chest: "chestCm",
  bust: "chestCm",
  waist: "waistCm",
  hip: "hipCm",
  hips: "hipCm",
  inseam: "inseamCm",
  height: "heightCm",
};

export interface SizeRecommendation {
  size: string;
  confidence: "high" | "medium" | "low";
  matchedColumns: string[];
}

/**
 * Returns `null` when the chart has no rows, or the customer supplied no
 * measurement that matches any of the chart's own columns at all (nothing
 * to recommend from) — the caller falls back to "please select your usual
 * size" in that case.
 */
export function recommendSize(rows: SizeChartRow[], customer: CustomerBodyMeasurements, fitPreference: FitPreference = "regular"): SizeRecommendation | null {
  if (rows.length === 0) return null;

  type Scored = { row: SizeChartRow; distance: number; matchedColumns: string[] };
  const scored: Scored[] = [];

  for (const row of rows) {
    let sumSquared = 0;
    const matchedColumns: string[] = [];
    for (const [columnKey, chartValue] of Object.entries(row.measurements)) {
      const measurementKey = COLUMN_TO_MEASUREMENT[columnKey.toLowerCase()];
      if (!measurementKey) continue;
      const customerValue = customer[measurementKey];
      if (customerValue === null || customerValue === undefined) continue;
      sumSquared += (customerValue - chartValue) ** 2;
      matchedColumns.push(columnKey);
    }
    if (matchedColumns.length === 0) continue;
    scored.push({ row, distance: Math.sqrt(sumSquared / matchedColumns.length), matchedColumns });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => a.distance - b.distance);
  const best = scored[0]!;

  let chosen = best;
  if (fitPreference !== "regular") {
    const bestIndexInRows = rows.indexOf(best.row);
    const neighborIndex = fitPreference === "snug" ? bestIndexInRows - 1 : bestIndexInRows + 1;
    const neighborRow = rows[neighborIndex];
    const neighborScored = neighborRow ? scored.find((s) => s.row === neighborRow) : undefined;
    if (neighborScored) chosen = neighborScored;
  }

  // Confidence is a simple function of how many of the chart's own columns
  // were actually matched and how close the best match was — not a
  // statistical measure, just enough to tell the customer "we're not sure"
  // versus "this is a solid match".
  const columnCoverage = chosen.matchedColumns.length;
  const confidence: SizeRecommendation["confidence"] = chosen.distance <= 2 && columnCoverage >= 2 ? "high" : chosen.distance <= 6 ? "medium" : "low";

  return { size: chosen.row.size, confidence, matchedColumns: chosen.matchedColumns };
}
