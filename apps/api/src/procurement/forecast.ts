/**
 * Demand forecasting and reorder maths (docs/PROJECT_SPEC.md §8.2 Inventory
 * "reorder suggestions", §16 M17). Pure and integer-friendly: the service
 * loads the sales history, this does the arithmetic so every rule is
 * unit-tested (golden rule 10).
 *
 * The forecast is deliberately simple and explainable — a blend of a
 * recency-weighted average and plain averages, nudged by the recent trend —
 * because a clothing shop with a few hundred SKUs has too little history per
 * variant for anything fancier to beat it. It does not model seasonality or
 * correct for days a variant was out of stock (those understate demand);
 * both limitations are called out in the admin UI.
 */

const EWMA_HALF_LIFE_DAYS = 14;
const TREND_WINDOW_DAYS = 14;
const RECENT_MEAN_DAYS = 30;

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export type ForecastConfidence = "none" | "low" | "medium" | "high";

export interface DemandForecast {
  /** Expected units per day going forward. */
  dailyRate: number;
  /** recent ÷ prior window (1 = flat); null without enough history to compare. */
  trend: number | null;
  /** Expected units over `horizonDays`. */
  forecastUnits: number;
  totalUnits: number;
  historyDays: number;
  confidence: ForecastConfidence;
}

/**
 * `daily` is units sold per day, oldest first, one entry per calendar day
 * (zeros included — a slow variant's quiet days are information).
 */
export function forecastDemand(daily: number[], horizonDays: number): DemandForecast {
  const days = daily.length;
  const totalUnits = daily.reduce((a, b) => a + b, 0);
  if (days === 0 || totalUnits === 0) {
    return { dailyRate: 0, trend: null, forecastUnits: 0, totalUnits, historyDays: days, confidence: "none" };
  }

  // Recency-weighted average; seeded with the first week's mean so a single
  // early spike doesn't dominate.
  const alpha = 1 - Math.pow(0.5, 1 / EWMA_HALF_LIFE_DAYS);
  let ewma = mean(daily.slice(0, Math.min(7, days)));
  for (const value of daily) ewma = alpha * value + (1 - alpha) * ewma;

  let rate = 0.5 * ewma + 0.3 * mean(daily.slice(-RECENT_MEAN_DAYS)) + 0.2 * mean(daily);

  let trend: number | null = null;
  if (days >= TREND_WINDOW_DAYS * 2) {
    const recent = mean(daily.slice(-TREND_WINDOW_DAYS));
    const prior = mean(daily.slice(-TREND_WINDOW_DAYS * 2, -TREND_WINDOW_DAYS));
    if (prior > 0) {
      trend = recent / prior;
      // Half-weight, clamped: one hot fortnight shouldn't double the order.
      const clamped = Math.min(1.5, Math.max(0.5, trend));
      rate *= 1 + (clamped - 1) * 0.5;
    }
  }

  const confidence: ForecastConfidence = totalUnits >= 30 && days >= 60 ? "high" : totalUnits >= 10 ? "medium" : "low";
  return { dailyRate: rate, trend, forecastUnits: Math.round(rate * horizonDays), totalUnits, historyDays: days, confidence };
}

export type ReorderUrgency = "critical" | "soon" | "ok" | "no_demand";

export interface ReorderInput {
  onHand: number;
  /** Units on open purchase/production orders not yet received. */
  incoming: number;
  dailyRate: number;
  leadTimeDays: number;
  safetyStockDays: number;
  /** Days of sales the stock should last after the new order arrives. */
  coverDays: number;
  /** Order in multiples of this (carton / pack size). */
  packSize?: number;
  /** Smallest order the supplier accepts; applied to any non-zero order. */
  minOrderQty?: number;
}

export interface ReorderSuggestion {
  /** Days the current on-hand stock lasts at the forecast rate; null with no demand. */
  daysOfCover: number | null;
  reorderPoint: number;
  targetStock: number;
  suggestedQty: number;
  urgency: ReorderUrgency;
}

/**
 * Classic reorder-point policy: order when on-hand + incoming falls to the
 * demand expected during the lead time plus safety stock, and order enough
 * to cover `leadTimeDays + coverDays` of demand plus safety stock.
 */
export function suggestReorder(input: ReorderInput): ReorderSuggestion {
  const rate = Math.max(0, input.dailyRate);
  if (rate === 0) return { daysOfCover: null, reorderPoint: 0, targetStock: 0, suggestedQty: 0, urgency: "no_demand" };

  const onHand = Math.max(0, input.onHand);
  const position = onHand + Math.max(0, input.incoming);
  const safety = rate * input.safetyStockDays;
  const reorderPoint = Math.ceil(rate * input.leadTimeDays + safety);
  const targetStock = Math.ceil(rate * (input.leadTimeDays + input.coverDays) + safety);
  const daysOfCover = onHand / rate;

  let suggestedQty = 0;
  let urgency: ReorderUrgency = "ok";
  if (position <= reorderPoint) {
    suggestedQty = Math.max(0, targetStock - position);
    // Stock runs out before a fresh order could possibly arrive.
    urgency = daysOfCover < input.leadTimeDays ? "critical" : "soon";
  }
  if (suggestedQty > 0) {
    const pack = Math.max(1, Math.floor(input.packSize ?? 1));
    suggestedQty = Math.ceil(suggestedQty / pack) * pack;
    if (input.minOrderQty && suggestedQty < input.minOrderQty) suggestedQty = Math.ceil(input.minOrderQty / pack) * pack;
  }
  return { daysOfCover, reorderPoint, targetStock, suggestedQty, urgency };
}

const URGENCY_ORDER: Record<ReorderUrgency, number> = { critical: 0, soon: 1, ok: 2, no_demand: 3 };

/** Most urgent first, then the one that runs out soonest. */
export function compareUrgency(a: { urgency: ReorderUrgency; daysOfCover: number | null }, b: { urgency: ReorderUrgency; daysOfCover: number | null }): number {
  return URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity);
}
