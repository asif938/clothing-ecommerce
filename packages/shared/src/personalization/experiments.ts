import { z } from "zod";
import { localizedTextSchema } from "../i18n/localized-text.ts";

/**
 * A/B testing (docs/PROJECT_SPEC.md §9.1 block `variants?`, §16 M14 "A/B
 * testing framework for blocks/banners/offers"). Assignment is a pure
 * function of (experiment id, visitor id), so the API and any client agree
 * without storing an assignment first, and a visitor keeps their variant
 * for the life of their `anonymous_id` cookie.
 */

export const EXPERIMENT_KINDS = ["block", "announcement", "offer"] as const;
export type ExperimentKind = (typeof EXPERIMENT_KINDS)[number];

export const EXPERIMENT_GOALS = ["purchase", "add_to_cart", "click"] as const;
export type ExperimentGoal = (typeof EXPERIMENT_GOALS)[number];

export const EXPERIMENT_STATUSES = ["draft", "running", "paused", "completed"] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const CONTROL_KEY = "control";

const variantKey = z
  .string()
  .trim()
  .regex(/^[a-z0-9_-]{1,32}$/, "Use 1–32 lowercase letters, digits, - or _");

export const announcementVariantPayloadSchema = z.object({
  message: localizedTextSchema,
  linkText: localizedTextSchema.nullable().optional(),
  linkUrl: z.string().trim().max(500).nullable().optional(),
});
export type AnnouncementVariantPayload = z.infer<typeof announcementVariantPayloadSchema>;

export const offerVariantPayloadSchema = z.object({
  /** null = "no offer" (a typical control). */
  discountId: z.string().min(1).nullable(),
  /** Optional strip shown to visitors in this variant (e.g. "Free delivery today"). */
  message: localizedTextSchema.nullable().optional(),
});
export type OfferVariantPayload = z.infer<typeof offerVariantPayloadSchema>;

/** Block variants carry replacement props; they're validated against the block type's own schema by the API. */
export const blockVariantPayloadSchema = z.object({ props: z.record(z.string(), z.unknown()) });
export type BlockVariantPayload = z.infer<typeof blockVariantPayloadSchema>;

export const experimentVariantSchema = z.object({
  key: variantKey,
  name: z.string().trim().min(1).max(80),
  weight: z.number().int().min(1).max(100),
  /** Kind-specific; the control of a block/announcement experiment has none (it is the original). */
  payload: z.unknown().optional(),
});
export type ExperimentVariant = z.infer<typeof experimentVariantSchema>;

export const blockTargetSchema = z.object({ pageId: z.string().min(1), blockId: z.string().min(1) });
export const announcementTargetSchema = z.object({ announcementId: z.string().min(1) });
export type BlockTarget = z.infer<typeof blockTargetSchema>;
export type AnnouncementTarget = z.infer<typeof announcementTargetSchema>;

/** Checks the variant list itself; kind-specific payload checks live with each kind (they need the database). */
export function variantListProblems(kind: ExperimentKind, variants: ExperimentVariant[]): string[] {
  const problems: string[] = [];
  if (variants.length < 2) problems.push("An experiment needs a control and at least one other variant.");
  if (variants.length > 5) problems.push("At most 5 variants.");
  if (variants[0]?.key !== CONTROL_KEY) problems.push(`The first variant must be the control (key "${CONTROL_KEY}").`);
  const keys = new Set<string>();
  for (const variant of variants) {
    if (keys.has(variant.key)) problems.push(`Duplicate variant key "${variant.key}".`);
    keys.add(variant.key);
    const isControl = variant.key === CONTROL_KEY;
    if (kind === "block" && !isControl && !blockVariantPayloadSchema.safeParse(variant.payload).success) problems.push(`Variant "${variant.key}" needs block props.`);
    if (kind === "announcement" && !isControl && !announcementVariantPayloadSchema.safeParse(variant.payload).success) problems.push(`Variant "${variant.key}" needs a message.`);
    if (kind === "offer" && !offerVariantPayloadSchema.safeParse(variant.payload ?? { discountId: null }).success) problems.push(`Variant "${variant.key}" has an invalid offer.`);
  }
  return problems;
}

/** 32-bit FNV-1a — tiny, fast, stable across runtimes; plenty for bucketing. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface AssignableExperiment {
  id: string;
  trafficPercent: number;
  variants: { key: string; weight: number }[];
}

/**
 * The visitor's variant, or null when they fall outside `trafficPercent`
 * (they see the control and aren't counted). Traffic and split use
 * different hash salts, so raising traffic from 20% to 50% only adds
 * visitors — nobody already in the test changes variant.
 */
export function assignVariant(experiment: AssignableExperiment, visitorId: string): string | null {
  if (!visitorId || experiment.variants.length === 0) return null;
  const trafficBucket = fnv1a32(`${experiment.id}:traffic:${visitorId}`) % 100;
  if (trafficBucket >= experiment.trafficPercent) return null;
  const totalWeight = experiment.variants.reduce((sum, v) => sum + Math.max(0, v.weight), 0);
  if (totalWeight <= 0) return null;
  const point = ((fnv1a32(`${experiment.id}:variant:${visitorId}`) % 10_000) / 10_000) * totalWeight;
  let cumulative = 0;
  for (const variant of experiment.variants) {
    cumulative += Math.max(0, variant.weight);
    if (point < cumulative) return variant.key;
  }
  return experiment.variants[experiment.variants.length - 1]!.key;
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/** Inverse standard normal CDF (Acklam's rational approximation, relative error < 1.2e-9). */
export function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError("p must be in (0, 1)");
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 1 - low) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/** Two-sided two-proportion z-test of B against A. */
export function twoProportionZTest(conversionsA: number, visitorsA: number, conversionsB: number, visitorsB: number): { z: number; pValue: number } {
  if (visitorsA <= 0 || visitorsB <= 0) return { z: 0, pValue: 1 };
  const pooled = (conversionsA + conversionsB) / (visitorsA + visitorsB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / visitorsA + 1 / visitorsB));
  if (se === 0) return { z: 0, pValue: 1 };
  const z = (conversionsB / visitorsB - conversionsA / visitorsA) / se;
  return { z, pValue: Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))) };
}

/**
 * Visitors needed per variant to detect a relative uplift of
 * `minDetectableUplift` (0.1 = +10%) over `baselineRate` at the given
 * two-sided confidence and 80% power. Null when the inputs can't produce
 * a meaningful number (no baseline yet).
 */
export function requiredVisitorsPerVariant(baselineRate: number, minDetectableUplift: number, confidencePercent: number, power = 0.8): number | null {
  if (baselineRate <= 0 || baselineRate >= 1 || minDetectableUplift <= 0) return null;
  const p1 = baselineRate;
  const p2 = Math.min(0.9999, baselineRate * (1 + minDetectableUplift));
  const zAlpha = normalQuantile(1 - (1 - confidencePercent / 100) / 2);
  const zBeta = normalQuantile(power);
  const pBar = (p1 + p2) / 2;
  const n = Math.pow(zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) / Math.pow(p2 - p1, 2);
  return Math.ceil(n);
}

export interface VariantStats {
  key: string;
  visitors: number;
  conversions: number;
  /** Poisha, summed over converting orders (purchase goal); 0 for other goals. */
  revenue: number;
}

export interface VariantResult extends VariantStats {
  conversionRate: number;
  revenuePerVisitor: number;
  /** Relative change vs control (0.12 = +12%); null for the control or when control converts at 0. */
  uplift: number | null;
  pValue: number | null;
  significant: boolean;
}

export type ExperimentVerdict = "collecting" | "winner" | "control_better" | "no_difference";

export interface ExperimentSummary {
  variants: VariantResult[];
  verdict: ExperimentVerdict;
  winnerKey: string | null;
  /** Per-comparison alpha after the Bonferroni correction for several variants. */
  alpha: number;
}

/**
 * Compares every variant with the control. With more than one challenger
 * the significance threshold is Bonferroni-corrected (alpha / challengers),
 * so testing four variants doesn't quadruple the false-positive rate. No
 * verdict until every variant has `minVisitors`.
 */
export function summarizeExperiment(stats: VariantStats[], confidencePercent: number, minVisitors: number): ExperimentSummary {
  const control = stats.find((s) => s.key === CONTROL_KEY) ?? stats[0];
  const challengers = Math.max(1, stats.length - 1);
  const alpha = (1 - confidencePercent / 100) / challengers;
  const rate = (s: VariantStats) => (s.visitors > 0 ? s.conversions / s.visitors : 0);

  const variants: VariantResult[] = stats.map((s) => {
    const isControl = control !== undefined && s.key === control.key;
    const base = { ...s, conversionRate: rate(s), revenuePerVisitor: s.visitors > 0 ? Math.round(s.revenue / s.visitors) : 0 };
    if (isControl || !control) return { ...base, uplift: null, pValue: null, significant: false };
    const controlRate = rate(control);
    const { pValue } = twoProportionZTest(control.conversions, control.visitors, s.conversions, s.visitors);
    return { ...base, uplift: controlRate > 0 ? (rate(s) - controlRate) / controlRate : null, pValue, significant: pValue < alpha };
  });

  if (stats.length < 2 || stats.some((s) => s.visitors < minVisitors)) return { variants, verdict: "collecting", winnerKey: null, alpha };

  const controlRate = control ? rate(control) : 0;
  const winners = variants.filter((v) => v.significant && v.conversionRate > controlRate).sort((a, b) => b.conversionRate - a.conversionRate);
  if (winners.length > 0) return { variants, verdict: "winner", winnerKey: winners[0]!.key, alpha };
  const challengersOnly = variants.filter((v) => v.key !== control?.key);
  if (challengersOnly.length > 0 && challengersOnly.every((v) => v.significant && v.conversionRate < controlRate)) {
    return { variants, verdict: "control_better", winnerKey: control?.key ?? null, alpha };
  }
  return { variants, verdict: "no_difference", winnerKey: null, alpha };
}
